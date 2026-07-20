+++
title = "Learn Rust Smart Pointers and Interior Mutability by Building Git Commit Graph Viewer"
description = "In this post, we are going to learn about smart pointers and interior mutability in Rust. Once we cover all the concepts, we will build a Git Commit Graph Viewer"
date = 2026-06-03
transparent = true

[taxonomies]
tags = ["rust", "project"]
series = ["learning-rust"]

[extra]
hidden = true
+++


In this post, we are going to learn about smart pointers and interior mutability in Rust. Once we cover all the concepts, we will build a **Git Commit Graph Viewer** that reads a real `.git` directory, parses every commit, builds a connected DAG (directed acyclic graph) using `Rc<RefCell<CommitNode>>` with `Weak` edges, and renders an ASCII graph of your commit history. I am really excited for this project and I hope you are too. I won't go too deep in theory, just practical and we will build our knowledge of these concepts over time with more articles.

The only prerequisite is that you have read the previous articles in this series, as I will assume you know ownership, borrowing, structs, enums, pattern matching, error handling, generics, traits, lifetimes, HashMap, iterators, and closures.

Get the source code from [here](https://github.com/MrSheerluck/git-commit-graph)

## What is a Smart Pointer

A pointer is a variable that holds a memory address. A smart pointer is a data structure that acts like a pointer but also has additional metadata and capabilities. In Rust, `String` and `Vec<T>` are technically smart pointers. They own heap-allocated data and manage it automatically.

But when people say "smart pointers" in Rust, they usually mean the types in the standard library that provide ownership and borrowing patterns beyond the basic reference: `Box<T>`, `Rc<T>`, `RefCell<T>`, `Weak<T>`, and later `Arc<T>` and `Mutex<T>`.

We will start with `Box` (which you have already seen) and build up to the more complex ones.

## Box Recap

You saw `Box<T>` in the article on closures. A `Box<T>` is the simplest smart pointer. It allocates a value on the heap and owns it. When the `Box` is dropped, the heap memory is freed.

```rust
let x = Box::new(42);
```

This stores `42` on the heap. The `Box` on the stack holds a pointer to it. You use `x` like a regular `i32` thanks to deref coercion.

The two main use cases for `Box` are recursive types (like our JSON parser's recursive `JsonValue` enum) and trait objects (`Box<dyn Trait>`). Both require heap allocation because the compiler cannot know the size of the type at compile time.

## Rc: Reference-Counted Smart Pointer

Now let's talk about `Rc<T>`. `Rc` stands for "Reference Counted." It enables multiple ownership. Multiple parts of your code can share ownership of the same value, and the value is dropped only when all owners are gone.

```rust
use std::rc::Rc;

let a = Rc::new(42);
let b = Rc::clone(&a);
let c = Rc::clone(&a);
```

Here, `a`, `b`, and `c` all point to the same heap allocation containing `42`. `Rc::clone` does not deep-copy the data. It increments a reference counter. When `a`, `b`, and `c` all go out of scope, the counter reaches zero and the data is freed.

Let me explain what `Rc` gives us. Without `Rc`, each value has exactly one owner. If we want to share a value between multiple structs, we could use references with lifetimes, but lifetimes force us to think about who outlives whom. `Rc` says: "Instead of enforcing a single owner, I will keep a runtime reference count and free the data when the last owner disappears."

```rust
use std::rc::Rc;

let data = Rc::new(vec![1, 2, 3]);
let shared1 = data.clone();
let shared2 = data.clone();

println!("Reference count: {}", Rc::strong_count(&data));
```

`Rc::strong_count` tells you how many handles point to the same allocation. In this case, it would print `3` because `data`, `shared1`, and `shared2` all share ownership.

There is an important limitation: `Rc` is not thread-safe. It uses non-atomic reference counting, which is faster but unsafe across threads. For multi-threaded code, you use `Arc` (Atomic Reference Counted), which we will cover in a future article.

## RefCell: Interior Mutability

Now we get to the interesting one. `RefCell<T>` provides interior mutability. "Interior mutability" is the ability to mutate data even when the `RefCell` itself is immutable.

Normally, Rust's borrow rules are enforced at compile time:
- You can have either many immutable references or one mutable reference
- These rules are checked and enforced before your program runs

`RefCell<T>` moves these checks from compile time to runtime. You can always call `borrow` or `borrow_mut` on a `RefCell`. If you violate the rules, your program will panic at runtime.

```rust
use std::cell::RefCell;

let x = RefCell::new(42);

let r1 = x.borrow();
let r2 = x.borrow();
// Both immutable borrows are fine
println!("{} {}", r1, r2);

let mut r3 = x.borrow_mut();
*r3 = 100;
// This would panic: already immutably borrowed
// let r4 = x.borrow();
```

`borrow` returns a `Ref<T>`, which derefs to `&T`. `borrow_mut` returns a `RefMut<T>`, which derefs to `&mut T`. Both types automatically release the borrow when they go out of scope.

The runtime checking is why this pattern is called "interior mutability." The `RefCell` can be accessed through an immutable binding or immutable reference, yet the value inside it can still be mutated through `borrow_mut`.

Why would you want this? Consider a struct with a method that takes `&self` but needs to modify internal state:

```rust
use std::cell::RefCell;

struct Counter {
    count: RefCell<u32>,
}

impl Counter {
    fn increment(&self) {
        *self.count.borrow_mut() += 1;
    }

    fn value(&self) -> u32 {
        *self.count.borrow()
    }
}
```

The `increment` method takes `&self` (an immutable reference), but it can still mutate `count` through `RefCell`. Without `RefCell`, we would need `&mut self` everywhere, which would make the code harder to use.

## `Rc<RefCell<T>>`: The Shared Mutable Pattern

Now combine `Rc` and `RefCell`. `Rc` gives us shared ownership. `RefCell` gives us interior mutability. Together, they give us shared mutable state.

This is one of the most common patterns in single-threaded Rust code.

```rust
use std::rc::Rc;
use std::cell::RefCell;

let shared = Rc::new(RefCell::new(42));

let a = Rc::clone(&shared);
let b = Rc::clone(&shared);

*a.borrow_mut() += 1;

println!("{}", shared.borrow()); // 43
println!("{}", a.borrow());      // 43
println!("{}", b.borrow());      // 43
```

All three handles see the same value because they share the same `RefCell`. Modifying through any handle affects all of them.

Let me read `Rc<RefCell<T>>` from the inside out:

- `T` is the actual data
- `RefCell<T>` wraps the data with runtime borrow checking
- `Rc<RefCell<T>>` stores a `RefCell<T>` inside an `Rc`-managed heap allocation and enables multiple owners.

You will see this pattern everywhere in Rust code that needs shared mutable state.

## The Problem: Rc Cycles

`Rc` has a problem. If two `Rc` values reference each other, they form a cycle. Neither will ever have a reference count of zero. The memory leaks.

```rust
use std::rc::Rc;
use std::cell::RefCell;

struct Node {
    value: i32,
    next: Option<Rc<RefCell<Node>>>,
}

let a = Rc::new(RefCell::new(Node { value: 1, next: None }));
let b = Rc::new(RefCell::new(Node { value: 2, next: None }));

a.borrow_mut().next = Some(Rc::clone(&b));
b.borrow_mut().next = Some(Rc::clone(&a));
// Now a and b point to each other. Neither will ever be dropped.
```

This is a memory leak. `Rc` cannot detect cycles.

Now, a Git commit graph is a DAG (directed acyclic graph), but that does not automatically mean `Rc` is safe to use in every direction. The important distinction is between the commit graph and the ownership graph created by our smart pointers.

Suppose a parent stores an `Rc` to its child, and the child stores an `Rc` back to its parent. The commit graph is still a DAG, but the ownership graph now contains a cycle. Neither node can ever reach a strong reference count of zero, so the memory leaks.

`Weak<T>` solves this problem. We make the graph edges non-owning references. The `HashMap` is the sole owner of every node through `Rc`, while the parent/child relationships are represented using `Weak`. When the `HashMap` is dropped, every strong reference disappears and the entire graph is freed correctly.

## Weak: Non-Owning References

`Weak<T>` is the solution. `Weak` is a version of `Rc` that does not own the value. It does not increment the strong reference count. The value can be dropped even while `Weak` references exist.

```rust
use std::rc::{Rc, Weak};
use std::cell::RefCell;

let strong = Rc::new(42);
let weak = Rc::downgrade(&strong);
// strong_count = 1, weak_count = 1

drop(strong);
// strong_count = 0, data is freed

match weak.upgrade() {
    Some(value) => println!("Still alive: {}", value),
    None => println!("Data was dropped"),
}
```

`Rc::downgrade` creates a `Weak` reference from an `Rc`. `Weak::upgrade` tries to get back an `Option<Rc<T>>`. If the data has been dropped (all strong references are gone), `upgrade` returns `None`.

The naming comes from strong references vs weak references. A strong reference keeps the value alive. A weak reference allows the value to be dropped.

| Pointer | Ownership | Can access data | Prevents drop | Use case |
|---|---|---|---|---|
| `Rc<T>` | Shared | Yes | Yes | Multiple owners |
| `Weak<T>` | None | Via `upgrade` | No | Break cycles, caches, graph edges |

This is exactly what we need for our commit graph. A parent commit can be referenced by many children through `Weak` pointers. The HashMap holds the strong references. When we finish traversing the graph, the HashMap is dropped, all strong counts hit zero, and all nodes are freed, even though they still have `Weak` edges pointing between them.

## The Project: Git Commit Graph Viewer

Now that you understand `Box`, `Rc`, `RefCell`, and `Weak`, let's build a Git Commit Graph Viewer.

Our program will:

- Accept a path to a `.git` directory
- Read and decompress every commit object from `.git/objects/`
- Build a connected graph of `CommitNode` structs using `Rc<RefCell<>>`
- Wire up parent and child edges as `Weak<>` references
- Render an ASCII graph showing the commit history with branch labels

You already built a Git Object Store Reader in Phase 8. That project parsed commits and rendered `git log --oneline` output. In this project, we build on that code, but instead of a flat HashMap of disconnected commits, we build a **fully connected graph** where each node knows its parents and children through smart pointers.

## Project Setup

Open your terminal and run:

```bash
cargo new commit_graph
cd commit_graph
```

Now open `Cargo.toml` and add the dependency:

```toml
[package]
name = "commit_graph"
version = "0.1.0"
edition = "2024"

[dependencies]
flate2 = "1"
```

The only external dependency is `flate2` for zlib decompression. Everything else `Rc`, `RefCell`, `Weak`, `HashMap` comes from the standard library.

Open `src/main.rs` and delete everything.

### Imports

```rust
use flate2::read::ZlibDecoder;
use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Read;
use std::path::Path;
use std::rc::{Rc, Weak};
```

- `flate2::read::ZlibDecoder` decompresses Git's zlib-compressed object files
- `std::cell::RefCell` provides interior mutability for our graph edges
- `std::collections::HashMap` stores the node lookup (hash → `Rc<RefCell<CommitNode>>`)
- `std::rc::{Rc, Weak}` provides shared ownership and non-owning references

### The CommitNode Struct

```rust
struct CommitNode {
    hash: String,
    short_hash: String,
    message: String,
    timestamp: u64,
    parents: RefCell<Vec<Weak<RefCell<CommitNode>>>>,
    children: RefCell<Vec<Weak<RefCell<CommitNode>>>>,
}
```

Let me read this struct from the inside out:

- `CommitNode` is a vertex in our graph. It represents one git commit.
- `hash` is the full 40-character SHA-1 hash. `short_hash` is the first 7 characters for display.
- `message` is the first line of the commit message.
- `timestamp` is the Unix timestamp from the commit's author line.

Now the key parts: `parents` and `children` are both `RefCell<Vec<Weak<RefCell<CommitNode>>>>`.

- `Weak<RefCell<CommitNode>>` is a non-owning reference to another node in the graph. The node lives in a `HashMap` behind an `Rc`. The `Weak` points to it without keeping it alive.
- `Vec<Weak<...>>` holds multiple such edges (a commit can have multiple parents and multiple children).
- `RefCell<Vec<...>>` enables interior mutability. We can push edges into these `Vec`s even when we only have an immutable reference to the node.

Why `RefCell`? Because after we create a `CommitNode` and store it behind `Rc`, we need to wire up its edges. The node already exists, the `Rc` is in the HashMap. Without `RefCell`, we would need `&mut CommitNode` to push into the `Vec`s, and you cannot get `&mut` from an `Rc`. With `RefCell`, we call `borrow_mut()` on the `RefCell`, which gives us runtime-checked mutable access to the `Vec`, and we push our `Weak` edges into it.

### The Raw Commit

We need a temporary struct to hold the raw data we parse from git objects:

```rust
struct RawCommit {
    parent_hashes: Vec<String>,
    author: String,
    timestamp: u64,
    message: String,
}
```

`RawCommit` holds the data as it comes out of the object file. It stores parent hashes as `String`s (not references) because after we parse all commits, we do a second pass to resolve those strings into actual `Weak` references to the corresponding nodes.

### Reading Git Objects

These functions are the same as in Phase 8. I will include them here with brief explanations so the code is self-contained.

```rust
fn read_head(git_dir: &Path) -> Option<String> {
    let content = fs::read_to_string(git_dir.join("HEAD")).ok()?;
    Some(content.trim().to_string())
}

fn resolve_ref(git_dir: &Path, reference: &str) -> Option<String> {
    if reference.starts_with("ref: ") {
        let ref_path = &reference[5..];
        fs::read_to_string(git_dir.join(ref_path))
            .ok()
            .map(|s| s.trim().to_string())
    } else {
        Some(reference.to_string())
    }
}

fn read_object(git_dir: &Path, hash: &str) -> Vec<u8> {
    let object_path = git_dir
        .join("objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    let compressed = fs::read(&object_path)
        .unwrap_or_else(|_| panic!("Failed to read object: {}", hash));
    let mut decoder = ZlibDecoder::new(&compressed[..]);
    let mut decompressed = Vec::new();
    decoder.read_to_end(&mut decompressed)
        .unwrap_or_else(|_| panic!("Failed to decompress object: {}", hash));
    decompressed
}
```

Now, let me explain what we just did. `read_head` reads the `.git/HEAD` file to find out which branch we are on. `resolve_ref` follows a symbolic reference like `ref: refs/heads/main` to its actual commit hash. `read_object` constructs the path `.git/objects/XX/YYYY...`, reads the file, and decompresses it with zlib.

### Parsing Object Headers and Commits

```rust
fn parse_object(data: &[u8]) -> (&str, &[u8]) {
    let header_end = data.iter().position(|&b| b == 0)
        .expect("Invalid object: no null byte");
    let header = std::str::from_utf8(&data[..header_end])
        .expect("Invalid object: header not valid UTF-8");
    let content = &data[header_end + 1..];
    let mut parts = header.splitn(2, ' ');
    let obj_type = parts.next().unwrap();
    let _size = parts.next().unwrap();
    (obj_type, content)
}

fn parse_commit(content: &[u8]) -> RawCommit {
    let content_str = std::str::from_utf8(content)
        .expect("Invalid commit: not valid UTF-8");
    let mut parent_hashes = Vec::new();
    let mut author = String::new();
    let mut timestamp: u64 = 0;
    let mut message = String::new();
    let mut in_message = false;

    for line in content_str.lines() {
        if in_message {
            if !message.is_empty() {
                message.push('\n');
            }
            message.push_str(line);
            continue;
        }
        if line.is_empty() {
            in_message = true;
            continue;
        }
        if let Some(hash) = line.strip_prefix("parent ") {
            parent_hashes.push(hash.to_string());
        } else if let Some(author_line) = line.strip_prefix("author ") {
            author = author_line.to_string();
            if let Some(last_space) = author_line.rfind(' ') {
                if let Some(prev_space) = author_line[..last_space].rfind(' ') {
                    let ts_str = &author_line[prev_space + 1..last_space];
                    if let Ok(ts) = ts_str.parse::<u64>() {
                        timestamp = ts;
                    }
                }
            }
        }
    }

    RawCommit {
        parent_hashes,
        author,
        timestamp,
        message,
    }
}
```

Now, let me explain what we just did. `parse_object` splits the decompressed bytes into the header (before the null byte) and the content (after it). The header contains the object type and size. `parse_commit` walks through the lines of the commit content, collecting parent hashes, the author timestamp, and the commit message. We skip the `tree` line since we only care about the graph structure. The timestamp parsing extracts the Unix seconds from the author line, which looks like `author Name <email> 1234567890 +0000`.

### Reading All Commits

```rust
fn read_all_commits(git_dir: &Path, head_hash: &str) -> HashMap<String, RawCommit> {
    let mut raw_commits = HashMap::new();
    read_commit_recursive(git_dir, head_hash, &mut raw_commits);
    raw_commits
}

fn read_commit_recursive(
    git_dir: &Path,
    hash: &str,
    raw_commits: &mut HashMap<String, RawCommit>,
) {
    if raw_commits.contains_key(hash) {
        return;
    }
    let data = read_object(git_dir, hash);
    let (obj_type, content) = parse_object(&data);
    match obj_type {
        "commit" => {
            let commit = parse_commit(content);
            for parent in &commit.parent_hashes {
                read_commit_recursive(git_dir, parent, raw_commits);
            }
            raw_commits.insert(hash.to_string(), commit);
        }
        _ => panic!("Expected commit object, got {}", obj_type),
    }
}
```

Now, let me explain what we just did. `read_commit_recursive` walks the entire commit graph from a starting hash, recursively reading every parent. The `HashMap` acts as a cache: if we have already read a commit hash, we return immediately so we never read the same object twice. This handles the case where two branches share common ancestors, the shared history is parsed only once. After this function returns, `raw_commits` contains every commit reachable from `head_hash`.

### Reading All Branches

To support rendering branch labels, we also read every branch reference:

```rust
fn read_all_branches(git_dir: &Path) -> Vec<(String, String)> {
    let mut branches = Vec::new();
    let heads_dir = git_dir.join("refs").join("heads");
    if let Ok(entries) = fs::read_dir(&heads_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if let Ok(hash) = fs::read_to_string(&path) {
                    branches.push((name.to_string(), hash.trim().to_string()));
                }
            }
        }
    }
    branches
}
```

Now, let me explain what we just did. `read_all_branches` reads loose local branch references from `.git/refs/heads/`. In many repositories, each local branch appears as a file containing the branch tip's commit hash. Git can also store references in `packed-refs`, but for simplicity this implementation only reads loose branch references.

### Building the Graph: First Pass - Creating Nodes

Now we get to the core of the article: building the graph using smart pointers. This happens in two passes.

In the first pass, we create an `Rc<RefCell<CommitNode>>` for every raw commit and store it in a `HashMap`:

```rust
fn build_graph(
    raw_commits: &HashMap<String, RawCommit>,
) -> HashMap<String, Rc<RefCell<CommitNode>>> {
    let mut nodes: HashMap<String, Rc<RefCell<CommitNode>>> = HashMap::new();

    for (hash, raw) in raw_commits {
        let node = Rc::new(RefCell::new(CommitNode {
            hash: hash.clone(),
            short_hash: hash[..7].to_string(),
            message: raw.message.lines().next().unwrap_or("").to_string(),
            timestamp: raw.timestamp,
            parents: RefCell::new(Vec::new()),
            children: RefCell::new(Vec::new()),
        }));
        nodes.insert(hash.clone(), node);
    }

    nodes
}
```

Now, let me explain what we just did. For each raw commit, we create an `Rc::new(RefCell::new(CommitNode { ... }))`. The `RefCell` enables interior mutability so we can later wire up edges. The `Rc` enables shared ownership: the HashMap holds one strong reference, and later each child will hold a `Weak` reference pointing back to the parent. Both `parents` and `children` start as empty `Vec`s, we populate them in the second pass.

 Let me trace the memory layout. The `HashMap` key is a `String` (the commit hash). The value is an `Rc<RefCell<CommitNode>>`. The `Rc` stored in the HashMap points to a heap allocation containing the `RefCell<CommitNode>`. The `CommitNode` itself lives inside that allocation.

 Fields such as `String` and `Vec` are stored inline inside the `CommitNode`, but they manage their own heap allocations for their contents. For example, the `hash` field contains a `String` value inside the struct, while the actual string bytes live in a separate heap allocation. Likewise, `parents` and `children` contain `Vec`s whose elements live in separate heap allocations.

### Building the Graph: Second Pass - Wiring Edges

In the second pass, we walk through every node and wire up its parent and child edges using `Weak` references:

```rust
fn wire_edges(
    nodes: &HashMap<String, Rc<RefCell<CommitNode>>>,
    raw_commits: &HashMap<String, RawCommit>,
) {
    for (hash, node) in nodes {
        if let Some(raw) = raw_commits.get(hash) {
            for parent_hash in &raw.parent_hashes {
                if let Some(parent_node) = nodes.get(parent_hash) {
                    // Add parent as Weak reference to current node
                    node.borrow()
                        .parents
                        .borrow_mut()
                        .push(Rc::downgrade(parent_node));

                    // Add current node as child (Weak) to parent node
                    parent_node
                        .borrow()
                        .children
                        .borrow_mut()
                        .push(Rc::downgrade(node));
                }
            }
        }
    }
}
```

Now, let me explain what we just did. This is where `RefCell`'s interior mutability shines.

We iterate over every node in the graph. For each node, we look at its raw commit to find its parent hashes. For each parent hash, we look up the parent's `Rc<RefCell<CommitNode>>` in the `nodes` HashMap.

Then we do two things:

1. **Parent edge**: We push a `Weak` reference to the parent into the current node's `parents` Vec. We get mutable access to the Vec through `node.borrow().parents.borrow_mut()`. The first `.borrow()` gets an immutable reference to the `RefCell<CommitNode>`. The second `.borrow_mut()` gets mutable access to the `Vec` inside it.

2. **Child edge**: We push a `Weak` reference to the current node into the parent node's `children` Vec. This is the reverse direction. After this second pass, every node knows both its parents and its children.

`Rc::downgrade` takes an `&Rc<T>` and returns a `Weak<T>`. The strong count does not change. The weak count increments. This is important: the `HashMap` is the only thing keeping nodes alive through strong references. The edges are all `Weak`, so they do not prevent any node from being dropped if we remove it from the `HashMap`.

Let me also highlight why we need `RefCell` here. We already have an `Rc<RefCell<CommitNode>>` from the HashMap. We could also get the node by borrowing the HashMap: `nodes.get(parent_hash)` gives us an `Option<&Rc<RefCell<CommitNode>>>`. But we cannot call `parent_node.borrow_mut()` directly on the CommitNode because we only have a shared reference through `Rc`. The `RefCell` layer is what gives us the ability to call `borrow()` and `borrow_mut()` on a shared reference.

### Walking the Graph

Now let's write functions that walk the graph using `Weak::upgrade`:

```rust
fn walk_first_parent_chain(
    nodes: &HashMap<String, Rc<RefCell<CommitNode>>>,
    start_hash: &str,
) -> Vec<String> {
    let mut path = Vec::new();
    let mut current_hash = start_hash.to_string();

    loop {
        if let Some(node) = nodes.get(&current_hash) {
            let n = node.borrow();
            path.push(current_hash.clone());

            match n.parents.borrow().first() {
                Some(first_parent) => match first_parent.upgrade() {
                    Some(parent) => current_hash = parent.borrow().hash.clone(),
                    None => break,
                },
                None => break,
            }
        } else {
            break;
        }
    }

    path
}
```

Now, let me explain what we just did. This function walks the first-parent chain from a starting hash to the root commit. For each commit, it:

1. Looks up the node in the `nodes` HashMap
2. Borrows it to access `parents`
3. Takes the first parent (the one in the `first()` position)
4. Calls `upgrade()` on the `Weak` reference. If the parent node still exists (strong count > 0), `upgrade` returns `Some(Rc<RefCell<CommitNode>>)`. If the parent was dropped (strong count == 0), it returns `None`.
5. Extracts the parent's hash and continues the loop

The `upgrade()` call is the bridge between the `Weak` world and the `Rc` world. Since the HashMap holds all strong references, every node is guaranteed to exist. But the type system forces us to handle the `Option` case anyway, because `Weak<T>` makes no compile-time guarantee that the allocation is still alive.

### Rendering the Graph

Now let's render the commit graph as ASCII art. The output is inspired by `git log --graph --oneline --all`:

```bash
* 7a8b9c0 (HEAD -> main) Latest commit
* 1b2c3d4 Add feature X
|\
| * 5e6f7g8 (feature) Fix bug in sidebar
|/
* 1a2b3c4 Initial commit
```

The `*` marks a commit. The `|\` marks a merge point. The `| *` lines represent commits that belong to a merged side branch. The `|/` marks where that branch reconnects to the main line in our simplified renderer.

```rust
fn render_graph(
    nodes: &HashMap<String, Rc<RefCell<CommitNode>>>,
    head_hash: &str,
    branches: &[(String, String)],
) {
    let branch_map: HashMap<&str, &str> = branches
        .iter()
        .map(|(name, hash)| (hash.as_str(), name.as_str()))
        .collect();

    let main_line = walk_first_parent_chain(nodes, head_hash);
    let main_set: HashSet<&str> = main_line.iter().map(|h| h.as_str()).collect();
    let mut shown: HashMap<String, bool> = HashMap::new();

    for hash in &main_line {
        if let Some(node) = nodes.get(hash) {
            let n = node.borrow();
            shown.insert(hash.clone(), true);

            // Check if this commit has additional parents (merge commit)
            let parents: Vec<Rc<RefCell<CommitNode>>> = n
                .parents
                .borrow()
                .iter()
                .filter_map(|w| w.upgrade())
                .collect();

            if parents.len() > 1 {
                // This is a merge commit. Show merged branches before showing the merge.
                for parent in parents.iter().skip(1) {
                    let p = parent.borrow();
                    let side_line = walk_first_parent_chain(nodes, &p.hash);

                    println!("|\\");
                    for side_hash in &side_line {
                        if main_set.contains(side_hash.as_str()) {
                            break;
                        }
                        let label = branch_map
                            .get(side_hash.as_str())
                            .map(|name| format!(" ({})", name))
                            .unwrap_or_default();

                        if let Some(side_node) = nodes.get(side_hash) {
                            let sn = side_node.borrow();
                            println!("| * {} {}{}", sn.short_hash, sn.message, label);
                            shown.insert(side_hash.clone(), true);
                        }
                    }
                    println!("|/");
                }
            }

            let label = branch_map
                .get(hash.as_str())
                .map(|name| format!(" ({})", name))
                .unwrap_or_default();

            println!("* {} {}{}", n.short_hash, n.message, label);
        }
    }

    // Show any branches whose tips weren't on the main line
    for (branch_name, branch_hash) in branches {
        if !shown.contains_key(branch_hash.as_str()) {
            if let Some(_node) = nodes.get(branch_hash.as_str()) {
                let side_line = walk_first_parent_chain(nodes, branch_hash);
                println!("\n  (unconnected branch '{}')", branch_name);
                for side_hash in &side_line {
                    if let Some(side_node) = nodes.get(side_hash) {
                        let sn = side_node.borrow();
                        println!("    * {} {}", sn.short_hash, sn.message);
                    }
                    if shown.contains_key(side_hash) {
                        break;
                    }
                }
            }
        }
    }

    // Print graph statistics
    println!("\n{}", "-".repeat(50));
    println!("Graph statistics:");
    println!("  Total commits: {}", nodes.len());
    println!("  Branch refs: {}", branches.len());

    let merge_count = nodes
        .values()
        .filter(|node| node.borrow().parents.borrow().len() > 1)
        .count();
    println!("  Merge commits: {}", merge_count);

    let root_count = nodes
        .values()
        .filter(|node| node.borrow().parents.borrow().is_empty())
        .count();
    println!("  Root commits:   {}", root_count);

    let timestamps: Vec<u64> = nodes
        .values()
        .map(|node| node.borrow().timestamp)
        .collect();
    if let (Some(min), Some(max)) = (timestamps.iter().min(), timestamps.iter().max()) {
        println!("  Oldest commit:  {} (Unix epoch)", min);
        println!("  Newest commit:  {} (Unix epoch)", max);
    }
}
```

Now, let me explain what we just did. The renderer walks the first-parent chain from HEAD (the "main line"). For each commit on the main line, it checks if the commit is a merge commit (has more than one parent). If it does, it walks the first-parent chain of each additional parent and prints them as side branches with pipe characters.

The key detail is `main_set: HashSet<&str>`, a set of all hashes on the main line. When rendering side branches, if we hit a commit that's already in the main line (the merge base), we `break`. This prevents shared ancestors from appearing twice. Only commits unique to the feature branch are shown in the `| *` section.

The `branch_map` is a lookup from commit hash to branch name. We use it to label commits that are at the tip of a branch. For example, if `refs/heads/main` points to hash `7a8b9c0`, we label that commit `(main)`.

After rendering the main line, we check for branches whose tips weren't on the main line. This can happen if you have an unmerged branch. We render those separately.

Finally, we print graph statistics and use the `timestamp` field (extracted from the commit's author line) to show the oldest and newest commit.

### Demonstrating RefCounts

Let's write a small function that demonstrates the reference counting in action:

```rust
fn print_refcounts(nodes: &HashMap<String, Rc<RefCell<CommitNode>>>) {
    println!("Reference counts (nodes with at least one weak edge):");
    for (hash, node) in nodes {
        let strong = Rc::strong_count(node);
        let weak = Rc::weak_count(node);
        if weak > 0 {
            println!(
                "  {} has {} strong, {} weak references",
                &hash[..7], strong, weak
            );
        }
    }
}
```

Now, let me explain what we just did. `Rc::strong_count` tells us how many `Rc` handles point to this allocation. In our case, this should always be 1 because only the HashMap holds an `Rc`. All edges are `Weak`. `Rc::weak_count` tells us how many `Weak` handles point to this allocation. For example, a commit with one parent and two children may have three weak references associated with it: one stored in its own `parents` list and two stored in its children's `parents` lists. The exact weak count depends on the structure of the graph.
### Putting It All Together in main

```rust
fn main() {
    let args: Vec<String> = std::env::args().collect();
    let git_dir = if args.len() > 1 {
        Path::new(&args[1]).to_path_buf()
    } else {
        Path::new(".git").to_path_buf()
    };

    let head = match read_head(&git_dir) {
        Some(h) => h,
        None => {
            eprintln!("Error: {} is not a git repository (no HEAD file)", git_dir.display());
            return;
        }
    };
    let head_hash = match resolve_ref(&git_dir, &head) {
        Some(h) => h,
        None => {
            eprintln!("Error: failed to resolve HEAD reference '{}'", head);
            return;
        }
    };
    let branches = read_all_branches(&git_dir);

    println!("Reading commits from {}...", git_dir.display());
    let raw_commits = read_all_commits(&git_dir, &head_hash);
    println!("Parsed {} commits.\n", raw_commits.len());

    // Step 1: Create nodes (first pass)
    let graph = build_graph(&raw_commits);

    // Step 2: Wire edges (second pass, uses interior mutability)
    wire_edges(&graph, &raw_commits);

    // Show ref counts before rendering
    print_refcounts(&graph);

    // Render the graph
    println!("\nCommit Graph:\n");
    render_graph(&graph, &head_hash, &branches);
}
```

Now, let me explain what we just did. `main` reads command-line arguments, resolves HEAD, and reads all branches. If the `.git` directory doesn't exist or HEAD can't be resolved, it prints a clear error and exits gracefully instead of panicking. Then it parses all commits, builds the graph in two passes, prints reference counts, and renders the graph. The two-pass approach for `build_graph` and `wire_edges` is the key pattern: you cannot wire edges until all nodes exist, because a parent hash can only be resolved to a `Weak` reference if the parent node's `Rc` already exists in the HashMap.

### Running The Project

Type this in your terminal:

```bash
cargo run -- /path/to/some/.git
```

Or from inside a git repository:

```bash
cargo run
```

You should see output like this:

```bash
Reading commits from .git...
Parsed 12 commits.

Reference counts:
  a1b2c3d has 1 strong, 3 weak references
  d4e5f6g has 1 strong, 2 weak references
  7a8b9c0 has 1 strong, 1 weak references

Commit Graph:

* 7a8b9c0 (main) Latest commit
* 1b2c3d4 Add feature X
|\
| * 5e6f7g8 (feature) Fix bug in sidebar
|/
* 1a2b3c4 Refactor utils
* f8e7d6c Initial commit

--------------------------------------------------
Graph statistics:
  Total commits: 12
  Branch refs:    2
  Merge commits:  1
  Root commits:   1
  Oldest commit:  1746316800 (Unix epoch)
  Newest commit:  1748736000 (Unix epoch)
```

The first parent of the merge commit `1b2c3d4` is `1a2b3c4` (the main line), so that's where the main line continues. The second parent is `5e6f7g8` (the feature branch), which is rendered as a side branch. The `main_set` check ensures only the unique feature branch commits appear under `| *`, shared ancestors stay on the main line.

## How It All Fits Together

Let's trace through the lifecycle of a commit node in our graph:

1. **Creation**: `Rc::new(RefCell::new(CommitNode { ... }))` allocates the node on the heap. The `Rc` lives in the HashMap, which is the sole strong owner. Strong count = 1.

2. **Wiring**: During `wire_edges`, for a commit with one parent and two children, `Rc::downgrade` is called three times: once for the parent edge in this node, and twice for the child edges from the parent and child nodes into this node. Strong count stays at 1. Weak count becomes 3.

3. **Walking**: When `render_graph` traverses the graph, each call to `walk_first_parent_chain` calls `upgrade()` on `Weak` handles. Each `upgrade()` temporarily increments the strong count (so the node cannot be dropped mid-traversal), gives us an `Rc<RefCell<CommitNode>>`, lets us borrow and read it, then the temporary `Rc` is dropped and the strong count returns to 1.

4. **Cleanup**: When `main` returns, the `HashMap` is dropped, which drops all its keys (Strings) and values (Rcs). The last strong reference to each node is dropped. Strong count hits 0 for every node. All nodes are freed. The `Weak` handles in parents and children become invalid. Any future `upgrade()` would return `None`.

## Conclusion

In this post, you learned about Rust's smart pointers: `Box<T>`, `Rc<T>`, `RefCell<T>`, and `Weak<T>`. You learned how `Rc<RefCell<T>>` provides shared mutable state in single-threaded code, and how `Weak<T>` enables non-owning references that do not prevent deallocation. You built a Git Commit Graph Viewer that reads real `.git` directories, parses commit objects, builds a connected graph where each node knows its parents and children through `Weak` edges, and renders an ASCII visualization of your commit history.

The smart pointer family has one more member we did not cover: `Arc<T>`, the atomic reference counter for multi-threaded code. We will cover `Arc` together with `Mutex` and concurrency in the next article, where we build a Thread Pool from Scratch.

If you like reading this, please subscribe and share this with others. It will really help me and motivate me to keep publishing more such articles.
