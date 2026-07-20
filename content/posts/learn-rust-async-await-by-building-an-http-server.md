+++
title = "Learn Rust Async/Await, Tokio, and TCP Networking by Building an HTTP/1.1 Server"
description = "In this post, we are going to learn about async/await in Rust. We will learn about futures, the difference between OS threads and async tasks, the Tokio runtime, async TCP. Once we cover all the concepts, we will build an Async HTTP/1.1 Server"
date = 2026-06-17
transparent = true

[taxonomies]
tags = ["rust", "project"]
series = ["learning-rust"]

[extra]
hidden = true
+++


In this post, we are going to learn about async/await in Rust. We will learn about futures, the difference between OS threads and async tasks, the Tokio runtime, async TCP with `tokio::net::TcpListener`, `tokio::spawn` for concurrent tasks, and async file I/O. Once we cover all the concepts, we will build an **Async HTTP/1.1 Server** with a raw TCP listener, manual HTTP request parsing (no framework), request routing, static file serving with proper content types, and concurrent connection handling with `tokio::spawn`. I am really excited for this project and I hope you are too. I won't go too deep in theory, just practical and we will build our knowledge of these concepts over time with more articles.

The only prerequisite is that you have read the previous articles in this series, as I will assume you know ownership, borrowing, structs, enums, pattern matching, error handling, generics, traits, lifetimes, HashMap, iterators, closures, smart pointers, and concurrency with threads.

In the last article, we built a Thread Pool from scratch using OS threads, channels, `Arc<Mutex<T>>`, and graceful shutdown. That was preemptive concurrency: the operating system decides when each thread runs. Today we will learn about cooperative concurrency with async/await, where tasks voluntarily yield control at `.await` points. We will build a real HTTP server that handles thousands of concurrent connections using async I/O.

> **A quick note before we begin:** Async Rust introduces several new concepts such as futures, polling, wakers, and runtimes. Don't worry if every detail doesn't immediately click on the first read. Focus on understanding the overall flow of how async programs are structured and how the pieces fit together. We'll revisit many of these concepts in future projects, where repeated exposure will make them feel much more natural.

