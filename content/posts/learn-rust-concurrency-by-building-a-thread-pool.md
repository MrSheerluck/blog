+++
title = "Learn Rust Concurrency By Building a Thread Pool"
description = "In this post, we are going to learn about concurrency and threads in Rust. Once we cover all the concepts, we will build a Thread Pool in Rust"
date = 2026-06-12
transparent = true

[taxonomies]
tags = ["rust", "project"]
series = ["learning-rust"]

[extra]
hidden = true
+++



In this post, we are going to learn about concurrency in Rust. We will learn about OS threads, message passing with channels, shared mutable state with `Arc<Mutex<T>>`, and graceful shutdown. Once we cover all the concepts, we will build a **Thread Pool from Scratch**, a fixed number of worker threads, a job queue behind `Arc<Mutex<>>`, an `mpsc` channel for dispatching tasks, graceful shutdown that processes remaining queued jobs before exiting, and backpressure when the queue is full. I am really excited for this project and I hope you are too. I won't go too deep in theory, just practical and we will build our knowledge of these concepts over time with more articles.

The only prerequisite is that you have read the previous articles in this series, as I will assume you know ownership, borrowing, structs, enums, pattern matching, error handling, generics, traits, lifetimes, HashMap, iterators, closures, and smart pointers.

In the last article, we learned about `Rc` and `RefCell` for shared mutable state in single-threaded code. I teased that the smart pointer family has one more member: `Arc<T>`, the atomic reference counter for multi-threaded code. Today we will cover `Arc` together with `Mutex` and concurrency primitives, and we will build a thread pool that puts all of it to work.

