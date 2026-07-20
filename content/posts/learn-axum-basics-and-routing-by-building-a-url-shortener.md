+++
title = "Learn Axum Basics and Routing by Building a URL Shortener"
description = "In this post, we are going to learn baics of Axum and routing and build a URL shortener in Axum. This is the first part of our backend series in Rust"
date = 2026-07-02
transparent = true

[taxonomies]
tags = ["rust", "backend", "axum"]
series = ["backend-engineering-with-axum"]

[extra]
hidden = true
+++


Welcome to the backend engineering series. If you followed the learning-rust series, you now understand ownership, borrowing, structs, enums, error handling, generics, lifetimes, closures, smart pointers, concurrency, and async/await. You built a thread pool and a raw HTTP/1.1 server from scratch over TCP. That was the foundation. Now we move up a layer.

![Axum Basics Cover Image](/images/axum-basics-cover.png)

In this series, we are going to learn backend engineering as practiced in Rust today, routing, persistence, authentication, caching, middleware, background jobs, WebSockets, API contracts, security hardening, testing, and deployment. Every article introduces a concept and then builds a standalone project around it. No shared codebase across articles. No capstone. Just a deliberate sequence where each concept is easiest to absorb once the previous one is in place.

The only prerequisite is that you have completed the learning-rust series or are comfortable with async Rust and Tokio. I will assume you know how `Arc`, `tokio::spawn`, and `.await` work.

In this post, we are going to **build a URL shortener with Axum**. But before that, we will learn what Axum actually is, how a request flows through it, from the TCP socket all the way to your handler function and why it's designed the way it is. We will learn about `Router`, `route()`, the `Handler` trait, path parameters, `State<T>`, and the `IntoResponse` trait. I promise you by the end of this article, Axum won't feel like a black box.

Let's start, I can't wait.

