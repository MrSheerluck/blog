+++
title = "Learn Rust Lifetimes by Building a Generic LRU Cache"
description = "In this post, we are going to learn Rust lifetimes concept by building a generic LRU cache in Rust"
date = 2026-05-13
transparent = true

[taxonomies]
tags = ["rust", "project"]
series = ["learning-rust"]
+++


In this post, we are going to learn about lifetimes in Rust. Once we cover all the concepts, we will build a **Generic LRU Cache**. I'm really excited for this project and I hope you are too. I won't go too deep in theory, just practical and we will build our knowledge of these concepts over time with more articles.

The only prerequisite is that you have read the previous articles in this series, as I will assume you know ownership, borrowing, structs, enums, pattern matching, error handling, generics and traits.

In this post, we will first learn what lifetimes are, why they exist, how lifetime annotations work, lifetime elision, lifetimes on structs, and then we will build a generic LRU cache that returns zero-copy references with lifetime annotations.

Get the source code from [here](https://github.com/MrSheerluck/lru_cache_in_rust)

> This is an educational LRU implementation focused on learning lifetimes and borrowing semantics. Production LRU caches typically use a HashMap and a doubly linked list to achieve O(1) operations.

## The Problem Lifetimes Solve
Every reference in Rust has a **lifetime**. A lifetime is just the span of time during which a reference is valid. It starts when the reference is created and ends when the reference is no longer usable. Every reference in Rust has a lifetime, even if you don't see it written anywhere.

Most of the time, lifetimes are invisible. The compiler can figure them out on its own. But sometimes, the compiler needs your help. When the compiler cannot figure out the relationship between references in a function's inputs and outputs, it asks you to annotate the lifetimes. That is what this article is about.

Let's start with a simple example that compiles:
```rust
fn main() {
    let x = 42;
    let r = &x;
    println!("{}", r);
}
```
`x` is created, then `r` borrows `x`. Both `x` and `r` go out of scope at the end of `main`. `r` is always valid because `x` lives longer than `r`. The compiler can see this trivially.

But what about this?
```rust
fn main() {
    let r;
    {
        let x = 42;
        r = &x;
    }
    println!("{}", r); // ERROR: `x` does not live long enough
}
```
Here, `r` is declared before the inner block. Inside the block, `r` borrows `x`. But `x` is dropped when the inner block ends. When we try to print `r` after the block, `r` points to freed memory. This is a **dangling reference**. In C, this compiles and runs, and reads garbage or crashes. In Rust, this does not compile at all. The compiler checks that `r` cannot outlive the data it points to. That check is the borrow checker, and it enforces lifetime rules.

The error message says "`x` does not live long enough." The compiler has computed the lifetimes of both references and determined that the reference `r` would be invalid by the time it is used.

Here is another common example:
```rust
fn longest(x: &str, y: &str) -> &str {
    if x.len() > y.len() { x } else { y }
}
```

This seems straightforward. Return the longer of two string slices. But this will not compile. The compiler does not know whether the returned reference points to `x` or `y`. It does not know how the lifetimes of the inputs relate to the lifetime of the output. It cannot guarantee that the returned reference will be valid when the caller uses it. So it rejects the code.
To fix this, we need to tell the compiler: "The returned reference cannot outlive either input reference." That is exactly what lifetime annotations do.

## Lifetime Annotations
A lifetime annotation is written with a single quote followed by a name, just like `'a`. By convention, we use short names like `'a`, `'b`, `'ctx`, `'src`. The annotation does not change how long anything lives. It just names a lifetime so you can describe relationships between references.

Here is the longest function with lifetime annotations:
```rust
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() { x } else { y }
}
```
Let me explain what we just did. `<'a>` introduces a lifetime parameter, just like `<T>` introduces a type parameter. `x: &'a str` means "`x` is a reference to a `str` with lifetime `'a`". `y: &'a str` means the same for `y`. And `-> &'a str` means "the return value is a reference with lifetime `'a`".

The meaning of this signature is: "The function takes two string slices that both live at least as long as `'a`, and returns a string slice that also lives at least as long as `'a`." In other words, the returned reference cannot outlive either input reference.

Now the compiler knows enough to check the caller. Here is a valid call:
```rust
fn main() {
    let x = String::from("short");
    let y = String::from("loooooong");
    let result = longest(&x, &y); // our longest function that we wrote above
    println!("{}", result);
}
```
Both `x` and `y` live until the end of `main`. result is used within that scope. 

Everything checks out. But here is what gets rejected:
```rust
fn main() {
    let x = String::from("short");
    let result;
    {
        let y = String::from("loooooong");
        result = longest(&x, &y); // our longest function that we wrote above
    }
    println!("{}", result); // ERROR: `y` does not live long enough
}
```

The function signature ties the returned reference lifetime to both inputs, so the compiler conservatively assumes the returned reference cannot outlive either one. Since `y` is dropped inside the block, result would be invalid after the block. The compiler catches this.

But what if the function always returns one specific input, regardless of the other?
```rust
fn first<'a, 'b>(x: &'a str, y: &'b str) -> &'a str {
    x
}
```
Here `x` has lifetime `'a` and `y` has lifetime `'b`. The return type is `&'a str`, meaning the returned reference has the same lifetime as `x`. This is valid because `first` always returns `x`. The lifetime of `y` is completely unrelated.

At the call site:
```rust
fn main() {
    let x = String::from("hello");
    let result;
    {
        let y = String::from("world");
        result = first(&x, &y); // our first function that we wrote above
    }
    println!("{}", result); // This works! result borrows from x, not y
}
```

This compiles because result only borrows from `x`, which lives longer. The compiler can see that the return value's lifetime is tied to `x` and not to `y`.

## Lifetime Annotations in Struct Methods
Structs can have lifetimes too, and methods on those structs need them as well.

Consider a struct that holds a reference:
```rust
struct Config<'a> {
    name: &'a str,
    version: &'a str,
}
```
The `<'a>` on the struct definition means every instance of `Config` has a lifetime parameter. Any reference stored in the struct must live at least as long as `'a`. The struct cannot outlive the data it references.

Now let's add a method:
```rust
impl<'a> Config<'a> {
    fn name(&self) -> &str {
        self.name
    }
}
```
The `impl<'a>` introduces the lifetime parameter for the impl block. The method `name` returns `&str`. Can you spot why we don't need to annotate the return type's lifetime here? Because of lifetime elision. The compiler sees that the return type is a reference, and that the method takes `&self`. When a method takes `&self`, the compiler assumes the return type has the same lifetime as `&self`. It fills in the blank automatically.

## Lifetime Elision Rules
You might be wondering: why do some functions need explicit lifetime annotations and others do not? The answer is that Rust has three lifetime elision rules. The compiler applies these rules to every function signature. If the rules can figure out the lifetimes, you do not need to write them. If the rules cannot figure it out, the compiler asks you to be explicit.

Here are the three rules for function and method signatures:

| Rule | Description                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------- |
| 1    | Each input reference gets its own lifetime parameter                                              |
| 2    | If there is exactly one input lifetime, it is assigned to all output references                   |
| 3    | If the method takes &self or &mut self, the lifetime of self is assigned to all output references |

Let's see these rules in action.
```rust
fn hello() -> &str { // ERROR: no input references
    "hello"
}
```
This fails because there are no input references, so the compiler cannot figure out what lifetime to assign to the output. The fix is to return `&'static str`:
```rust
fn hello() -> &'static str {
    "hello"
}
```
String literals have the `'static` lifetime, meaning they live for the entire duration of the program.

```rust
fn first_word(s: &str) -> &str { // Works! Rule 2 applies
    // ...
}
```
One input reference, one output reference. Rule 2 assigns the input lifetime to the output.

```rust
fn longest(x: &str, y: &str) -> &str { // ERROR: two input references
    // ...
}
```
Two input references, one output reference. Rule 1 creates two lifetimes (`'a`, `'b`). Rule 2 does not apply because there are two inputs, not one. Rule 3 does not apply because this is not a method. So the compiler asks for explicit annotations.

```rust
impl<'a> Config<'a> {
    fn get_name(&self) -> &str { // Works! Rule 3 applies
        &self.name
    }
}
```

Takes `&self`. Rule 3 assigns the lifetime of self to the output. No explicit annotation needed.
These three rules cover the vast majority of cases. In practice, explicit lifetime annotations on functions are relatively rare. Most of the time, the elision rules handle it.

## The `'static` Lifetime
The `'static` lifetime is special. It means "this reference is valid for the entire program." String literals are `'static`:
```rust
let s: &'static str = "hello world";
```
The string `"hello world"` is embedded directly in the compiled binary. It exists for as long as the program runs, so its lifetime is `'static`.

There is another way to get a `'static` lifetime that surprises beginners:
```rust
fn main() {
    let s: &'static str = "hello";
}
```

This works because string literals are stored in the binary. But this does not:
```rust
fn make_string() -> &'static str {
    let s = String::from("hello");
    &s // ERROR: cannot return reference to local variable
}
```
Even though we wrote `&'static str`, the compiler knows we are lying. `s` is a heap-allocated `String` that will be dropped at the end of the function. It cannot have `'static` lifetime.

The `'static` bound is also commonly seen in trait bounds:
```rust
fn process<T: 'static>(t: T) {
    // T does not contain any non-static references
}
```
This means `T` cannot contain any references that are not `'static`. If `T` is `i32`, that is fine because integers do not contain references. If `T` is `&'a str` where `'a` is not `'static`, this will not compile.

Now that we understand how lifetime relationships work in functions and structs, let's start working on our project
## The Project: Generic LRU Cache
Now that you understand lifetimes, let's build a generic LRU cache. An LRU (Least Recently Used) cache is a data structure that stores a fixed number of items. When the cache is full and a new item is added, the least recently used item is evicted to make space.

Our LRU cache will:
- Be generic over key type `K` and value type `V`
- Hold a borrowed `Config` reference with a lifetime annotation
- Provide zero-copy `get` that returns `Option<&V>` with proper lifetime annotations
- Support `put`, `get`, and `contains` operations
- Be split into a separate `src/cache.rs` module

We are using an LRU cache because it gives us a practical way to work with borrowed data and references returned from methods. The cache holds a reference to a configuration struct, and the `get` method returns references to values stored in the cache. Both of these need proper lifetime annotations to satisfy the borrow checker.

### Project Setup
Open your terminal and run:
```shell
cargo new lru_cache
cd lru_cache
```

Now open the `Cargo.toml` file.  We do not need any external dependencies for this project. Everything is standard library.
```toml
[package]
name = "lru_cache"
version = "0.1.0"
edition = "2024"
```

We will create two files: `src/cache.rs` for the cache implementation and `src/main.rs` for the demo. 

> The below code snippets will come under `src/cache.rs` file, please, check the complete code on github if you are coding along while reading

### The Config Struct
Before we build the cache, we need a configuration struct. The cache will borrow from it.
```rust
struct CacheConfig {
    max_capacity: usize,
    name: String,
}
```
The cache will hold a reference to this config using a lifetime annotation.

### The Cache Struct
Now let's define the cache struct. This is where lifetimes come in.
```rust
struct Cache<'a, K, V> {
    config: &'a CacheConfig,
    items: Vec<(K, V)>,
    access_order: Vec<usize>,
}
```
Now, let me explain what we just did. `Cache<'a, K, V>` has three generic parameters: a lifetime `'a` and two type parameters `K` and `V`. The `config` field is `&'a CacheConfig`, meaning it borrows a `CacheConfig` that must live at least as long as `'a`. The cache cannot outlive the config it borrows from.

`items` is a `Vec<(K, V)>` holding the key-value pairs. `access_order` is a `Vec<usize>` of indices into `items`, ordered from most recently used to least recently used.

### The Constructor
We need a way to create a `Cache`. The constructor takes a reference to a `CacheConfig`:
```rust
impl<'a, K, V> Cache<'a, K, V> {
    fn new(config: &'a CacheConfig) -> Self {
        Cache {
            config,
            items: Vec::new(),
            access_order: Vec::new(),
        }
    }
}
```
`new` takes `config: &'a CacheConfig` and returns `Cache<'a, K, V>`. The lifetime `'a` is the same for both the input reference and the output struct. This tells the compiler that the cache is borrowing from the config, and the cache cannot outlive the config.

### Capacity Getter
Since the cache borrows from `CacheConfig`, it can access its fields through the reference:
```rust
impl<'a, K, V> Cache<'a, K, V> {
    fn capacity(&self) -> usize {
        self.config.max_capacity
    }
}
```
Notice that `capacity` returns `usize`, not a reference. It reads the value from the borrowed config and returns an owned copy. No lifetime annotation needed.

But what if we wanted to return a reference to a field of `config`?
```rust
impl<'a, K, V> Cache<'a, K, V> {
    fn name(&self) -> &str {
        &self.config.name
    }
}
```
This works without explicit lifetime annotations because of elision rule 3. The method takes `&self`, so the output reference is assumed to have the same lifetime as `self`. Since `self` is `&'a CacheConfig` internally, the returned `&str` is actually `&'a str`. But we don't need to write any of that.

### The `bump` Helper Method
The `bump` helper moves a recently accessed index to the front of the access order:
```rust
fn bump(&mut self, index: usize) {
	let pos = self.access_order.iter().position(|&i| i == index).unwrap();
	self.access_order.remove(pos);
	self.access_order.insert(0, index);
}
```
It finds where the index currently is in the access order, removes it, and inserts it at the front. This is called every time a key is accessed via `get` or updated via `put`.
### The `get` Method
The `get` method looks up a key and returns a reference to the value without copying it:
```rust
pub fn get(&mut self, key: &K) -> Option<&V>
where
	K: PartialEq,
{
	let idx = self.items.iter().position(|(k, _)| k == key)?;
	self.bump(idx);
	Some(&self.items[idx].1)
}
```
Now, let me explain what we just did. First, we search for the key using `self.items.iter().position(...)`. The `position` method walks the iterator and returns the index of the first element where the closure returns `true`. If no element matches, it returns `None`, and the `?` operator makes the whole function return `None` immediately.
Once we have the index, we call `self.bump(idx)` to move that index to the front of the access order. Then we return `Some(&self.items[idx].1)`, a reference to the value at that position.
The return type is `Option<&V>`. Notice there is no explicit lifetime annotation on the return value. This works because of elision rule 3: the method takes `&mut self`, so the output reference has the same lifetime as `self`. The important thing is that `get` returns a reference to the value stored inside the cache. No cloning, no copying. The caller gets a direct reference to the cached data. This is zero-copy.

### The `put` Method
The `put` method inserts or updates a key-value pair. If the cache is full, it evicts the least recently used item:
```rust
pub fn put(&mut self, key: K, value: V)
where
	K: PartialEq,
{
	if let Some(idx) = self.items.iter().position(|(k, _)| *k == key) {
		self.items[idx].1 = value;
		self.bump(idx);
		return;
	}
	if self.items.len() >= self.capacity() {
		let evict_index = self.access_order.pop().unwrap();
		self.items.remove(evict_index);
		for idx in self.access_order.iter_mut() {
			if *idx > evict_index {
				*idx -= 1;
			}
		}
	}
	self.items.push((key, value));
	self.access_order.insert(0, self.items.len() - 1);
}
```

Now, let me explain what we just did. The method first checks if the key already exists using `position()` again. If it does, we update the value in place with `self.items[idx].1 = value`, bump the access order, and return. 
If the key does not exist, we check if the cache is full by comparing `self.items.len()`against `self.capacity()`. If we are at capacity, we need to evict the least recently used item. The LRU item is at the end of `access_order`, so we `pop()` it to get the eviction index, then `remove` that item from the vector. After removal, any indices in `access_order` that pointed beyond the removed item need to be decremented by one because `remove` shifts all later elements down.
Finally, we push the new key-value pair onto `items` and insert its index (which is `items.len() - 1`) at the front of `access_order`, marking it as most recently used.


### The `contains` Method
A simple check for key existence:
```rust
impl<'a, K: PartialEq, V> Cache<'a, K, V> {
    fn contains(&mut self, key: &K) -> bool {
        self.get(key).is_some()
    }
}
```
We call `self.get(key)` which bumps the access order, then check if the result is `Some`.

> Notice that `contains` takes `&mut self` instead of `&self`. That is because checking for existence also updates the access order, which mutates the cache state.

### The `len` Method
```rust
impl<'a, K, V> Cache<'a, K, V> {
    fn len(&self) -> usize {
        self.items.len()
    }
}
```

### Module Split: `src/cache.rs`
Right now, everything is in one file. Let's split the cache implementation into its own module. Create a new file `src/cache.rs`:
```rust
pub struct CacheConfig {
    pub max_capacity: usize,
    pub name: String,
}
pub struct Cache<'a, K, V> {
    config: &'a CacheConfig,
    items: Vec<(K, V)>,
    access_order: Vec<usize>,
}
impl<'a, K, V> Cache<'a, K, V> {
    pub fn new(config: &'a CacheConfig) -> Self {
        Cache {
            config,
            items: Vec::new(),
            access_order: Vec::new(),
        }
    }
    pub fn capacity(&self) -> usize {
        self.config.max_capacity
    }
    pub fn name(&self) -> &str {
        &self.config.name
    }
    pub fn len(&self) -> usize {
        self.items.len()
    }
    pub fn contains(&mut self, key: &K) -> bool
    where
        K: PartialEq,
    {
        self.get(key).is_some()
    }
    pub fn get(&mut self, key: &K) -> Option<&V>
    where
        K: PartialEq,
    {
        let idx = self.items.iter().position(|(k, _)| k == key)?;
        self.bump(idx);
        Some(&self.items[idx].1)
    }
    pub fn put(&mut self, key: K, value: V)
    where
        K: PartialEq,
    {
        if let Some(idx) = self.items.iter().position(|(k, _)| *k == key) {
            self.items[idx].1 = value;
            self.bump(idx);
            return;
        }
        if self.items.len() >= self.capacity() {
            let evict_index = self.access_order.pop().unwrap();
            self.items.remove(evict_index);
            for idx in self.access_order.iter_mut() {
                if *idx > evict_index {
                    *idx -= 1;
                }
            }
        }
        self.items.push((key, value));
        self.access_order.insert(0, self.items.len() - 1);
    }
    fn bump(&mut self, index: usize) {
        let pos = self.access_order.iter().position(|&i| i == index).unwrap();
        self.access_order.remove(pos);
        self.access_order.insert(0, index);
    }
}
```

Now, let me explain what we just did. Everything is marked `pub` that needs to be visible outside the module: the structs, `new`, `get`, `put`, `capacity`, `len`, `name`, `contains`. The `bump` method is private because it is an internal helper.
Notice the where `K: PartialEq` bounds on `get`, `put`, and `contains`. These methods need to compare keys, so `K` must implement `PartialEq`. The `where` clause is placed on each method that needs it, not on the `impl` block. This is a stylistic choice. You could also put it on the `impl` block:
```rust
impl<'a, K: PartialEq, V> Cache<'a, K, V> {
    // all methods here
}
```
Either is fine. I prefer the method-level bounds when only some methods need the constraint. `capacity`, `len`, `new`, and `name` do not need `PartialEq`.

### The Demo in `src/main.rs`
Now let's wire everything together in `src/main.rs`. First, we declare the module and use the types:
```rust
mod cache;
use cache::{Cache, CacheConfig};
```
`mod cache;` tells Rust to look for `src/cache.rs` and load it as a module. The items inside are accessible as `cache::Cache`, `cache::CacheConfig`, etc.

Now the demo:
```rust
fn main() {
    let config = CacheConfig {
        max_capacity: 3,
        name: String::from("demo_cache"),
    };
    let mut cache = Cache::new(&config);
    cache.put("key1", 100);
    cache.put("key2", 200);
    cache.put("key3", 300);
    println!("Cache '{}' has {} items", cache.name(), cache.len());
    println!("Capacity: {}", cache.capacity());
    if let Some(value) = cache.get(&"key1") {
        println!("key1 = {}", value);
    }
    cache.put("key4", 400);
    println!("After inserting key4:");
    println!("Cache has {} items", cache.len());
    // key2 should have been evicted (LRU)
    if cache.contains(&"key2") {
        println!("key2 is still in cache (unexpected)");
    } else {
        println!("key2 was evicted (expected)");
    }
    if let Some(value) = cache.get(&"key3") {
        println!("key3 = {}", value);
    }
}

```

Now, let me explain why this compiles and works despite lifetimes being everywhere. The `config` is created first. It lives until the end of `main`. The `cache` is created with `Cache::new(&config)`, borrowing from `config`. The cache cannot outlive `config`. Since both are dropped at the end of `main` (cache first, then config, in reverse order of creation), the lifetimes are satisfied.

When we call `cache.get(&"key1")`, it returns `Option<&i32>`. The returned reference points into the cache's internal storage and remains valid for the duration of the borrow.

### Running the Project
Type this in your terminal:
```shell
cargo run
```
You should see output like this:

```shell
Cache 'demo_cache' has 3 items
Capacity: 3
key1 = 100
After inserting key4:
Cache has 3 items
key2 was evicted (expected)
key3 = 300
```
The cache evicted `key2` because it was the least recently used item. `key1` stayed in the cache because calling `get` moved it to the front of the access order.

## Conclusion
In this post, you learned about lifetimes, the three elision rules, and the `'static` lifetime. You built a generic LRU cache with a lifetime-annotated config reference and zero-copy get that returns `Option<&V>`, split into `src/cache.rs` and `src/main.rs`.
In the next article, we will learn about `HashMap` and build an **inverted index search engine**. See you soon.

If you like reading this, please subscribe and share this with others. It'll really help me and motivate me to keep publishing more such articles.