Get the source code from [here](https://github.com/MrSheerluck/threadpool)
## What Is a Thread Pool

Think of a restaurant kitchen. You have a fixed number of chefs. Orders come in, and each chef picks up the next available order, cooks it, and goes back to wait for the next one. You do not hire a new chef for every order and fire them afterwards, that would be wasteful. You also do not let the order queue grow infinitely, if the kitchen is too backed up, you tell the front of house to wait before sending more orders.

A thread pool is the same idea. You spawn a fixed number of worker threads once, and they live for the lifetime of the pool. Jobs are sent to the pool through a channel. Idle workers receive jobs from the shared receiver. When the pool shuts down, workers continue processing queued jobs until the channel becomes empty and disconnected, then exit cleanly. If the queue is full, the sender blocks until there is space.
## Spawning Threads

Let's start with the basics. Create a new project:

```bash
cargo new threadpool
cd threadpool
```

Open `src/main.rs` and replace everything with:

```rust
use std::thread;
use std::time::Duration;

fn main() {
    let handle = thread::spawn(|| {
        for i in 1..=5 {
            println!("spawned thread: {}", i);
            thread::sleep(Duration::from_millis(100));
        }
    });

    for i in 1..=3 {
        println!("main thread: {}", i);
        thread::sleep(Duration::from_millis(150));
    }

    handle.join().unwrap();
}
```

Run it:

```bash
cargo run
```

You will see output from both threads interleaved. Something like:

```bash
main thread: 1
spawned thread: 1
spawned thread: 2
main thread: 2
spawned thread: 3
main thread: 3
spawned thread: 4
spawned thread: 5
```

Now, let me explain what we just did.

`thread::spawn` takes a closure and runs it on a brand new OS thread. The OS scheduler decides when each thread runs, so the output is interleaved unpredictably. `thread::spawn` returns a `JoinHandle<T>` where `T` is whatever the closure returns. The handle's `.join()` method blocks the calling thread until the spawned thread finishes. We call `.unwrap()` on `.join()` because if the spawned thread panicked, `join` returns the panic payload as an `Err`. The spawned thread gets five iterations with 100ms sleeps, while the main thread runs three iterations with 150ms sleeps. Even though main finishes its loop first, it blocks on `handle.join()` until the spawned thread is done.
## Threads Need Ownership: `move` Closures

In the example above the closure captures nothing. Let's try capturing a variable:

```rust
fn main() {
    let name = String::from("worker");

    let handle = thread::spawn(|| {
        println!("hello from {}", name);
    });

    handle.join().unwrap();
}
```

Try to compile this. You will get an error:

```bash
error[E0373]: closure may outlive the current function, but it borrows `name`,
which is owned by the current function
```

The compiler is telling us something important about threads: the spawned thread could outlive the scope that owns `name`. If `main` finishes and drops `name` while the spawned thread is still running, the reference would dangle. Rust prevents this at compile time.

The fix is the `move` keyword:

```rust
let handle = thread::spawn(move || {
    println!("hello from {}", name);
});
```

We already learned about `move` in the closures article. The `move` keyword forces the closure to take ownership of every variable it captures. `name` moves into the closure. It is no longer accessible in `main` after `spawn`. The spawned thread now owns the string and can use it safely for as long as it runs.

This is the core rule of threads: anything a thread uses must either be owned by the thread, or be guaranteed to outlive the thread (like a `&'static str` literal).
## Message Passing with `mpsc`

Threads need to communicate. Rust provides channels in `std::sync::mpsc`. The name stands for multiple producer, single consumer. You can clone the `Sender` and send messages from many threads, but there is only one `Receiver`.

Here is a minimal example:

```rust
use std::sync::mpsc;
use std::thread;

fn main() {
    let (tx, rx) = mpsc::channel();

    thread::spawn(move || {
        tx.send(String::from("hello from the spawned thread")).unwrap();
    });

    let msg = rx.recv().unwrap();
    println!("received: {}", msg);
}
```

Now, let me explain what we just did.

`mpsc::channel()` returns a `(Sender<T>, Receiver<T>)` tuple. `T` is inferred from the first `send` call. `Sender::send` takes ownership of the message being sent, but only borrows the sender itself. A single sender can be reused to send many messages. If you want multiple threads to send messages concurrently, you can call `clone()` on the sender to create additional sending handles. `Receiver::recv` blocks the calling thread until a message arrives. It returns `Result<T, RecvError>`, where the error means all senders have been dropped and the channel is closed.

There are other methods on `Receiver`:

| Method | Behaviour |
|---|---|
| `recv()` | Blocks until a message is available. Returns `Err(RecvError)` if all senders are dropped. |
| `try_recv()` | Does not block. Returns `Ok(msg)`, `Err(TryRecvError::Empty)`, or `Err(TryRecvError::Disconnected)`. |
| `iter()` | Returns an iterator that yields messages until the channel is closed. This is how workers will loop. |

`Sender::send` also has a counterpart:

```rust
let (tx, rx) = mpsc::sync_channel(2); // bounded channel, capacity 2
```

A `sync_channel` has a fixed capacity. When the channel is full, `send` blocks the calling thread until space is freed. This is how we implement backpressure: the producer is forced to wait if the workers are overwhelmed.
## Multiple Producers

`Sender` implements `Clone`. Here is a pattern with two sending threads:

```rust
use std::sync::mpsc;
use std::thread;

fn main() {
    let (tx, rx) = mpsc::channel();

    let tx1 = tx.clone();
    thread::spawn(move || {
        for i in 0..3 {
            tx1.send(i).unwrap();
        }
    });

    thread::spawn(move || {
        for i in 10..13 {
            tx.send(i).unwrap();
        }
    });

    for msg in rx {
        println!("received: {}", msg);
    }
}
```

Now, let me explain what we just did.

`tx.clone()` creates a second sender. Both threads send messages. The main thread uses `for msg in rx` to iterate over the receiver. This loop runs until all senders are dropped and the channel is empty, at which point the iterator ends and the loop exits. You do not need to know how many messages there are ahead of time. The channel closing is detected automatically.
## Arc: The Thread-Safe Rc

In the smart pointers article, we learned about `Rc<T>` for shared ownership in single-threaded code. `Rc` uses non-atomic reference counting, which is faster but not safe across threads. The compiler enforces this: `Rc` does not implement `Send` or `Sync`, so you cannot send an `Rc` to another thread.

`Arc<T>` - Atomic Reference Counted is the thread-safe version. It uses atomic operations for the reference count, which are slightly slower than `Rc`'s non-atomic counter, but safe across threads. The usage is identical:

```rust
use std::sync::Arc;
use std::thread;

fn main() {
    let data = Arc::new(vec![1, 2, 3]);

    let data1 = Arc::clone(&data);
    let handle1 = thread::spawn(move || {
        println!("thread 1: {:?}", data1);
    });

    let data2 = Arc::clone(&data);
    let handle2 = thread::spawn(move || {
        println!("thread 2: {:?}", data2);
    });

    handle1.join().unwrap();
    handle2.join().unwrap();
}
```

Now, let me explain what we just did.

`Arc::new` allocates a reference-counted allocation containing the value and returns an `Arc` handle to it. `Arc::clone` increments the atomic reference count and returns another handle to the same allocation. Unlike `Rc`, `Arc::clone` does not actually deep-clone the data - it just increments the counter. `Arc` uses atomic operations for reference counting, making shared ownership safe across threads. `Arc<T>` implements `Send` and `Sync` when `T` itself satisfies the necessary thread-safety requirements. This allows us to move cloned `Arc` handles into threads with `move` closures. The three handles (`data`, `data1`, `data2`) all point to the same heap allocation. When the last handle is dropped, the reference count reaches zero and the data is freed.
## Mutex: Mutual Exclusion

`Arc` gives us shared ownership, but it gives us immutable shared ownership. You cannot mutate through an `Arc`:

```rust
let data = Arc::new(42);
// *data += 1; // ERROR: cannot modify through Arc
```

If multiple threads all hold an `Arc` to the same value, they can all read it safely. But what if they need to write? Or what if the value is something like a `Vec` that needs to be modified?

This is where `Mutex<T>` comes in. A `Mutex` provides mutual exclusion: only one thread can access the data at a time. Other threads block until the lock is released.

```rust
use std::sync::Mutex;
use std::thread;

fn main() {
    let counter = Mutex::new(0);

    {
        let mut num = counter.lock().unwrap();
        *num += 1;
    } // lock released here

    println!("counter = {}", *counter.lock().unwrap());
}
```

Now, let me explain what we just did.

`Mutex::new(0)` wraps the integer in a mutex. `counter.lock()` blocks until we can acquire the lock, then returns a `MutexGuard<T>`. The `MutexGuard` derefs to `&mut T`, so we can mutate the value through it. When the guard goes out of scope (at the end of the block), the lock is automatically released. We call `.unwrap()` on `lock()` because it returns a `Result`, the error case is if the mutex is poisoned, which means another thread panicked while holding the lock.

The `Mutex` pattern is similar to `RefCell` which we learned in the previous article. Both provide interior mutability. The difference is: `RefCell` panics at runtime if you violate borrowing rules. `Mutex` blocks the thread until the lock is available. `RefCell` is for single threads. `Mutex` is for multiple threads.
## `Arc<Mutex<T>>`: Shared Mutable State Across Threads

Now combine them. `Arc` provides shared ownership. `Mutex` provides safe mutation. Together, they give us shared mutable state across threads:

```rust
use std::sync::{Arc, Mutex};
use std::thread;

fn main() {
    let counter = Arc::new(Mutex::new(0));
    let mut handles = Vec::new();

    for _ in 0..5 {
        let counter = Arc::clone(&counter);
        let handle = thread::spawn(move || {
            let mut num = counter.lock().unwrap();
            *num += 1;
        });
        handles.push(handle);
    }

    for handle in handles {
        handle.join().unwrap();
    }

    println!("counter = {}", *counter.lock().unwrap());
}
```

Now, let me explain what we just did.

We create an `Arc<Mutex<i32>>`. Inside the loop, we clone the `Arc` and move the clone into a thread. Each thread acquires the lock, increments the counter, and releases the lock when the guard goes out of scope. Only one thread can hold the lock at any moment, so the increments are serialised and there are no data races. After all threads finish, the counter is exactly 5.

Let me read `Arc<Mutex<T>>` from the inside out:

- `T` is the actual data
- `Mutex<T>` wraps the data with a lock
- `Arc<Mutex<T>>` stores the `Mutex<T>` inside an `Arc` managed heap allocation and enables multiple owners

You will see this pattern everywhere in multi-threaded Rust code. It is the thread-safe counterpart of `Rc<RefCell<T>>` from the previous article.
## The Problem with Sharing the Receiver

For our thread pool, every worker thread needs to receive jobs from the same queue. The natural approach is to share the `Receiver` from an `mpsc` channel. But let me show you why this does not work directly:

```rust
use std::sync::mpsc;

fn main() {
    let (tx, rx) = mpsc::channel::<i32>();

    // ERROR: Receiver is not Sync, cannot be shared
    // let shared_rx = std::sync::Arc::new(rx);
}
```

`Receiver<T>` does not implement `Sync`. The reason is that receiving from a channel is inherently stateful: only one thread should receive each message. If multiple threads tried to call `recv()` simultaneously on the same `Receiver`, they would race.

The solution is `Arc<Mutex<Receiver<T>>>`. The `Mutex` ensures only one worker can receive at a time. The worker locks the mutex, calls `recv` (which blocks until a message arrives), then releases the lock for the next worker:

```rust
use std::sync::{Arc, Mutex, mpsc};
use std::thread;

fn main() {
    let (tx, rx) = mpsc::channel::<i32>();
    let rx = Arc::new(Mutex::new(rx));

    let rx1 = Arc::clone(&rx);
    thread::spawn(move || {
        let msg = rx1.lock().unwrap().recv().unwrap();
        println!("worker 1 got: {}", msg);
    });

    let rx2 = Arc::clone(&rx);
    thread::spawn(move || {
        let msg = rx2.lock().unwrap().recv().unwrap();
        println!("worker 2 got: {}", msg);
    });

    tx.send(10).unwrap();
    tx.send(20).unwrap();
}
```

Now, let me explain what we just did.

`rx` is an `Arc<Mutex<Receiver<i32>>>`. Each worker clones the `Arc` and moves the clone into its thread. To receive a job, the worker calls `rx.lock().unwrap().recv().unwrap()`. The `.lock()` blocks until the mutex is available. The `.recv()` blocks until a message arrives. Both workers are racing to acquire the lock. Whichever wins gets to receive the next message. The other worker blocks on `.lock()` until the first worker releases the lock (which happens when the guard goes out of scope at the end of the statement).

This means exactly one message goes to exactly one worker. No duplication. No missed messages. The mutex serialises access to the receiver. An important detail is that the mutex is held during the blocking `recv()` call. This means only one worker can wait on the receiver at a time. Workers still execute jobs concurrently, but receiving jobs from the channel is serialised through the mutex.
## The Thread Pool Architecture

Now let's design our thread pool. Here is the architecture:

```
main thread                thread pool
    |                          |
    |-- tx.send(job) --------> |  (mpsc::Sender<Job>)
    |                          |
    |                          +-- Worker 1 -- rx.lock().recv() -> execute job
    |                          +-- Worker 2 -- rx.lock().recv() -> execute job
    |                          +-- Worker 3 -- rx.lock().recv() -> execute job
    |                          +-- Worker 4 -- rx.lock().recv() -> execute job
    |                          |
    |-- drop(tx) ------------> |  (workers finish queued jobs, then exit once the channel is empty)
```

The `ThreadPool` struct holds a `Sender<Job>` and a `Vec<JoinHandle<()>>` for the worker threads. When a user calls `pool.execute(closure)`, the closure is boxed into a `Job` and sent through the channel. All workers loop. Each worker acquires the mutex protecting the receiver, waits for and receives the next available job, then releases the mutex before executing the job. When the pool is dropped, the `Sender` is dropped, the channel closes, each worker's `recv()` returns `Err`, and the loop exits.

## The Project: Thread Pool from Scratch

Our program will:
- Define a `Job` type as `Box<dyn FnOnce() + Send + 'static>`
- Create a `Worker` struct that holds a thread handle and an ID
- Create a `ThreadPool` struct that holds a sender and worker handles
- Implement `ThreadPool::new(size)` that spawns `size` workers
- Implement `pool.execute(closure)` that sends a job to the workers
- Implement graceful shutdown: workers continue receiving and executing queued jobs until the channel becomes both disconnected and empty, then exit cleanly
- Use `sync_channel` with a bounded capacity for backpressure
- Write a demo `main` that shows it working
## Project Setup

Delete the test code from `src/main.rs`. We will build the entire pool from scratch:

```bash
cargo new threadpool
cd threadpool
```

We do not need any external crates. Everything is in `std`. Open `src/main.rs` and we will build everything step by step.
## The Job Type

A job is something that can be executed once. The most natural way to represent this in Rust is a trait object:

```rust
type Job = Box<dyn FnOnce() + Send + 'static>;
```

Let me read this from inside out:

- `FnOnce()` means a closure that takes no arguments and returns nothing, and can be called exactly once.
- `Send` means the closure can be transferred safely between threads.
- `'static` means the closure cannot contain borrowed references with shorter lifetimes.
- `Box<dyn ...>` heap-allocates the closure and erases its concrete type.

This is exactly the same pattern we used in the linter article where we stored `Box<dyn Fn(&str) -> Vec<Violation>>`. The only new bits are `Send` (for threads) and `FnOnce` (because a job is consumed when executed).
## The Worker Struct

A `Worker` is a thread that loops forever, receiving and executing jobs:

```rust
use std::thread;

struct Worker {
    id: usize,
    thread: thread::JoinHandle<()>,
}
```

The `id` field is for debug printing (we will print "worker 2 got a job" etc.). The `thread` field holds the join handle so we can wait for the worker to finish during shutdown.
## The Worker Loop

A worker needs to receive jobs from the shared receiver. The worker runs a loop:

```rust
impl Worker {
    fn new(
        id: usize,
        receiver: Arc<Mutex<mpsc::Receiver<Job>>>,
    ) -> Worker {
        let thread = thread::spawn(move || {
            loop {
                let job = receiver.lock().unwrap().recv();
                match job {
                    Ok(job) => {
                        println!("worker {} got a job; executing.", id);
                        job();
                    }
                    Err(_) => {
                        println!("worker {} shutting down.", id);
                        break;
                    }
                }
            }
        });

        Worker { id, thread }
    }
}
```

Now, let me explain what we just did.

`Worker::new` takes an `id` and an `Arc<Mutex<Receiver<Job>>>`. Inside `thread::spawn(move || ...)`, the closure starts with a `loop`. In each iteration, the worker:

1. Calls `receiver.lock().unwrap()` to acquire the mutex. This blocks if another worker is currently receiving a message.
2. Calls `.recv()` on the receiver. This blocks if the channel is empty but not closed.
3. Matches on the result. `Ok(job)` means we got a job, so we call `job()` to execute it and print the worker ID. `Err(_)` means all senders have been dropped (the channel is closed), so we `break` out of the loop.
4. When the loop exits, the thread function returns and the thread terminates.

The `move` keyword is essential here. It moves ownership of `id` and `receiver` into the closure. `id` is a `usize` (which is `Copy`), but `receiver` is an `Arc` which must be moved so the thread can share ownership of the receiver.
## The ThreadPool Struct

```rust
use std::sync::{Arc, Mutex, mpsc};

struct ThreadPool {
    workers: Vec<Worker>,
    sender: Option<mpsc::Sender<Job>>,
}
```

Now, let me explain what we just did.

`workers` is a `Vec<Worker>`. We store the workers so we can join them during shutdown. `sender` is `Option<mpsc::Sender<Job>>`. When we want to shut down, we set `sender` to `None` by calling `take()`. This drops the sender, which closes the channel, which causes every worker's `recv()` to return `Err`, which causes every worker to `break` out of its loop. The `Option` is the standard Rust pattern for dropping something during `Drop` that you also need to access during the struct's normal lifetime.
## ThreadPool::new

Now let's implement `ThreadPool::new`:

```rust
impl ThreadPool {
    fn new(size: usize) -> ThreadPool {
        assert!(size > 0, "ThreadPool must have at least 1 worker");

        let (sender, receiver) = mpsc::channel();
        let receiver = Arc::new(Mutex::new(receiver));

        let mut workers = Vec::with_capacity(size);
        for id in 0..size {
            workers.push(Worker::new(id, Arc::clone(&receiver)));
        }

        ThreadPool {
            workers,
            sender: Some(sender),
        }
    }
}
```

Now, let me explain what we just did.

We use `mpsc::channel()` to create an unbounded channel for jobs. The receiver is wrapped in `Arc::new(Mutex::new(receiver))` so it can be shared across all workers. For each worker (from 0 to `size`), we clone the `Arc` and pass it to `Worker::new`. Each worker gets its own clone of the `Arc`, so all workers share the same `Mutex<Receiver<Job>>`. The sender is wrapped in `Some` so we can later `take()` it during shutdown.

The `assert!` ensures we never create a pool with zero workers. A pool with zero workers would never execute any jobs.

## The `execute` Method

The `execute` method takes a closure, boxes it into a `Job`, and sends it through the channel:

```rust
impl ThreadPool {
    fn execute<F>(&self, f: F)
    where
        F: FnOnce() + Send + 'static,
    {
        let job = Box::new(f);
        self.sender.as_ref().unwrap().send(job).unwrap();
    }
}
```

Now, let me explain what we just did.

`execute` is generic over `F`, which must implement `FnOnce() + Send + 'static`. These are the same bounds as on `Job` itself. Inside, we box the closure into a `Box<dyn FnOnce() + Send + 'static>` and send it through the channel. We call `unwrap()` on both the `as_ref()` (the sender should always exist during normal operation) and `send()` (we assume the channel is healthy). A production implementation would return a `Result`, but for learning purposes `unwrap` is fine.

When `execute` returns, the job is in the queue. One of the workers will eventually pick it up and run it.

## Graceful Shutdown: The Drop Implementation

When the pool is dropped, we want every worker to finish its current job, drain any remaining jobs in the queue, and then shut down. Here is the Drop implementation:

```rust
impl Drop for ThreadPool {
    fn drop(&mut self) {
        // Drop the sender to close the channel.
        // Workers will see the channel close after draining remaining messages.
        drop(self.sender.take());

        // Wait for every worker to finish.
        for worker in self.workers.drain(..) {
            println!("shutting down worker {}", worker.id);
            worker.thread.join().unwrap();
        }
    }
}
```

Now, let me explain what we just did.

This is a two-part shutdown. First, we call `self.sender.take()` to get the `Option<mpsc::Sender<Job>>` and extract the sender, then immediately `drop` it. This closes the channel. Workers currently blocked on `recv()` will unblock and:

- If there are still messages in the channel, they will receive those messages (the `Ok(job)` arm) and execute them.
- Once the channel is drained, the next `recv()` returns `Err(RecvError)` (the `Err(_)` arm) and the worker breaks out of its loop.

So all remaining jobs in the queue are processed before any worker shuts down.

Second, we iterate over `self.workers.drain(..)`. The `drain(..)` removes every element from the `Vec`, yielding ownership of each `Worker`. For each worker, we call `thread.join().unwrap()` to block until that worker's thread has finished. The order of joining does not matter: some workers may finish sooner than others, but by the time the `for` loop finishes, all workers have exited.

This is true graceful shutdown. No work is lost, and the program waits for everything to finish. This assumes the pool owns the last sender. If other sender clones still exist, the channel remains open and workers will continue waiting for new jobs.

## Adding Backpressure: Bounded Channels

Our current implementation uses `mpsc::channel()`, which creates an unbounded channel. The queue can grow infinitely. If jobs are submitted faster than workers can process them, the program's memory grows without bound.

We solve this with `mpsc::sync_channel(capacity)`, which creates a bounded channel. When the channel is full, `send()` blocks until a worker frees a slot by receiving a job. This is backpressure: the producer is forced to slow down.

Update `ThreadPool::new` to use `sync_channel`:

```rust
impl ThreadPool {
    fn new(size: usize) -> ThreadPool {
        assert!(size > 0, "ThreadPool must have at least 1 worker");

        let (sender, receiver) = mpsc::sync_channel(size * 2);

        let receiver = Arc::new(Mutex::new(receiver));

        let mut workers = Vec::with_capacity(size);
        for id in 0..size {
            workers.push(Worker::new(id, Arc::clone(&receiver)));
        }

        ThreadPool {
            workers,
            sender: Some(sender),
        }
    }
}
```

Now, let me explain what we just did.

The only change is `mpsc::channel()` becoming `mpsc::sync_channel(size * 2)`. The capacity is twice the number of workers, which gives a small buffer. The choice of capacity is a tuning parameter. A larger capacity means more queueing but smoother throughput. A smaller capacity means tighter backpressure but more blocking. Twice the worker count is a reasonable default.

Note that `sync_channel` returns `SyncSender<Job>` instead of `Sender<Job>`. The two types are different: `SyncSender` is used with bounded channels and `Sender` is used with unbounded channels. Since `Worker::new` is now receiving from a bounded channel, the type in `Worker::new` must also change to `Arc<Mutex<mpsc::Receiver<Job>>>`. The `Receiver` type is the same for both bounded and unbounded channels. The `Sender` field in `ThreadPool` changes from `Option<mpsc::Sender<Job>>` to `Option<mpsc::SyncSender<Job>>`.
## Running the Project

Type this in your terminal:

```bash
cargo run
```

You should see output like this:

```bash
Creating thread pool with 4 workers
All jobs submitted. Pool will shut down when scope ends.
worker 0 got a job; executing.
worker 2 got a job; executing.
worker 1 got a job; executing.
worker 3 got a job; executing.
job 0: starting
job 1: starting
job 2: starting
job 3: starting
job 0: finished
job 1: finished
job 2: finished
worker 0 got a job; executing.
job 3: finished
worker 2 got a job; executing.
worker 1 got a job; executing.
worker 3 got a job; executing.
job 4: starting
job 5: starting
job 6: starting
job 7: starting
job 4: finished
job 5: finished
job 6: finished
job 7: finished
worker 0 shutting down.
shutting down worker 0
worker 2 shutting down.
shutting down worker 2
worker 1 shutting down.
shutting down worker 1
worker 3 shutting down.
shutting down worker 3
```

Now, let me explain what happened.

The first four jobs were picked up immediately by the four idle workers. They all started roughly at the same time. The remaining four jobs were queued in the channel. As soon as a worker finished its job, it picked up the next one from the queue. After all eight jobs were done and the channel was empty, each worker's `recv()` returned `Err`, the loop broke, and the worker printed its shutdown message. The main thread then joined each worker and printed the final shutdown messages.

Four workers processed eight jobs, with no more than four jobs running at any time.

## Running with Only One Worker

Let's test with a single worker to see that jobs are truly serialised. Change `ThreadPool::new(4)` to `ThreadPool::new(1)` and run again:

```bash
Creating thread pool with 1 workers
All jobs submitted. Pool will shut down when scope ends.
worker 0 got a job; executing.
job 0: starting
job 0: finished
worker 0 got a job; executing.
job 1: starting
job 1: finished
worker 0 got a job; executing.
job 2: starting
job 2: finished
worker 0 got a job; executing.
job 3: starting
job 3: finished
worker 0 got a job; executing.
job 4: starting
job 4: finished
worker 0 got a job; executing.
job 5: starting
job 5: finished
worker 0 got a job; executing.
job 6: starting
job 6: finished
worker 0 got a job; executing.
job 7: starting
job 7: finished
worker 0 shutting down.
shutting down worker 0
```

Now, let me explain what happened.

With one worker, jobs are processed one at a time. Each job starts and finishes before the next one begins. No concurrency, but the thread pool abstraction is still useful: it prevents unbounded thread creation and gives you a bounded queue.


## Verifying Backpressure

Let's write a test that proves backpressure works. Replace `main` with:

```rust
fn main() {
    println!("Creating thread pool with 2 workers (bounded channel capacity 4)");
    let pool = ThreadPool::new(2);

    // Submit many long-running jobs to fill the queue and block the main thread
    for i in 0..10 {
        println!("main: submitting job {}", i);
        pool.execute(move || {
            println!("job {}: starting", i);
            thread::sleep(Duration::from_secs(1));
            println!("job {}: finished", i);
        });
        println!("main: job {} accepted", i);
    }

    println!("All jobs submitted.");
}
```

With a `sync_channel` of capacity 4 (2 workers * 2), jobs are accepted until the channel's buffer becomes full. Since the workers are simultaneously consuming jobs, the exact point at which `send()` begins blocking depends on thread scheduling. What is guaranteed is that if jobs are submitted faster than workers can process them, the producer will eventually block once the queue reaches capacity. Once the channel buffer reaches capacity, further calls to `send()` block until a worker receives a job and frees a slot.
## What We Skipped

There are a few things I am intentionally skipping in this article that we will cover in future ones:

- **Async/await**: Threads are OS-level concurrency. Async is cooperative concurrency within a single thread. We will build an async HTTP server in a future article and learn Tokio.
- **`rayon` crate**: Rayon provides data parallelism with work-stealing thread pools. It is a higher-level abstraction built on top of the primitives we used today.
- **Panic handling in workers**: Our implementation uses `unwrap()` on `lock()` and `join()`. A production thread pool would handle poisoned mutexes and panicked threads gracefully.
- **Configurable queue capacity**: The capacity is hardcoded to `size * 2`. A production library would expose this as a parameter.
- **Atomic counters for active jobs**: A production pool might track how many jobs are currently executing using an `AtomicUsize`.

## Conclusion

In this post, you learned about OS threads (`std::thread::spawn`), message passing (`mpsc::channel` and `sync_channel`), shared ownership across threads (`Arc`), mutual exclusion (`Mutex`), and the `Arc<Mutex<T>>` pattern for shared mutable state. You built a Thread Pool from scratch with a fixed number of workers, a bounded job queue, an `execute` method that accepts closures, and graceful shutdown that continues processing queued jobs before exiting.

This project ties together everything from the smart pointers article and the closures article. `Arc` is the thread-safe sibling of `Rc`. `Mutex` is the thread-safe sibling of `RefCell`. `Box<dyn FnOnce() + Send>` is the thread-safe version of the closure stores we built in the linter.

In the next article, we will learn about **async/await** and **Tokio** and **build an HTTP/1.1 server from scratch**. See you soon.

If you like reading this, please subscribe and share this with others. It'll really help me and motivate me to keep publishing more such articles.