Get the source code from [here](https://github.com/MrSheerluck/url-shortener-in-axum)

## From Raw TCP to Axum

In the async/Tokio article, we built an HTTP server by hand. We called `TcpListener::bind`, accepted connections in a loop, read raw bytes from each socket, split the bytes on `\r\n` to find the request line, parsed headers manually, matched on the HTTP method, and wrote raw response bytes back with `socket.write_all`. It worked. It taught us what HTTP actually is under the hood.

But that approach has a problem: every new endpoint means more manual byte-parsing logic. Every new feature like path parameters, query strings, JSON bodies, middleware is something you have to build yourself. And the result, even for a simple server, is hundreds of lines of infrastructure code before you write a single line of actual business logic.

Axum solves exactly this. It sits on top of `hyper` (Rust's low-level HTTP library) and `tower` (a middleware and service abstraction), and gives you a clean set of abstractions: routes, extractors, responses, and state. You write a function. Axum calls it when a matching request arrives. You return something. Axum converts it into an HTTP response using the `IntoResponse` trait and writes it to the socket. Everything in between like parsing headers, routing, serialization, error conversion is handled by the framework.

Here is the mental model to hold onto: Axum is a layer cake.

```
Your handler function
       |
Axum (Router, extractors, IntoResponse)
       |
Tower (Service, Layer middleware)
       |
Hyper (HTTP/1.1 and HTTP/2 protocol handling)
       |
Tokio (async runtime, TCP sockets, I/O multiplexing)
```

Every request that arrives on a TCP socket bubbles up through Tokio (which handles the async I/O), through Hyper (which parses the raw bytes into an HTTP request representation), through Tower (which runs middleware), through Axum's routing layer (which matches the path and method to your handler), and finally into your function. The response travels back down the same stack in reverse.

If you built the raw HTTP/1.1 server from the async article, you have already built the bottom two layers by hand. Axum gives you the top three.
### What is Hyper?

Hyper is a low-level HTTP implementation. It parses the raw bytes received over a TCP connection into HTTP request values, manages connection lifecycles, implements HTTP/1.1 and HTTP/2, handles features like chunked transfer encoding, and encodes HTTP responses into bytes before writing them to the socket. Axum builds on top of Hyper rather than talking to TCP sockets directly.
### What is Tower?

Tower provides the `Service` trait:

```rust
pub trait Service<Request> {
    type Response;
    type Error;
    type Future: Future<Output = Result<Self::Response, Self::Error>>;

    fn poll_ready(&self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>>;
    fn call(&self, req: Request) -> Self::Future;
}
```

A `Service` is anything that takes a request and returns a future that resolves to a response. That is it. An Axum `Router` implements `Service`. A rate-limiting middleware is a `Service` that wraps another `Service`. Everything in the request pipeline is eventually represented as a Tower `Service`: routers implement `Service`, middleware wraps `Service`s, and Axum adapts your handler functions into `Service`s behind the scenes.

The `poll_ready` method lets a service indicate whether it is currently ready to receive another request. Tower uses this for backpressure. Most application code never interacts with it directly, so we'll ignore it in this series.

A `Layer` produces a new `Service` by wrapping an existing `Service`. When you call `.layer(some_middleware)` on a router, you are wrapping the router's `Service` inside the middleware's `Service`. Every request passes through the outer layer first, then the inner layer, then eventually reaches your handler.

We will go deep on Tower and middleware in Part 5. For now, just know it's there.

## Project Setup

Create a new project:

```
cargo new url_shortener
cd url_shortener
```

Open `Cargo.toml` and add the dependencies:

```toml
[package]
name = "url_shortener"
version = "0.1.0"
edition = "2024"

[dependencies]
axum = "0.8"
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
uuid = { version = "1", features = ["v4"] }
```

We have four dependencies:

- `axum` is the web framework
- `tokio` is the async runtime (Axum runs on top of it)
- `serde` and `serde_json` handle JSON serialization and deserialization
- `uuid` generates unique short codes for our URLs. The `v4` feature gives us random UUIDs

## The Simplest Possible Axum Server

Open `src/main.rs`, delete everything, and write this:

```rust
use axum::{routing::get, Router};
use tokio::net::TcpListener;

#[tokio::main]
async fn main() {
    let app = Router::new().route("/", get(root));

    let listener = TcpListener::bind("127.0.0.1:3000").await.unwrap();
    println!("Listening on http://127.0.0.1:3000");

    axum::serve(listener, app).await.unwrap();
}

async fn root() -> &'static str {
    "Hello, Axum!"
}
```

Now, let me explain what we just did.

`Router::new()` creates an empty router. `.route("/", get(root))` registers a route: when a `GET` request arrives at `/`, call the `root` function. `route()` takes a path and a method handler. `get(root)` is shorthand. Axum provides `get()`, `post()`, `put()`, `delete()`, `patch()`, `head()`, and `options()` for every HTTP method. Each of them wraps your function in the router's internal machinery.

`TcpListener::bind("127.0.0.1:3000").await` creates a TCP listener bound to port 3000. This is the same `TcpListener` from Tokio that we used in the async article. You create the listener yourself and pass ownership of it to `axum::serve`.

`axum::serve(listener, app)` is the entry point. It takes your listener and your router, and runs an event loop: accept connections from the listener, parse HTTP requests with Hyper, route them through your router, and write responses back. It runs until the process is killed or the listener is closed.

The `root` function is a handler. It returns `&'static str`. Axum knows how to convert `&'static str` into an HTTP response because `&str` implements the `IntoResponse` trait.

Run it:

```
cargo run
```

Visit `http://127.0.0.1:3000` in your browser or run `curl http://localhost:3000`. You should see `Hello, Axum!`.

## The Handler Trait and async fn

Why does `async fn root() -> &'static str` work as a handler? Because Axum implements the `Handler` trait for async functions that satisfy certain conditions. The implementation is generic over the function's arguments and return type.

You do not implement `Handler` yourself. The framework does it for you through a blanket impl. The rule is simple: any async function whose arguments all implement `FromRequestParts` (or `FromRequest` for the body) and whose return type implements `IntoResponse` is a valid handler.

Extractors implementing `FromRequest` consume the request body, so a handler can have only one body extractor. Extractors implementing `FromRequestParts` only inspect the request metadata (such as the path, headers, or state), so they can be freely combined.

This is what the `Handler` trait looks like, simplified:

```rust
pub trait Handler<T, S>: Clone + Send + Sized + 'static {
    type Future: Future<Output = Response> + Send + 'static;

    fn call(self, req: Request, state: S) -> Self::Future;
}
```

When Axum matches a route to your function, it calls `Handler::call`. The function's arguments are extracted from the request. The function runs. The return value is converted into an `http::Response` via `IntoResponse`. The response is written back to the socket.

You never see this machinery. You just write a function and Axum does the rest.

## IntoResponse - Why So Many Types Work

In the raw HTTP server, we built response strings by hand: `format!("HTTP/1.1 200 OK\r\nContent-Length: ...\r\n\r\n{}", body)`. That was tedious and error-prone.

Axum solves this with the `IntoResponse` trait:

```rust
pub trait IntoResponse {
    fn into_response(self) -> Response;
}
```

Anything that implements this trait can be returned from a handler. Axum provides implementations for:

| Type | What it produces |
|------|-----------------|
| `&'static str` | 200 OK with `text/plain; charset=utf-8` |
| `String` | 200 OK with `text/plain; charset=utf-8` |
| `StatusCode` | A response with just that status code, no body |
| `(StatusCode, T)` | A response with that status code and body `T` (where `T: IntoResponse`) |
| `(HeaderMap, T)` | A response with custom headers and body `T` |
| `(StatusCode, HeaderMap, T)` | Status code, custom headers, and body |
| `Json<T>` | 200 OK with `application/json` body (where `T: Serialize`) |
| `Html<T>` | 200 OK with `text/html; charset=utf-8` body |

The tuple implementations are important. They let you compose status codes and bodies without a single wrapper type:

```rust
async fn handler() -> (StatusCode, &'static str) {
    (StatusCode::NOT_FOUND, "nothing here")
}
```

This returns a 404 with a plain-text body. The tuple `(StatusCode, T)` implements `IntoResponse` by combining the status code from the first element with the body from the second. The body's `IntoResponse` implementation handles the `Content-Type` header and the actual bytes.

`Json<T>` is another key type. It wraps any `T: Serialize` and returns a 200 with `Content-Type: application/json`. If serialization fails, it returns a 500 Internal Server Error.

## State - Sharing Data Across Handlers

In the raw HTTP server, we used `Arc<PathBuf>` to share the serve directory across all connection tasks. Axum has the same need, your handlers often need access to shared data like a database pool, a configuration struct, or, in our case, the map of shortened URLs.

Axum provides `State<T>` for this:

```rust
use axum::extract::State;
use std::sync::Arc;

#[derive(Clone)]
struct AppState {
    message: String,
}

async fn handler(State(state): State<Arc<AppState>>) -> String {
    state.message.clone()
}

#[tokio::main]
async fn main() {
    let state = Arc::new(AppState {
        message: "hello from state".to_string(),
    });

    let app = Router::new()
        .route("/", get(handler))
        .with_state(state);

    let listener = TcpListener::bind("127.0.0.1:3000").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
```

Now, let me explain what we just did.

`State<Arc<AppState>>` is an extractor. When Axum calls your handler, it looks at the function's arguments and tries to extract each one from the request (or from the application state). `State<T>` extracts the shared state that you provided to the router via `.with_state()`.

`Arc<AppState>` is the actual state type. It implements `Clone`, and cloning an `Arc` is inexpensive because it only increments an atomic reference count. This makes it an ideal way to share immutable ownership of application state across all request handlers.

`.with_state(state)` attaches the state to the router. Every handler in that router (and any sub-routers merged into it) can extract it with `State<T>`.

> **Important:** The state type must be the same for the entire router. If you need different pieces of state in different handlers, put them all in one struct and wrap it in `Arc`.

## Path Parameters

In the raw HTTP server, we parsed paths manually, strip the leading `/`, check for `..`, join with the serve directory. For a URL shortener, we need something much simpler: extract a short code from the URL path like `/abc123`.

Axum handles this with `Path<T>`:

```rust
use axum::extract::Path;

async fn redirect(Path(code): Path<String>) -> String {
    format!("You requested code: {}", code)
}
```

When a request arrives at `GET /abc123`, Axum extracts `"abc123"` from the path, deserializes it into the type you specified (`String`), and passes it to your handler. `Path` implements `FromRequestParts`, just like `State`.

The path parameter pattern in the route definition uses `{name}` syntax:

```rust
let app = Router::new().route("/{code}", get(redirect));
```

A request to `/abc123` matches this route, and the `Path(code)` extractor gives you `"abc123"`.

> Axum uses the `{name}` syntax (not the deprecated `:name` syntax from older versions). If you see `:name` in old tutorials, replace it with `{name}`.

## The Project: URL Shortener

Now that you understand `Router`, handlers, `State`, `Path`, and `IntoResponse`, let's build a URL shortener.

Our program will:

- Accept a `POST /shorten` with a JSON body containing a long URL
- Generate a unique short code using UUID v4
- Store the mapping in memory
- Return the short code as JSON
- Accept a `GET /{code}` that looks up the code and issues a 302 redirect
- Return 404 if the code does not exist

To keep the focus on Axum itself, the application stores its data in memory using a `HashMap`. In later articles we will replace this with a real database using SQLx.

### What is a URL Shortener?

A URL shortener takes a long URL like `https://en.wikipedia.org/wiki/Uniform_Resource_Locator` and maps it to a short one like `https://sho.rt/abc123`. When someone visits the short URL, the server looks up the original long URL and redirects them.

The mapping is one-way: long URL → short code. There is no requirement to reverse-lookup a long URL to find its short code. This keeps things simple.

### The Full Code

Replace everything in `src/main.rs` with this:

```rust
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Redirect},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use tokio::net::TcpListener;
use uuid::Uuid;

#[derive(Clone)]
struct AppState {
    urls: Arc<RwLock<HashMap<String, String>>>,
}

#[derive(Deserialize)]
struct ShortenRequest {
    url: String,
}

#[derive(Serialize)]
struct ShortenResponse {
    short_url: String,
}

#[tokio::main]
async fn main() {
    let state = AppState {
        urls: Arc::new(RwLock::new(HashMap::new())),
    };

    let app = Router::new()
        .route("/shorten", post(shorten))
        .route("/{code}", get(redirect))
        .with_state(state);

    let listener = TcpListener::bind("127.0.0.1:3000").await.unwrap();
    println!("Listening on http://127.0.0.1:3000");

    axum::serve(listener, app).await.unwrap();
}

async fn shorten(
    State(state): State<AppState>,
    Json(payload): Json<ShortenRequest>,
) -> impl IntoResponse {
    let code = &Uuid::new_v4().to_string()[..8];

    state
        .urls
        .write()
        .unwrap()
        .insert(code.to_string(), payload.url);

    let short_url = format!("http://127.0.0.1:3000/{}", code);

    (
        StatusCode::CREATED,
        Json(ShortenResponse { short_url }),
    )
}

async fn redirect(
    State(state): State<AppState>,
    Path(code): Path<String>,
) -> impl IntoResponse {
    let urls = state.urls.read().unwrap();

    match urls.get(&code) {
        Some(long_url) => Redirect::to(long_url).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            "404 Not Found: No URL for this code",
        )
            .into_response(),
    }
}
```

Now, let me explain what we just did.

### The State

```rust
#[derive(Clone)]
struct AppState {
    urls: Arc<RwLock<HashMap<String, String>>>,
}
```

`AppState` holds our in-memory store, a `HashMap` mapping short codes to long URLs. It is wrapped in `Arc<RwLock<...>>` because multiple requests will read and write to it concurrently. `RwLock` allows many concurrent readers or one exclusive writer, which matches our access pattern: reads are common (every redirect) and writes are rare (only on shortening).

`#[derive(Clone)]` is necessary because Axum clones the state for internal use. Since `Arc` is cheap to clone, it only increments an atomic reference count, the derived `Clone` implementation simply creates another `Arc` pointing to the same `RwLock<HashMap<...>>`.

This example uses `std::sync::RwLock` because each critical section is very small and we never `.await` while holding the lock. If you need to hold a lock across asynchronous work, prefer `tokio::sync::RwLock`.
### The Request and Response Types

```rust
#[derive(Deserialize)]
struct ShortenRequest {
    url: String,
}

#[derive(Serialize)]
struct ShortenResponse {
    short_url: String,
}
```

`ShortenRequest` is what the client sends in the POST body. `#[derive(Deserialize)]` from `serde` tells the compiler to generate code that can parse this struct from JSON. `ShortenResponse` is what we send back. `#[derive(Serialize)]` generates code that converts this struct into JSON.

These types are used with the `Json<T>` extractor and response type. When Axum sees `Json<ShortenRequest>` as a handler argument, it reads the request body, parses the JSON, and  if it matches the struct, passes it to the handler. If the body is missing, malformed, or has the wrong types, Axum returns a 422 Unprocessable Entity automatically, before your handler ever runs.

### The Shorten Handler

```rust
async fn shorten(
    State(state): State<AppState>,
    Json(payload): Json<ShortenRequest>,
) -> impl IntoResponse {
    let code = &Uuid::new_v4().to_string()[..8];

    state
        .urls
        .write()
        .unwrap()
        .insert(code.to_string(), payload.url);

    let short_url = format!("http://127.0.0.1:3000/{}", code);

    (
        StatusCode::CREATED,
        Json(ShortenResponse { short_url }),
    )
}
```

The handler takes two extractors: `State<AppState>` (the shared state) and `Json<ShortenRequest>` (the parsed JSON body). Axum runs both extractors before calling the function. If either fails, the handler is never called and an error response is sent instead.

`Uuid::new_v4()` generates a random UUID like `a1b2c3d4-e5f6-7890-abcd-ef1234567890`. We take the first 8 characters (`a1b2c3d4`) as our short code. Eight hexadecimal characters provide roughly 4.3 billion possible codes. For this toy project that is more than sufficient, although a production URL shortener would still need to detect and handle collisions before storing a newly generated code.

`state.urls.write().unwrap()` acquires a write lock on the `RwLock`, giving us exclusive access to the `HashMap`. We insert the short code as the key and the long URL as the value. The lock is released when the `RwLockWriteGuard` goes out of scope at the end of the expression.

The return type is `impl IntoResponse`. This means "I return something that implements `IntoResponse`, but I am not naming the exact type." The actual type is `(StatusCode, Json<ShortenResponse>)`, which is a tuple. The tuple implementation sets the status code to 201 Created and the body to the JSON-serialized response.

### The Redirect Handler

```rust
async fn redirect(
    State(state): State<AppState>,
    Path(code): Path<String>,
) -> impl IntoResponse {
    let urls = state.urls.read().unwrap();

    match urls.get(&code) {
        Some(long_url) => Redirect::to(long_url).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            "404 Not Found: No URL for this code",
        )
            .into_response(),
    }
}
```

The `Path(code): Path<String>` extractor pulls the `{code}` segment from the URL path. When a user visits `/abc12345`, `code` is `"abc12345"`.

`state.urls.read().unwrap()` acquires a read lock. Multiple redirect requests can hold read locks simultaneously, they do not block each other. Only the `shorten` handler's write lock blocks readers.

`urls.get(&code)` returns an `Option<&String>`. If the code exists, we get the long URL and return a `Redirect::to(long_url)`. `Redirect` is an Axum response type that produces a 303 Found with a `Location` header. The browser follows the redirect automatically.

If the code does not exist, we return a 404 status with a plain-text body. Both branches call `.into_response()` explicitly. This is necessary because `match` arms must have the same type, and the two arms here produce different types (`Redirect` and `(StatusCode, &str)`). Calling `.into_response()` on each arm converts them both to `Response`, which is a single concrete type.

> **Why `impl IntoResponse` and not `Response`?** When the return type is `impl IntoResponse`, Axum calls `.into_response()` for you after your handler runs. But when different branches of a `match` return different types, you need to call `.into_response()` inside each branch to unify them yourself. The `impl IntoResponse` in the signature still works because `Response` implements `IntoResponse`.

## Running the Project

Start the server:

```
cargo run
```

You should see:

```
Listening on http://127.0.0.1:3000
```

### Shorten a URL

Open another terminal:

```
curl -X POST http://localhost:3000/shorten \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.rust-lang.org"}'
```

Response:

```json
{"short_url":"http://127.0.0.1:3000/a1b2c3d4"}
```

### Follow the Redirect

```
curl -v http://localhost:3000/a1b2c3d4
```

You should see:

```
* Request completely sent off
< HTTP/1.1 303 See Other
< location: https://www.rust-lang.org
< content-length: 0
```

Use `-L` to follow the redirect:

```
curl -L http://localhost:3000/a1b2c3d4
```

This fetches the Rust home page.

### Test a Missing Code

```
curl -v http://localhost:3000/nonexist
```

Response:

```
< HTTP/1.1 404 Not Found
404 Not Found: No URL for this code
```

### Test a Bad POST Body

```
curl -X POST http://localhost:3000/shorten \
  -H "Content-Type: application/json" \
  -d '{"not_url": 123}'
```

Response:

```
< HTTP/1.1 422 Unprocessable Entity
```

Axum rejected this before our handler ever ran because the JSON did not match `ShortenRequest`. The required field `url` was missing, so deserializing the request into `ShortenRequest` failed before the handler was called. This is the extractor at work, `Json<ShortenRequest>` validates the body and returns a 422 if it does not match.

## How a Request Flows Through - The Full Trace

Let's trace a single `GET /abc12345` request through every layer of the stack to understand what actually happens.

1. **Tokio**: A TCP packet arrives on port 3000. Tokio's I/O driver is notified that the listening socket is ready, the runtime schedules the appropriate async task, and that task reads the incoming bytes from the socket.

2. **Hyper**: Hyper parses the raw bytes into an HTTP request representation, extracting the method, URI, version, headers, and request body before passing it to the next layer.

3. **Tower**: The request enters the Tower service stack. If we had middleware (we do not in this project, but we will in Part 5), each `Layer` would get a chance to inspect or modify the request before passing it inward. The outermost layer runs first.

4. **Axum Router**: The router receives the request and efficiently matches the request path against the registered routes. The pattern `/{code}` matches `/abc12345`, captures the path segment, verifies the HTTP method is `GET`, and selects the `redirect` handler.

5. **Handler extraction**: Before calling `redirect`, Axum runs the extractors. `State<AppState>` clones the `Arc` (cheap, just increments a reference count). `Path<String>` deserializes `abc12345` into a `String`. Both succeed. The handler is called with these two arguments.

6. **Your handler**: `redirect` acquires a read lock, looks up the code in the `HashMap`, finds the long URL, and returns `Redirect::to(long_url).into_response()`. This produces an `http::Response<Body>` with status 302 and a `Location` header.

7. **Axum response**: The `Response` travels back through the router. Axum does nothing further, the response is complete.

8. **Tower**: The response travels back out through the middleware stack. Each layer gets a chance to inspect or modify the response.

9. **Hyper**: Hyper encodes HTTP responses into bytes before writing them to the socket: `HTTP/1.1 302 Found\r\nlocation: https://...\r\ncontent-length: 0\r\n\r\n`. It writes these bytes to the socket.

10. **Tokio**: The socket write is async. If the socket buffer is full, the task yields. When the buffer drains, the runtime wakes the task. The response finishes writing. The connection is closed (or reused, if keep-alive were enabled).

All of this happens in under a millisecond for a simple in-memory lookup. The async runtime can handle thousands of these concurrently on a handful of OS threads.

Compare this to the raw HTTP server from the async article. The flow is the same. The difference is that steps 3 through 7, routing, extraction, handler dispatch, response serialization  were all written by hand in that article, and now Axum does them for us. 

## What We Skipped

There are a few things I am intentionally skipping in this article:

- **Persistent storage**: Our URL mappings live in an in-memory `HashMap`. They disappear when the server restarts. In Part 3, we will add PostgreSQL persistence with SQLx.
- **Request validation**: We accept any string as a URL. A real service would validate the format, reject empty strings, and potentially check that the URL is reachable. We will cover request validation in Part 2.
- **Error handling**: We use `.unwrap()` on lock acquisition. In a production service, a poisoned lock (from a panic in another thread holding the lock) should be handled gracefully. We will build a proper `AppError` enum in Part 2.
- **Custom short codes**: We use random UUID prefixes. A real service might let users choose custom codes or use a different encoding scheme (like base62) for shorter URLs.
- **Tower middleware, logging, tracing, CORS**: These come in later parts, deliberately sequenced.
- **Graceful shutdown**: The server stops immediately on Ctrl+C without draining in-flight requests. Part 9 covers this.

> Everything we skipped in this article exists for a reason in real-world services. Rather than introducing that complexity all at once, we focused on the Axum request lifecycle, routing, state, path parameters, and response types. This is the foundation that every subsequent part builds on.

## Conclusion

In this post, you learned what Axum is and where it sits in the stack: on top of Hyper and Tower, running inside Tokio. You learned the `Handler` trait, why any async function that takes extractors and returns `IntoResponse` just works as a handler. You learned `IntoResponse`, how tuples, `Json<T>`, status codes, and `Redirect` compose into HTTP responses without any boilerplate. You learned `State<T>` for shared application state and `Path<T>` for path parameters.

You built a URL shortener from scratch. The server accepts `POST /shorten` with a JSON body, generates a random short code, stores the mapping in an `Arc<RwLock<HashMap>>`, and returns the short URL. `GET /{code}` looks up the code and issues a 302 redirect. Missing codes get a 404. Invalid JSON gets a 422.

This is the foundation of every Axum application you will ever write. Router, extractors, state, and responses. Everything else like middleware, custom extractors, WebSockets, streaming is built on top of these four concepts.

In the next article, we will learn about request bodies and error handling by building a Pastebin API. We will build a proper `AppError` enum, handle validation, and learn why Axum deliberately makes you decide every status code yourself instead of guessing. See you soon.

If you like reading this, please subscribe and share this with others. It will really help me and motivate me to keep publishing more such articles.