Get source code from [here](https://github.com/MrSheerluck/async-http-in-rust)

## Threads vs Async

Let's start with a mental model. In the Thread Pool article, each worker was a dedicated OS thread. The OS scheduler preempts threads, meaning it can pause any thread at any instruction and switch to another. Threads are heavyweight: each one has its own stack (typically a few megabytes), and context switching between threads has overhead from the OS kernel.

> Please learn Operating Systems to learn more deeply. It's really interesting

Async is different. An async runtime (like Tokio) runs many tasks on a small number of OS threads, often just one per CPU core. Tasks are lightweight state machines. When a task hits an `.await` point, it yields control back to the runtime, which picks another ready task to run. Tasks are cooperatively scheduled by the runtime. The OS can still preempt the worker thread, but task switching itself does not require a kernel-mediated thread context switch.

Think of threads as a restaurant where each table gets its own dedicated waiter. Expensive but responsive. Think of async as a single waiter handling many tables. The waiter takes an order from table 1, while the kitchen prepares table 1's food the waiter takes table 2's order, then table 3's, then checks if table 1's food is ready. The waiter is never blocked waiting. They switch between tables whenever a table is not ready.

The key insight: async shines when your program spends a lot of time waiting for external operations such as network requests, database queries, timers, or file access. While one task waits for a response, the runtime runs another task. CPU-bound workloads benefit more from threads (and `rayon` for data parallelism, which we won't cover today).

## Futures

In Rust, an async function or block returns a future. A future is a value that represents a computation that is not yet complete. Under the hood, a future is a type that implements the `Future` trait from the standard library:

```rust
use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll};

pub trait Future {
    type Output;
    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output>;
}
```

Let me read this from the outside in:

- `type Output` is the type the future resolves to. For `async fn foo() -> i32`, `Output` is `i32`.
- `poll` is the heart of the trait. It asks the future: "are you done yet?".
- `Poll<T>` is an enum with two variants: `Poll::Ready(T)` meaning the computation is complete and here is the result, and `Poll::Pending` meaning the computation is not ready yet, try again later.
- `Context` carries a `Waker`, which is a handle the runtime gives to the future. When the future is `Pending`, it must arrange for the waker to be called when progress can be made (for example, when data arrives on a socket).

You almost never implement `Future` by hand. The compiler generates the state machine when you write `async fn` or `async { }` blocks. But understanding the trait helps you understand what `.await` actually does.
## async and .await

An async function is syntactic sugar for a function that returns a future:

```rust
async fn hello() -> String {
    String::from("hello")
}
```

This is roughly equivalent to:

```rust
fn hello() -> impl Future<Output = String> {
    async { String::from("hello") }
}
```

Calling an async function does not run its body. It returns a future. You need to `.await` the future to run it:

```rust
async fn greet() {
    let msg = hello().await;
    println!("{}", msg);
}
```

Now, let me explain what we just did.

`hello()` returns a future of type `impl Future<Output = String>`. The `.await` drives that future to completion. When we hit `hello().await`, control yields to the runtime. If the future is ready immediately, execution continues without yielding. If it is pending, the runtime switches to another task.

You can only use `.await` inside another async function or block. This is the "async infection" people talk about: once you go async, everything up the call stack must be async too.

## Async Blocks

You can also create async blocks inline:

```rust
let future = async {
    let a = compute_a().await;
    let b = compute_b().await;
    a + b
};
let result = future.await;
```

An async block is like a closure but for creating futures. It captures variables from the surrounding scope just like closures do.
## The Tokio Runtime

Futures are inert. They don't do anything on their own. You need a runtime to poll them. The runtime has two main components:

1. **The Reactor**: Registers interest in I/O events with the operating system (using epoll on Linux, kqueue on macOS, IOCP on Windows). When a socket has data, the reactor wakes the task that is waiting on it.
2. **The Executor**: Maintains a queue of tasks that are ready to run. It polls tasks, one at a time, on a small number of worker threads.

Tokio is the most popular async runtime for Rust. It provides the reactor, the executor, and async versions of standard library types: `TcpListener`, `TcpStream`, `File`, timers, channels, and more.

Add Tokio to your Cargo.toml:

```toml
[dependencies]
tokio = { version = "1", features = ["full"] }
```

The `features = ["full"]` flag enables all of Tokio's functionality. In production you would pick only the features you need. For learning, full is fine.

##  `#[tokio::main]`

Tokio provides a macro to set up the runtime and run your async main function:

```rust
#[tokio::main]
async fn main() {
    println!("Hello from async land");
}
```

This expands to roughly:

```rust
fn main() {
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        println!("Hello from async land");
    });
}
```

`#[tokio::main]` creates a multi-threaded runtime by default. By default, Tokio creates one worker thread per available CPU. You can control this with `#[tokio::main(flavor = "current_thread")]` for a single-threaded runtime, or `#[tokio::main(worker_threads = 4)]` for a specific count.

For an HTTP server, the multi-threaded runtime is appropriate because we want to distribute connections across cores.

## Async TCP with Tokio

Let's write a simple TCP echo server to understand async I/O:

```rust
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

#[tokio::main]
async fn main() -> tokio::io::Result<()> {
    let listener = TcpListener::bind("127.0.0.1:8080").await?;
    println!("Listening on 127.0.0.1:8080");

    loop {
        let (mut socket, addr) = listener.accept().await?;
        println!("Connection from {}", addr);

        tokio::spawn(async move {
            let mut buf = vec![0u8; 1024];

            loop {
                match socket.read(&mut buf).await {
                    Ok(0) => {
                        println!("Connection closed by {}", addr);
                        return;
                    }
                    Ok(n) => {
                        if socket.write_all(&buf[..n]).await.is_err() {
                            return;
                        }
                    }
                    Err(_) => return,
                }
            }
        });
    }
}
```

Now, let me explain what we just did.

`TcpListener::bind("127.0.0.1:8080").await?` creates a TCP listener bound to port 8080. Notice the `.await` after `bind`. `TcpListener::bind(...).await` creates and registers the socket with Tokio. The operation is usually completed immediately and does not involve waiting for incoming network events.

The `loop` continuously accepts new connections. listener.accept().await suspends the current task until a new TCP connection arrives. When one does, it returns a `(TcpStream, SocketAddr)`.

Each connection is handled inside `tokio::spawn(async move { ... })`. This spawns a new lightweight task on the Tokio runtime. The task runs concurrently with all other tasks. Unlike `thread::spawn`, this does not create a new OS thread. The task is a state machine managed by the executor.

Inside the spawned task, we loop, reading from the socket and writing back whatever we read. `socket.read(&mut buf).await` reads bytes from the socket. If it returns `Ok(0)`, the connection was closed by the peer. `socket.write_all(&buf[..n]).await` writes the same bytes back (echo). Note that both `read` and `write_all` are async methods from `AsyncReadExt` and `AsyncWriteExt`.

A single thread with async I/O can often handle thousands of mostly idle network connections concurrently. The reactor multiplexes I/O events, and the executor switches between ready tasks. Tasks that are waiting for I/O consume almost no resources.
## tokio::spawn and JoinHandle

`tokio::spawn` returns a `JoinHandle<T>` where `T` is the output of the spawned future. This is the async counterpart of `thread::spawn` returning `thread::JoinHandle<T>`:

```rust
#[tokio::main]
async fn main() {
    let handle = tokio::spawn(async {
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        42
    });

    println!("Waiting for result...");
    let result = handle.await.unwrap();
    println!("Got: {}", result);
}
```

Now, let me explain what we just did.

Unlike thread handles where you call `.join()`, you `.await` a tokio `JoinHandle`. This does not block the OS thread. It yields the current task until the spawned task completes. The current thread can do other work while waiting.

The `.unwrap()` on `handle.await` handles the case where the spawned task panicked. Just like threads, if a task panics, the join handle captures the panic.

## tokio::join! and tokio::select!

Sometimes you want to run multiple futures concurrently and wait for all of them. `tokio::join!` does this:

```rust
use tokio::time::{sleep, Duration};

async fn task_a() -> &'static str {
    sleep(Duration::from_secs(1)).await;
    "A"
}

async fn task_b() -> &'static str {
    sleep(Duration::from_secs(2)).await;
    "B"
}

#[tokio::main]
async fn main() {
    let (a, b) = tokio::join!(task_a(), task_b());
    println!("{} {}", a, b);
}
```

Both `task_a` and `task_b` run concurrently. The total time is about 2 seconds (the max), not 3 seconds (the sum). `tokio::join!` returns a tuple of the results in the same order as the futures passed.

`tokio::select!` is different. The losing futures are dropped. Whether that actually cancels the underlying operation depends on the future's implementation.

```rust
use tokio::time::{sleep, Duration};

#[tokio::main]
async fn main() {
    tokio::select! {
        _ = sleep(Duration::from_secs(2)) => {
            println!("Timer fired after 2 seconds");
        }
        result = async_operation() => {
            println!("Operation completed: {}", result);
        }
    }
}

async fn async_operation() -> &'static str {
    sleep(Duration::from_secs(1)).await;
    "done"
}
```

Now, let me explain what we just did.

`tokio::select!` runs both futures concurrently. `async_operation` finishes in 1 second. The timer still has 1 second left. The `async_operation` branch wins, prints its message, and the timer future is dropped. For Tokio's sleep future, dropping it effectively cancels the timer. This is the pattern for implementing timeouts, graceful shutdown signals, and racing multiple operations.

## Sharing State Across Tasks

Just like threads, async tasks sometimes need to share data. The same core primitives we learned in the Thread Pool article still apply. `Arc<T>` is used for shared ownership, channels are used for message passing, and mutexes or read-write locks are used to coordinate access to shared mutable state.

One important difference is how locking works. `std::sync::Mutex` blocks the underlying OS thread while waiting for a lock. In async applications, blocking a worker thread can prevent the runtime from making progress on other tasks scheduled on that thread. Tokio therefore provides `tokio::sync::Mutex`, whose `.lock().await` yields the current task instead of blocking the thread.

That said, `std::sync::Mutex` is not forbidden in async code. If lock contention is low and the lock is not held across an `.await` point, it can be a perfectly reasonable choice. The important rule is to avoid blocking the runtime unnecessarily.

For our HTTP server, we do not need any shared mutable state. Each connection is handled independently, and each task works with its own socket. The only shared data is the server's configuration, specifically the directory being served. We will use `Arc<PathBuf>` to share that configuration across all connection-handling tasks.

## What We Are Skipping

We are not covering `Pin` in depth. The short version is: `Pin` guarantees that a value won't be moved in memory, which is required for self-referential types like the state machines generated by async functions. In practice you almost never interact with `Pin` directly. The compiler and the runtime handle it.

We are not covering async streams, async traits, or async iterators. Those are more advanced async patterns.

We are not covering `hyper`, `axum`, `actix-web`, or any HTTP framework. This project is about understanding how HTTP and async work at the lowest level in Rust. Once you understand this, frameworks make sense.

We are not covering TLS/HTTPS. That requires `rustls` or OpenSSL and is a separate topic.

We are not covering HTTP/2 or HTTP/3. We are building HTTP/1.1, which is the simplest and most common version.

## The Project: Async HTTP/1.1 Server

Now that you understand futures, async/await, and Tokio, let's build an Async HTTP/1.1 Server from scratch.

Our program will:

- Bind to a TCP port (default 8080)
- Accept connections concurrently using `tokio::spawn`
- Parse raw HTTP/1.1 request lines and headers (method, path, headers)
- Route GET and HEAD requests to a static file server
- Detect Content-Type from file extensions
- Return proper status codes: 200, 400, 404, 405, 500
- Include Content-Length in every response
- Serve files from a configurable root directory
- Handle URL path traversal attacks (reject paths with `..`)
- Default directory index serving (serve `index.html` for `/` paths)

## Project Setup

Open your terminal and run:

```bash
cargo new async_http
cd async_http
```

Now open `Cargo.toml` and add the dependency:

```toml
[package]
name = "async_http"
version = "0.1.0"
edition = "2024"

[dependencies]
tokio = { version = "1", features = ["full"] }
```

The only dependency is Tokio with all features enabled. Everything else comes from the standard library.

Open `src/main.rs` and delete everything. We will build the server from scratch.

### The Request Struct

```rust
use std::collections::HashMap;

struct Request {
    method: String,
    path: String,
    headers: HashMap<String, String>,
}
```

`Request` holds the parsed request data. The method is something like `GET` or `HEAD`. The path is the URL path like `/index.html` or `/images/cat.png`. The headers are key-value pairs like `Host: localhost:8080` and `Connection: keep-alive`. We store header keys in lowercase for case-insensitive lookup later.

### The Response Struct

```rust
struct Response {
    status_code: u16,
    status_text: String,
    headers: HashMap<String, String>,
    body: Vec<u8>,
}
```

`Response` holds everything needed to build an HTTP response. The status code is the numeric code like 200 or 404. The status text is the human-readable version like "OK" or "Not Found". Headers include at minimum `Content-Length`. The body is a byte vector because HTTP bodies can be binary (images, PDFs, etc.)

### Response Builder Methods

Let's implement methods on `Response` to construct responses and serialize them to bytes:

```rust
impl Response {
    fn new(status_code: u16, status_text: &str) -> Self {
        Response {
            status_code,
            status_text: status_text.to_string(),
            headers: HashMap::new(),
            body: Vec::new(),
        }
    }

    fn with_body(mut self, body: Vec<u8>, content_type: &str) -> Self {
        self.headers
            .insert("Content-Length".to_string(), body.len().to_string());
        self.headers
            .insert("Content-Type".to_string(), content_type.to_string());
        self.body = body;
        self
    }

    fn with_body_text(mut self, body: String) -> Self {
        self.headers
            .insert("Content-Length".to_string(), body.len().to_string());
        self.headers
            .insert("Content-Type".to_string(), "text/plain; charset=utf-8".to_string());
        self.body = body.into_bytes();
        self
    }

    fn to_bytes(&self) -> Vec<u8> {
        let mut response = format!("HTTP/1.1 {} {}\r\n", self.status_code, self.status_text);

        for (key, value) in &self.headers {
            response.push_str(&format!("{}: {}\r\n", key, value));
        }

        response.push_str("Connection: close\r\n");
        response.push_str("\r\n");

        let mut bytes = response.into_bytes();
        bytes.extend_from_slice(&self.body);
        bytes
    }
}
```

Now, let me explain what we just did.

`Response::new` creates a response with just a status code and text, no body and no headers yet. The body is an empty `Vec<u8>`.

`with_body` and `with_body_text` are builder-style methods. They consume `self` and return a new `Response` with the body and appropriate headers set. `with_body` takes a `Vec<u8>` and a content type string. This is for binary responses like images. `with_body_text` takes a `String` and sets `text/plain; charset=utf-8`. This is for error messages and simple text responses. Both methods set the `Content-Length` header automatically from the length of the body.

`to_bytes` serializes the response to a byte vector ready to write to the socket. It builds the status line (`HTTP/1.1 200 OK\r\n`), then each header (`Content-Length: 1234\r\n`), then a blank line to separate headers from body, then the body bytes.

Every response includes `Connection: close`. For simplicity, the server closes the connection after each request. Real HTTP/1.1 servers often support keep-alive, which reuses the connection for multiple requests, but that adds significant complexity (parsing multiple requests from one stream, handling timeouts, etc). We are skipping keep-alive for now.

### Content Type Detection

We need to set the correct `Content-Type` header based on file extension:

```rust
fn guess_content_type(path: &str) -> &str {
    let ext = std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");

    match ext {
        "html" | "htm" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" => "application/javascript; charset=utf-8",
        "json" => "application/json",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "txt" => "text/plain; charset=utf-8",
        "pdf" => "application/pdf",
        "xml" => "application/xml; charset=utf-8",
        "zip" => "application/zip",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        "mp3" => "audio/mpeg",
        "mp4" => "video/mp4",
        "wasm" => "application/wasm",
        _ => "application/octet-stream",
    }
}
```

Now, let me explain what we just did.

`std::path::Path::new(path).extension()` extracts the file extension. `.and_then(|e| e.to_str())` converts the `OsStr` to a regular `&str`. If there is no extension, we default to an empty string. The `match` maps known extensions to MIME types. Text-based formats get `charset=utf-8` appended. Everything else falls through to `application/octet-stream`, which tells the browser to download the file rather than try to display it.

### Request Parsing

Now we need to parse raw HTTP bytes into a `Request` struct. HTTP/1.1 request format:

```bash
GET /index.html HTTP/1.1\r\n
Host: localhost:8080\r\n
User-Agent: curl/8.0\r\n
Accept: */*\r\n
\r\n
```

The first line is the request line: METHOD, a space, the path, a space, `HTTP/1.1`, then `\r\n`. Each header is `Key: Value\r\n`. The headers end with a blank line `\r\n\r\n`. There may be a body after the blank line if `Content-Length` is present, but for our server we only care about GET and HEAD requests, which have no body.

```rust
fn parse_request(data: &[u8]) -> Option<Request> {
    let text = std::str::from_utf8(data).ok()?;
    let mut lines = text.lines();

    // Parse request line: METHOD PATH HTTP/1.1
    let request_line = lines.next()?;
    let mut parts = request_line.split_whitespace();
    let method = parts.next()?.to_string();
    let path = parts.next()?.to_string();
    let _version = parts.next()?;

    // Parse headers
    let mut headers = HashMap::new();
    for line in &mut lines {
        if line.is_empty() {
            break; // end of headers
        }
        if let Some((key, value)) = line.split_once(':') {
            headers.insert(key.trim().to_lowercase(), value.trim().to_string());
        }
    }

    Some(Request {
        method,
        path,
        headers,
    })
}
```

Now, let me explain what we just did.

`std::str::from_utf8(data)` converts the raw bytes to a string slice. This parser assumes UTF-8 input for simplicity. Production HTTP servers operate on raw bytes and do not require requests to be valid UTF-8.

`text.lines()` splits the input on `\n` (and strips `\r` automatically). The first line is the request line. We split it on whitespace to extract the method, path, and HTTP version.

The `for line in &mut lines` loop reads header lines until we hit an empty line. `line.split_once(':')` splits on the first colon (header values can contain colons, so we only split on the first one). We store the key in lowercase for case-insensitive lookups. If a header is malformed (no colon), we skip it silently.

### Path Validation

HTTP clients can send malicious paths that attempt to escape the server's root directory. For example, `GET /../../../etc/passwd HTTP/1.1` should be rejected:

```rust
fn validate_path(raw_path: &str) -> Option<String> {
    let path = raw_path.trim_start_matches('/');

    // Reject paths with ".." to prevent directory traversal
    if path.contains("..") {
        return None;
    }

    // Default to index.html for directory requests
    if path.is_empty() || path.ends_with('/') {
        Some(format!("{}index.html", path))
    } else {
        Some(path.to_string())
    }
}
```

Now, let me explain what we just did.

We strip the leading `/` because the path will be joined with the serve directory later. The `..` check catches obvious traversal attempts, but the canonicalization check later is the actual security boundary. An empty path (the root `/`) or a path ending in `/` is treated as a directory request and defaults to `index.html`. So `GET / HTTP/1.1` serves `/index.html` and `GET /blog/ HTTP/1.1` serves `/blog/index.html`.

### The File Server Function

Now let's build the function that handles GET and HEAD requests. This function is async because it reads files from disk using Tokio's async filesystem:

```rust
use std::path::PathBuf;
use tokio::fs;
use tokio::io::AsyncReadExt;

async fn serve_file(
    path: &str,
    serve_dir: &PathBuf,
    head_only: bool,
) -> Response {
    let validated_path = match validate_path(path) {
        Some(p) => p,
        None => {
            let mut resp = Response::new(400, "Bad Request");
            return resp.with_body_text("400 Bad Request: Invalid path".to_string());
        }
    };

    let file_path = serve_dir.join(&validated_path);

    // Canonicalize the path and verify it stays within serve_dir
    let canonical = match file_path.canonicalize() {
        Ok(p) => p,
        Err(_) => {
            let mut resp = Response::new(404, "Not Found");
            return resp.with_body_text("404 Not Found".to_string());
        }
    };

    let serve_dir_canonical = match serve_dir.canonicalize() {
        Ok(p) => p,
        Err(_) => {
            let mut resp = Response::new(500, "Internal Server Error");
            return resp.with_body_text("500 Internal Server Error".to_string());
        }
    };

    if !canonical.starts_with(&serve_dir_canonical) {
        let mut resp = Response::new(403, "Forbidden");
        return resp.with_body_text("403 Forbidden".to_string());
    }

    let content_type = guess_content_type(&validated_path);

    if head_only {
        // For HEAD, we only need metadata, not the body
        let metadata = match fs::metadata(&canonical).await {
            Ok(m) => m,
            Err(_) => {
                let mut resp = Response::new(404, "Not Found");
                return resp.with_body_text("404 Not Found".to_string());
            }
        };

        let mut resp = Response::new(200, "OK");
        resp.headers
            .insert("Content-Length".to_string(), metadata.len().to_string());
        resp.headers
            .insert("Content-Type".to_string(), content_type.to_string());
        return resp;
    }

    // For GET, read the file
    let mut file = match fs::File::open(&canonical).await {
        Ok(f) => f,
        Err(_) => {
            let mut resp = Response::new(404, "Not Found");
            return resp.with_body_text("404 Not Found".to_string());
        }
    };

    let mut body = Vec::new();
    if let Err(_) = file.read_to_end(&mut body).await {
        let mut resp = Response::new(500, "Internal Server Error");
        return resp.with_body_text("500 Internal Server Error".to_string());
    }

    Response::new(200, "OK").with_body(body, content_type)
}
```

Now, let me explain what we just did.

This function uses multiple layers of path validation. First, `validate_path` rejects paths with `..`. Then we join the validated path with the serve directory. Then we canonicalize both the requested path and the serve directory. `canonicalize` resolves symlinks and normalizes the path to an absolute form. We then check that the canonical requested path starts with the canonical serve directory. This is defense-in-depth: even if a crafted path somehow bypasses the `..` check, the canonicalization check catches it.

The `head_only` parameter determines whether this is a GET or HEAD request. HEAD should return the same headers as GET would have returned, except without the message body. We return a 200 response with `Content-Length` set but no body. For GET, we open the file with Tokio's `fs::File::open`, read the entire contents into a `Vec<u8>` using `read_to_end`, and return a 200 response with the full body.

Tokio exposes an async API for file operations. Internally these operations are often executed on a dedicated blocking thread pool. These yield the task while the disk I/O is in progress, allowing other connections to be handled.

Note that `file_path.canonicalize()` and `serve_dir.canonicalize()` are blocking operations from `std`. For a simple server this is fine because canonicalization is fast. A production server might use Tokio's `spawn_blocking` for these.

### The Connection Handler

Now we tie everything together. Each incoming connection is handled by this function:

```rust
use std::sync::Arc;
use tokio::io::AsyncWriteExt;
use tokio::net::TcpStream;

async fn handle_connection(mut socket: TcpStream, serve_dir: Arc<PathBuf>) {
    let mut buf = vec![0u8; 8192];

    // Read data from the socket
    let n = match socket.read(&mut buf).await {
        Ok(0) => return, // client closed immediately
        Ok(n) => n,
        Err(_) => return,
    };

    // Parse the request
    let request = match parse_request(&buf[..n]) {
        Some(req) => req,
        None => {
            let response = Response::new(400, "Bad Request")
                .with_body_text("400 Bad Request: Unable to parse request".to_string());
            let _ = socket.write_all(&response.to_bytes()).await;
            return;
        }
    };

    println!("{} {} {} -> {}", 
        request.method, 
        request.path,
        request.headers.get("host").map(|h| h.as_str()).unwrap_or("-"),
        socket.local_addr().unwrap()
    );

    // Route the request
    let response = match request.method.as_str() {
        "GET" => serve_file(&request.path, &serve_dir, false).await,
        "HEAD" => serve_file(&request.path, &serve_dir, true).await,
        _ => {
            let mut resp = Response::new(405, "Method Not Allowed");
            resp.headers
                .insert("Allow".to_string(), "GET, HEAD".to_string());
            resp.with_body_text("405 Method Not Allowed".to_string())
        }
    };

    // Send the response
    let _ = socket.write_all(&response.to_bytes()).await;
}
```

Now, let me explain what we just did.

The function takes ownership of the `TcpStream` (consuming it so no one else can read or write to it) and an `Arc<PathBuf>` for the serve directory. The `Arc` lets us share the directory path across all connection tasks without cloning the string.

We allocate a fixed-size buffer of 8 KiB on the stack. This should be enough for most HTTP requests (which are typically under 1 KiB). If a request is larger than 8 KiB, `read` will fill the buffer and the rest of the request stays in the socket's kernel buffer. For our simple server, we only need the request line and headers, which are always at the start, so 8 KiB is more than enough.

`socket.read(&mut buf).await` reads whatever data is available into the buffer. This is the async version of the `read` we used in the thread pool article. If the client sends nothing (`Ok(0)`), we return immediately.

We parse the request from the filled portion of the buffer. If parsing fails, we send a 400 Bad Request and return.

We print a simple access log showing the method, path, host header, and local address of the connection.

Finally, we route the request based on the HTTP method. GET and HEAD go to `serve_file`. Everything else gets a 405 Method Not Allowed with an `Allow` header listing supported methods.

The response is serialized with `response.to_bytes()` and written back to the socket with `socket.write_all(...).await`. We ignore the result of `write_all` because if the client has disconnected, there is nothing we can do.

### The Main Function

```rust
use tokio::net::TcpListener;

#[tokio::main]
async fn main() -> tokio::io::Result<()> {
    let args: Vec<String> = std::env::args().collect();

    let (port, serve_dir) = if args.len() >= 3 {
        (args[1].clone(), PathBuf::from(&args[2]))
    } else if args.len() == 2 {
        // Only port provided, serve from current directory
        (args[1].clone(), PathBuf::from("."))
    } else {
        eprintln!("Usage: cargo run -- <port> [serve_directory]");
        eprintln!("Example: cargo run -- 8080 ./public");
        std::process::exit(1);
    };

    // Ensure we have an absolute path for canonicalization
    let serve_dir = match serve_dir.canonicalize() {
        Ok(p) => p,
        Err(e) => {
            eprintln!("Error: Cannot access directory '{}': {}", serve_dir.display(), e);
            std::process::exit(1);
        }
    };

    let serve_dir = Arc::new(serve_dir);

    let addr = format!("127.0.0.1:{}", port);
    let listener = TcpListener::bind(&addr).await?;

    println!("Server listening on http://{}", addr);
    println!("Serving files from: {}", serve_dir.display());
    println!("Press Ctrl+C to stop.\n");

    loop {
        match listener.accept().await {
            Ok((socket, addr)) => {
                let dir = Arc::clone(&serve_dir);
                tokio::spawn(async move {
                    println!("Connection accepted from {}", addr);
                    handle_connection(socket, dir).await;
                });
            }
            Err(e) => {
                eprintln!("Error accepting connection: {}", e);
            }
        }
    }
}
```

Now, let me explain what we just did.

We parse command-line arguments. The first argument is the port number. The second (optional) argument is the directory to serve files from. If no directory is specified, we serve from the current directory.

We canonicalize the serve directory immediately. This converts it to an absolute path (so we can validate that all requests stay within it) and also verifies that the directory exists and is accessible. If it is not, we print an error and exit.

The serve directory is wrapped in `Arc::new(...)` for sharing across spawned tasks. Each connection handler gets its own `Arc::clone(&serve_dir)`. We used this exact pattern in the Thread Pool article. The only difference is we are now sharing a `PathBuf` instead of an `Arc<Mutex<Receiver<Job>>>`.

The main loop is identical in structure to the async echo server we wrote earlier. It calls `listener.accept().await` to wait for the next connection. When a connection arrives, it clones the `Arc` and spawns a new Tokio task to handle it. The spawned task runs `handle_connection`, which reads the request, routes it, and writes the response.

The `loop` runs forever. To stop the server, press Ctrl+C. The Tokio runtime automatically handles the interrupt signal and shuts down.

### Static File Serving Details

Let's trace through an example request to understand the complete flow. A browser requests `http://localhost:8080/css/style.css` from a server serving the `./public` directory:

1. TCP connection arrives. `listener.accept().await` returns a `(TcpStream, SocketAddr)`.
2. `tokio::spawn` creates a new lightweight task.
3. `handle_connection` reads from the socket. The raw bytes look like:
   ```bash
   GET /css/style.css HTTP/1.1\r\n
   Host: localhost:8080\r\n
   Connection: keep-alive\r\n
   \r\n
   ```
4. `parse_request` extracts method `GET`, path `/css/style.css`, and headers.
5. `validate_path("/css/style.css")` strips the leading `/`, yielding `css/style.css`. No `..` detected. No trailing slash, so no `index.html` appended.
6. `serve_file` is called with `path = "/css/style.css"`, `serve_dir = "./public"`, `head_only = false`.
7. The file path becomes `./public/css/style.css`.
8. Both paths are canonicalized. If `./public` resolves to `/home/user/project/public` and `./public/css/style.css` resolves to `/home/user/project/public/css/style.css`, the prefix check passes.
9. `guess_content_type("css/style.css")` looks at the `css` extension and returns `text/css; charset=utf-8`.
10. `fs::File::open` opens the file. If it exists, `read_to_end` reads its contents into a `Vec<u8>`.
11. A `Response` is built with status 200, `Content-Type: text/css; charset=utf-8`, `Content-Length: <size>`, and the body.
12. `to_bytes()` serializes everything and writes it back to the socket.
13. The connection closes (because `Connection: close` is always sent).

## Running the Project

Create a test directory with some files:

```bash
mkdir -p www/css www/images
echo '<!DOCTYPE html><html><body><h1>Hello Async!</h1></body></html>' > www/index.html
echo 'body { font-family: sans-serif; }' > www/css/style.css
echo 'Hello, World!' > www/hello.txt
```

Now start the server:

```bash
cargo run -- 8080 ./www
```

You should see:

```bash
Server listening on http://127.0.0.1:8080
Serving files from: /Users/you/async_http/www
Press Ctrl+C to stop.
```

### Testing with curl

Open another terminal and test:

```bash
curl -v http://localhost:8080/
```

Expected output:

```bash
* Connected to localhost (127.0.0.1) port 8080
> GET / HTTP/1.1
> Host: localhost:8080
> User-Agent: curl/8.0
> Accept: */*
>
< HTTP/1.1 200 OK
< Content-Length: 62
< Content-Type: text/html; charset=utf-8
< Connection: close
<
<!DOCTYPE html><html><body><h1>Hello Async!</h1></body></html>
```

The server log shows:

```bash
Connection accepted from 127.0.0.1:54321
GET / localhost:8080 -> 127.0.0.1:8080
```

Test the CSS file:

```bash
curl http://localhost:8080/css/style.css
```

Expected:

```bash
body { font-family: sans-serif; }
```

Test an HTML file:

```bash
curl http://localhost:8080/hello.txt
```

Expected:

```bash
Hello, World!
```

Test a 404:

```bash
curl -v http://localhost:8080/nonexistent.html
```

Expected:

```bash
< HTTP/1.1 404 Not Found
< Content-Length: 14
404 Not Found
```

Test a HEAD request:

```bash
curl -I http://localhost:8080/
```

Expected:

```bash
HTTP/1.1 200 OK
Content-Length: 62
Content-Type: text/html; charset=utf-8
Connection: close
```

No body is returned. Only the headers.

Test method not allowed:

```bash
curl -v -X POST http://localhost:8080/
```

Expected:

```bash
< HTTP/1.1 405 Method Not Allowed
< Allow: GET, HEAD
405 Method Not Allowed
```
### Concurrent Connection Test

Let's verify the server handles concurrent connections. In one terminal, create a small script to make parallel requests:

```bash
for i in $(seq 1 10); do
    curl -s -o /dev/null -w "Request $i: HTTP %{http_code}\n" http://localhost:8080/ &
done
wait
```

Or if you have `ab` (Apache Bench) installed:

```bash
ab -n 1000 -c 50 http://localhost:8080/
```

All requests complete successfully. The server handles them concurrently on Tokio's worker threads. The access log shows interleaved connection messages:

```bash
Connection accepted from 127.0.0.1:54322
GET / localhost:8080 -> 127.0.0.1:8080
Connection accepted from 127.0.0.1:54323
GET / localhost:8080 -> 127.0.0.1:8080
Connection accepted from 127.0.0.1:54324
GET / localhost:8080 -> 127.0.0.1:8080
GET / localhost:8080 -> 127.0.0.1:8080
```

Notice the interleaving: new connections are accepted while previous requests are still being processed. The async runtime multiplexes I/O across all concurrent connections.

## How It All Fits Together

Let's trace the lifecycle of a connection through the async runtime:

1. **Binding**: `TcpListener::bind().await` registers the listening socket with the reactor. The reactor uses kqueue (macOS) or epoll (Linux) to watch for new connections.

2. **Accepting**: `listener.accept().await` yields the main task. The runtime can execute other ready tasks. When a TCP handshake completes, the reactor wakes the main task. It resumes and gets the new `TcpStream`.

3. **Spawning**: `tokio::spawn(async move { ... })` creates a new task. The task is placed in the executor's ready queue. The task does not run yet. The main loop goes back to waiting for the next connection.

4. **Reading**: When the executor picks up the spawned task, it runs it until it hits `.await` on `socket.read(...)`. The read future registers interest in the socket with the reactor and yields. The executor picks up another ready task.

5. **Data arrives**: The reactor detects that the socket has data. It wakes the waiting task. The executor puts it back in the ready queue. When the task runs again, `read` returns the bytes.

6. **Parsing**: Parsing the request is CPU-only work. There are no `.await` points, so the task continues running until it reaches the next async operation.

7. File reading: `fs::File::open` and `read_to_end` expose an async API. Tokio typically executes the underlying file operations on a dedicated blocking thread pool while the task yields.

8. **Writing**: `socket.write_all(...).await` registers write interest with the reactor. When the socket is writable, the reactor wakes the task.

9. **Completion**: The spawned task finishes. The `TcpStream` is dropped, closing the socket. The `Connection: close` header informs the client that the connection will not be reused.

Throughout this whole process, there are only a few OS threads. On a 4-core machine, Tokio's default runtime uses 4 worker threads. But it can handle thousands of concurrent connections because most connections spend most of their time waiting for I/O, and during that wait the thread they were running on is free to run other tasks.

Compare this to the Thread Pool article where we needed one OS thread per worker, and each worker could only handle one job at a time. For an HTTP server, the async model is dramatically more scalable.

## What We Skipped

There are a few things I am intentionally skipping in this article:

- **HTTP keep-alive**: Our server closes every connection after one response. Real web servers reuse connections for multiple requests. Implementing this requires buffered reading, timeout management, and tracking connection state across multiple requests. It adds significant complexity for a learning project.
- **Request body parsing**: We only handle GET and HEAD. POST, PUT, and PATCH requests include a body. Handling bodies requires respecting `Content-Length` and `Transfer-Encoding: chunked`.
- **Streaming responses**: For large files, reading the entire file into memory (as we do with `read_to_end`) is wasteful. A production server would use `tokio::io::copy` or `sendfile` to stream the file to the socket without loading it all into RAM.
- **Multipart and URL-encoded form parsing**: Common patterns for web applications but out of scope for this article.
- **Async graceful shutdown**: Our server stops when Ctrl+C is pressed, but it does not drain in-flight requests before exiting. Tokio provides `tokio::signal::ctrl_c()` and `CancellationToken` for this.
- **HTTPS/TLS**: Setting up `rustls` with `tokio-rustls` is a separate topic.
- **HTTP routing**: Real servers match paths against patterns and extract parameters. In our server, paths map directly to filesystem paths plus `index.html` for directories.
- **Custom error pages**: We return plain text for all error responses. A real server would serve custom HTML pages.

> Everything we skipped in this article exists for a reason in real-world servers. Rather than introducing that complexity all at once, we focused on the async runtime, TCP networking, HTTP fundamentals, and static file serving. In the upcoming Rust backend series, we'll build production-style services with Axum and revisit many of these topics, including routing, request extraction, middleware, request bodies, graceful shutdown, and other features commonly used in modern web applications.

## Conclusion

In this post, you learned about async/await in Rust. You learned the difference between OS threads (preemptive concurrency) and async tasks (cooperative concurrency). You learned about futures (the `Future` trait and how the `poll` method works), async functions and blocks (which compile to state machines), and how `.await` yields control back to the runtime.

You learned about the Tokio runtime: the reactor (which watches I/O events using kqueue/epoll) and the executor (which schedules ready tasks on a small pool of worker threads). You learned `#[tokio::main]`, `tokio::spawn`, `tokio::join!`, and `tokio::select!`.

You built an Async HTTP/1.1 Server from scratch. The server listens on a TCP port using `tokio::net::TcpListener`, accepts connections concurrently with `tokio::spawn`, parses raw HTTP/1.1 request lines and headers manually (no framework), routes GET and HEAD requests to a static file server, detects Content-Type from file extensions, validates paths against directory traversal attacks, and returns proper HTTP status codes with Content-Length headers.

This ties together everything from the Thread Pool article. Where threads give us preemptive multitasking at the OS level, async gives us cooperative multitasking within a single thread. The same primitives apply: `Arc` for shared ownership, `spawn` for concurrent execution, and channels for message passing (Tokio provides their async versions).

In the next article, we will learn about SQLx and build a Book Library CLI with SQLite, compile-time checked queries, connection pooling, schema migrations, and full CRUD. See you soon.

If you like reading this, please subscribe and share this with others. It'll really help me and motivate me to keep publishing more such articles.
