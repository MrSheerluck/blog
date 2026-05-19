+++
title = "Learn Rust HashMap and Iterators by Building a Git Object Store Reader"
description = "In this post, we are going to build a git object store reader in Rust and learn hashmaps and iterators in Rust"
date = 2026-05-19
transparent = true

[taxonomies]
tags = ["rust", "project"]
series = ["learning-rust"]
+++



In this post, we are going to learn about `HashMap` and the `Iterator` trait in Rust. Once we cover all the concepts, we will build a **Git Object Store Reader** that reads a real `.git` folder, decompresses loose objects, decodes commits/trees/blobs, and renders `git log --oneline` output. I'm really excited for this project and I hope you are too. I won't go too deep in theory, just practical and we will build our knowledge of these concepts over time with more articles.

The only prerequisite is that you have read the previous articles in this series, as I will assume you know ownership, borrowing, structs, enums, pattern matching, error handling, generics, traits, and lifetimes.

Get the source code [here](https://github.com/MrSheerluck/git-log-in-rust)

## HashMap
We have been using `Vec<(String, JsonValue)>` as a stand-in for objects in the JSON parser because we had not covered HashMap yet. Now it's time to learn this.

`HashMap<K, V>` is a hash table that maps keys of type `K` to values of type `V`. It gives you O(1) average lookups, insertions, and deletions.

### HashMap Insertion Operation

```rust
use std::collections::HashMap;

let mut scores = HashMap::new();

scores.insert(String::from("Alice"), 100);
scores.insert(String::from("Bob"), 80);
```
### HashMap Retrieving Values

You can look up values by key:

```rust
let alice_score = scores.get("Alice"); // Option<&i32>
match alice_score {
    Some(score) => println!("Alice scored {}", score),
    None => println!("Alice not found"),
}
```

`get` returns `Option<&V>`. If the key exists, you get `Some(&value)`. If not, `None`.

You can iterate over entries:

```rust
for (name, score) in &scores {
    println!("{}: {}", name, score);
}
```

### Entry API

The entry API is one of the most useful features of `HashMap`. It lets you check if a key exists and act on it in one step:

```rust
scores.entry(String::from("Alice")).or_insert(50);
```

`entry` returns an `Entry` enum. `or_insert` inserts the value if the key does not exist, or returns a mutable reference to the existing value.

Without the entry API, you'd have to write:

```rust
if !scores.contains_key("Alice") {
    scores.insert(String::from("Alice"), 50);
}
```

That's two lookups instead of one. The entry API does it in a single operation.

You can also update based on the existing value:

```rust
let mut map = HashMap::new();
for word in "hello world hello".split_whitespace() {
    let count = map.entry(word).or_insert(0);
    *count += 1;
}
```

`map.entry(word)` looks up the word in the map. If the word doesn't exist, `or_insert(0)` inserts it with a starting count of 0 and returns a `&mut i32` pointing to that new entry. If the word already exists, `or_insert` returns a `&mut i32` pointing to the existing count. Either way, we get a mutable reference to the counter. Then `*count += 1` dereferences it and increments the value. After this loop, `map` contains `{"hello": 2, "world": 1}`.

### Ownership
When you insert a `String` into a `HashMap`, the map takes ownership of the string. If you insert a reference, you must ensure the reference outlives the map.

```rust
let mut map = HashMap::new();
let key = String::from("name");
let value = String::from("Alice");
map.insert(key, value); // ownership moves into map
// println!("{}", key); // ERROR: key was moved
```

Both `key` and `value` are `String`s. When we call `map.insert(key, value)`, ownership of both strings moves into the map. After that line, we can no longer use `key` or `value`. If we tried to print `key`, the compiler would say "value used here after move." This is the same ownership rule that applies everywhere in Rust: when you give something to a collection, the collection owns it now.

## The Iterator Trait

You have been using iterators since the mini grep project. Every time you call `.iter()`, `.into_iter()`, `.lines()`, or write a `for` loop, you are using the Iterator trait. Now let's understand what it actually is.

```rust
pub trait Iterator {
    type Item;
    fn next(&mut self) -> Option<Self::Item>;
    // many provided methods
}
```

That's it. An iterator is just something that has a `next` method. Each call to `next` returns either `Some(item)` or `None` when the iteration is finished.

### `for` Loops Desugar to Iterators
When you write:

```rust
let v = vec![1, 2, 3];
for x in v {
    println!("{}", x);
}
```

Rust desugars it into:
```rust
let mut iter = v.into_iter();
while let Some(x) = iter.next() {
    println!("{}", x);
}
```

`for` calls `.into_iter()` on the collection, then repeatedly calls `.next()` on the resulting iterator.

### Three Forms of Iteration
Rust provides three ways to get an iterator from a collection:

| Method | Produces | Meaning |
|--------|----------|---------|
| `.iter()` | `&T` | Immutable references |
| `.iter_mut()` | `&mut T` | Mutable references |
| `into_iter()` | `T` | Owned values (consumes the collection) |

Here is what each looks like:
```rust
let v = vec![1, 2, 3];
for x in v.iter() {
    // x: &i32 - we borrow each element
}
for x in v.iter_mut() {
    // x: &mut i32 - we can modify each element
}
for x in v.into_iter() {
    // x: i32 - we own each element, v is consumed
}
// println!("{:?}", v); // ERROR: v was moved in into_iter()
```

### Consuming Adapters
Some iterator methods consume the iterator and produce a value. `collect` and `count` are common examples.

```rust
let v = vec![1, 2, 3, 4, 5];
let count = v.iter().count(); // 5
let doubled: Vec<i32> = v.iter().map(|x| x * 2).collect();
```

`count` exhausts the iterator and returns the number of elements. `collect` exhausts the iterator and gathers elements into a collection. You need to specify the collection type (like `Vec<i32>`) because `collect` can produce many types.

### Iterator Adapters

Iterator adapters transform one iterator into another iterator. They are lazy, meaning they do not execute immediately. Instead, they create a new iterator that describes how values should be processed. The actual work only happens when a consuming operation like `collect`, `count`, or `for_each` starts pulling values out with `next()`.

`map` transforms each element:

```rust
let v = vec![1, 2, 3];

let squares: Vec<i32> = v.iter()
    .map(|x| x * x)
    .collect();

// squares = [1, 4, 9]
```

`v.iter()` produces `&i32` values. The closure receives each element one by one and returns a transformed value. Here, every number is squared. `map` does not modify the original vector. It creates a new iterator that yields transformed values lazily.

`filter` keeps only elements that match a condition:

```rust
let v = vec![1, 2, 3, 4, 5];

let evens: Vec<&i32> = v.iter()
    .filter(|x| *x % 2 == 0)
    .collect();

// evens = [2, 4]
```

`filter` takes a closure that returns `true` or `false`. If the closure returns `true`, the element stays in the iterator. If it returns `false`, the element is skipped.

Notice the resulting type is `Vec<&i32>`, not `Vec<i32>`. `v.iter()` yields references, so `filter` also yields references.

`take` limits how many elements are produced:

```rust
let v = vec![1, 2, 3, 4, 5];

let first_three: Vec<&i32> = v.iter()
    .take(3)
    .collect();

// first_three = [1, 2, 3]
```

`take(3)` stops the iterator after producing three elements. Even if the original iterator has more values, iteration ends early.

`skip` ignores the first N elements:

```rust
let v = vec![1, 2, 3, 4, 5];

let after_two: Vec<&i32> = v.iter()
    .skip(2)
    .collect();

// after_two = [3, 4, 5]
```

`skip(2)` discards the first two values before yielding anything.

`chain` combines two iterators into one continuous iterator:

```rust
let a = vec![1, 2];
let b = vec![3, 4];

let chained: Vec<&i32> = a.iter()
    .chain(b.iter())
    .collect();

// chained = [1, 2, 3, 4]
```

`chain` first yields all values from the first iterator, then continues with the second iterator.

`zip` pairs elements from two iterators together:

```rust
let names = vec!["Alice", "Bob"];
let scores = vec![100, 80];

let paired: Vec<(&str, &i32)> = names.into_iter()
    .zip(scores.iter())
    .collect();

// paired = [("Alice", 100), ("Bob", 80)]
```

`zip` walks both iterators at the same time. The first element from one iterator is paired with the first element from the other, the second with the second, and so on.

If one iterator ends early, `zip` stops immediately.

`filter_map` combines filtering and transformation into a single operation:

```rust
let v = vec!["1", "two", "3", "four"];

let numbers: Vec<i32> = v.iter()
    .filter_map(|s| s.parse::<i32>().ok())
    .collect();

// numbers = [1, 3]
```

`s.parse::<i32>()` returns `Result<i32, ParseIntError>`. Calling `.ok()` converts that `Result` into an `Option<i32>`.

- `Ok(value)` becomes `Some(value)`
- `Err(_)` becomes `None`
    

`filter_map` only keeps `Some` values and automatically unwraps them. Values that become `None` are skipped entirely.
So:
- `"1"` becomes `Some(1)`
- `"3"` becomes `Some(3)`
- `"two"` becomes `None`
- `"four"` becomes `None`

The final result is:
```rust
[1, 3]
```
### Chaining Adapters
The real power comes from chaining:

```rust
let v = vec![1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
let result: Vec<i32> = v.iter()
    .filter(|x| *x % 2 == 0)    // keep evens
    .map(|x| x * 10)             // multiply by 10
    .take(3)                     // take first 3
    .collect();
// result = [20, 40, 60]
```

Each adapter creates a new iterator struct that wraps the previous one. `v.iter()` creates an `Iter<i32>`. `.filter(...)` wraps it in a `Filter<Iter<i32>, _>`. `.map(...)` wraps it in a `Map<Filter<...>, _>`. `.take(3)` wraps it in a `Take<Map<...>>`. Nothing executes until a consuming operation like `collect`, `count`, or `for_each` starts calling `next` repeatedly. When it does, values flow through the pipeline one at a time: `1` comes out of the iterator, `filter` rejects it (odd), `2` comes out, `filter` accepts it, `map` turns it into `20`, `take` accepts it, `collect` stores it. Then `3` is rejected, `4` → `40` → accepted, `5` rejected, `6` → `60` → accepted. After three items, `take` returns `None` and iteration stops.

## Git Object Storage Model
Before we start the project, let's understand how Git stores data internally. Git is a content-addressable filesystem. In traditional Git repositories, every object is identified by the SHA-1 hash of its contents.
### Object Types

Git has four types of objects:

| Type | What It Stores |
|------|----------------|
| blob | File contents |
| tree | Directory listing (filenames, modes and hashes) |
| commit | Snapshot metadata (tree hash, parent hashes, author, message) |
| tag | Signed references (we will skip this) |

### Loose Object Format
Loose objects are stored in `.git/objects/XX/YYYYYY...` where `XX` is the first two hex characters of the SHA-1 hash and `YYYYYY...` is the remaining 38 characters.

The file contains the object data compressed with zlib (deflate). When decompressed, the format is:

```
<type> <size>\0<content>
```

For example, a blob containing "hello world\n" decompresses to:

```
blob 12\0hello world\n
```

The header is the type name, a space, the content size in bytes as a decimal string, a null byte, and then the raw content.

### The SHA-1 Hash
Traditional Git computes the SHA-1 hash of `<type> <size>\0<content>`. That hash becomes the object's filename. This means the same content always produces the same hash, and the hash verifies the content.

### Commit Object
```
commit <size>\0tree <tree_hash>
parent <parent_hash>
author Mrsheerluck <email> <timestamp>
committer Mrsheerluck <email> <timestamp>

commit message
```

The parent line is optional (the first commit has no parent). The tree line points to the tree object representing the directory structure at that commit.

### Tree Object
```
tree <size>\0<mode> <name>\0<hash (20 bytes)>
<mode> <name>\0<hash (20 bytes)>
```

Each entry is a file or subdirectory. The mode is a string like `100644` (regular file) or `040000` (directory). The name is the filename. The hash is 20 raw bytes of the SHA-1 hash (not hex).

## The Project: Git Object Store Reader
Now that you understand HashMap, iterators, and how Git stores objects, let's build our Git Object Store Reader.

Our program will:
- Accept a path to a `.git` directory
- Read loose objects from `.git/objects/XX/YYYYYY`
- Decompress them using `flate2`
- Parse the header and content into typed structs
- Build a commit graph using `HashMap<CommitHash, Commit>`
- Render `git log --oneline` output starting from HEAD

### Project Setup
Open your terminal and run:
```bash
cargo new git_log
cd git_log
```

Now open `Cargo.toml` and add the dependency:
```toml
[package]
name = "git_log"
version = "0.1.0"
edition = "2024"
[dependencies]
flate2 = "1"
```

The only external dependency we need is `flate2` for zlib decompression. Everything else is standard library: `std::collections::HashMap`, `std::fs`, `std::io::Read`.

### Imports

Open `src/main.rs` and delete everything. Write this:

```rust
use flate2::read::ZlibDecoder;
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::Path;
```

- `flate2::read::ZlibDecoder` is used to decompress Git's zlib-compressed object files
- `std::collections::HashMap` is for storing the commit graph, mapping hashes to commit structs
- `std::fs` is for reading files from the .git directory
- `std::io::Read` gives us the `read_to_end` method we need for decompression
- `std::path::Path` is for manipulating filesystem paths

### Reading HEAD

Git always knows which branch you are on by reading the `.git/HEAD` file.

```rust
fn read_head(git_dir: &Path) -> String {
    let head_path = git_dir.join("HEAD");
    let content = fs::read_to_string(&head_path)
        .expect("Failed to read HEAD");
    content.trim().to_string()
}
```

Now, let me explain what we just did. `git_dir.join("HEAD")` constructs the path to the HEAD file. If `git_dir` is the path to a `.git` directory, this gives us `.git/HEAD`. `fs::read_to_string` reads the entire file into a `String`. We `trim()` whitespace (HEAD files often have a trailing newline) and return the content.

The HEAD file typically contains something like `ref: refs/heads/main`. This means "main" is the current branch. To get the actual commit hash, we need to read `.git/refs/heads/main`.

```rust
fn resolve_ref(git_dir: &Path, reference: &str) -> Option<String> {
    if reference.starts_with("ref: ") {
        let ref_path = &reference[5..];
        let full_path = git_dir.join(ref_path);
        fs::read_to_string(&full_path).ok()
            .map(|s| s.trim().to_string())
    } else {
        Some(reference.to_string())
    }
}
```

Now, let me explain what we just did. If the reference starts with `"ref: "`, we strip off those 5 characters to get something like `refs/heads/main`. Why 5? Because `"ref: "` is exactly 5 characters: `r`, `e`, `f`, `:`, ` `. We join that path with the git directory and read the file it points to.

`fs::read_to_string` returns `Result<String, io::Error>`. We call `.ok()` to convert it to `Option<String>`. If the file exists, we get `Some(content)`. If not (the branch doesn't exist), we get `None`. Then `.map(|s| s.trim().to_string())` strips whitespace from the content. The result is the actual commit hash, like `"a1b2c3d4e5f6..."`.

If the reference doesn't start with `"ref: "`, it means HEAD is already pointing directly at a commit hash — this is "detached HEAD" state. In that case, we just return it as-is wrapped in `Some`.

### Structs for Git Objects

We need a struct for the data we care about:

```rust
struct Commit {
    tree_hash: String,
    parent_hashes: Vec<String>,
    message: String,
}
```

Each commit has a tree hash (pointing to the directory snapshot), zero or more parent hashes (the first commit has none, merge commits have two), and a commit message.

### Reading a Loose Object

Git stores objects in `.git/objects/XX/YYYYYY` where the path is derived from the SHA-1 hash. The first two hex characters become the directory name, and the remaining 38 characters become the filename.

A loose object file is compressed with zlib (deflate). Let's write a function to read and decompress one:

```rust
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

Now, let me explain what we just did. We construct the path by splitting the hash. For example, if the hash is `a1b2c3d4e5f6...`, `&hash[..2]` gives us `"a1"` (the first two hex characters), and `&hash[2..]` gives us `"b2c3d4e5f6..."` (the remaining 38 characters). The resulting path becomes `.git/objects/a1/b2c3d4e5f6...`.

We read the compressed file into a byte vector using `fs::read`. Then `&compressed[..]` creates a byte slice of the entire compressed data. We wrap it in a `ZlibDecoder` which implements `Read`. When we call `decoder.read_to_end(&mut decompressed)`, it decompresses the zlib data and writes all decompressed bytes into our output vector.

When decompressed, a Git object looks like this:

```
blob 12\0hello world\n
```

or:

```
commit 234\0tree a1b2...\nparent c3d4...\nauthor ...
```

The format is always: type name, space, size in bytes as decimal, null byte, then the raw content.

### Parsing the Object Header

Let's write a function to split the decompressed data into the header and the content:

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
```

Now, let me explain what we just did. `data.iter().position(|&b| b == 0)` walks through the byte array and returns the index of the first null byte. This is our separator between the header and the content. If there's no null byte, the data is corrupted and we panic.

`&data[..header_end]` gives us the header bytes (everything before the null). We convert those bytes to a string with `from_utf8`. Then `header.splitn(2, ' ')` splits the header on the first space into at most 2 parts. Part 1 is the object type (like `"commit"` or `"tree"` or `"blob"`). Part 2 is the size (like `"234"`). We don't actually need the size because the content is everything after the null byte, but we still parse it because Git object headers always include it.

The function returns a tuple: the type string and a byte slice of the content.

### Parsing a Commit Object

Now that we can read and decompress any object, let's parse a commit. A commit object looks like this when decompressed:

```
commit 234\0tree a1b2c3d4e5f6...
parent f8g9h0i1j2k3...
author Mrsheerluck <email> 1234567890 +0000
committer Mrsheerluck <email> 1234567890 +0000

Initial commit message
```

The format is key-value headers until a blank line, then the commit message.

```rust
fn parse_commit(content: &[u8]) -> Commit {
    let content_str = std::str::from_utf8(content)
        .expect("Invalid commit: not valid UTF-8");
    let mut tree_hash = String::new();
    let mut parent_hashes = Vec::new();
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

        if let Some(hash) = line.strip_prefix("tree ") {
            tree_hash = hash.to_string();
        } else if let Some(hash) = line.strip_prefix("parent ") {
            parent_hashes.push(hash.to_string());
        }
    }

    Commit {
        tree_hash,
        parent_hashes,
        message,
    }
}
```

Now, let me explain what we just did. `content_str.lines()` returns an iterator over the lines of the commit text. We walk through them one by one using a `for` loop.

Before we hit the blank line, we are parsing headers. `line.strip_prefix("tree ")` checks if the line starts with `"tree "`. If it does, it returns the rest of the line (the hash) as a `&str`, and we convert it to an owned `String`. Same for parent lines. There can be multiple parent lines in merge commits, so we push each one into a vector.

When we hit an empty line (`if line.is_empty()`), we flip `in_message` to `true`. From that point on, every line is part of the commit message. We build the message string by appending each line. The `if !message.is_empty()` check ensures we add a newline between lines of a multi-line message, but not at the start.

### Reading Commits Recursively

To build the full commit graph, we need to read a commit, then read all its parents, then their parents, and so on. We use a `HashMap` to cache commits we have already read, so we never read the same object twice and we avoid infinite loops.

```rust
fn read_commit(
    git_dir: &Path,
    hash: &str,
    cache: &mut HashMap<String, Commit>,
) {
    if cache.contains_key(hash) {
        return;
    }

    let data = read_object(git_dir, hash);
    let (obj_type, content) = parse_object(&data);

    match obj_type {
        "commit" => {
            let commit = parse_commit(content);
            for parent in &commit.parent_hashes {
                read_commit(git_dir, parent, cache);
            }
            cache.insert(hash.to_string(), commit);
        }
        _ => {
            panic!("Expected commit object, got {}", obj_type);
        }
    }
}
```

Now, let me explain what we just did. First, `cache.contains_key(hash)` checks if we've already read this commit. If it's in the cache, we return immediately. This prevents redundant reads. Git commit graphs are acyclic, but caching still avoids re-reading commits reachable through multiple merge paths.

Then we read the object from disk, parse its header to confirm it is a `"commit"` type, and parse the commit data into our `Commit` struct.

Before inserting the current commit into the cache, we recursively read all its parent commits. We iterate over `commit.parent_hashes` and call `read_commit` for each one. This recursively walks the entire parent graph so every reachable ancestor commit eventually ends up in the cache. The recursion base case is when a commit has no parents (the root commit) or when all parents are already in the cache.

Finally, `cache.insert(hash.to_string(), commit)` takes ownership of both the key and the value. The `hash` parameter is `&str`, so we call `.to_string()` to get an owned `String` for the map key.

### Rendering `git log --oneline`

Now we have a graph of commits. The `git log --oneline` format looks like this:

```
a1b2c3d Initial commit message
e5f6a7b Add new feature
f8g9h0i Fix bug in parser
```

Each line starts with the abbreviated hash (first 7 characters) and the first line of the commit message.

```rust
fn log_oneline(commits: &HashMap<String, Commit>, start_hash: &str) {
    let mut hash = start_hash.to_string();

    loop {
        match commits.get(&hash) {
            Some(commit) => {
                let short_hash = &hash[..7];
                let first_line = commit.message.lines().next().unwrap_or("");
                println!("{} {}", short_hash, first_line);

                match commit.parent_hashes.first() {
                    Some(parent) => hash = parent.clone(),
                    None => break,
                }
            }
            None => break,
        }
    }
}
```

Now, let me explain what we just did. We start from `start_hash` (the commit that HEAD points to) and walk backwards through the first-parent chain. For each commit, `&hash[..7]` takes the first 7 characters of the hash string. `commit.message.lines()` returns an iterator over the lines of the message. `.next()` gets the first line, returning `Option<&str>`. We use `unwrap_or("")` to handle the edge case of an empty message. Then we move to the first parent by cloning the hash of `parent_hashes.first()`. If there are no parents, we have reached the root commit and we `break`.

This follows only the first parent, which is similar to `git log --first-parent --oneline`. Merge commits have multiple parents, but the first parent is usually the branch you were on when you merged.

### Walking the Tree

Now let's use iterators to do something more interesting. Let's list all files in the latest commit's directory structure. First, we need to parse tree objects.

Git tree objects have a binary format. Each entry is:

```
<mode> <name>\0<20-byte raw hash>
```

The mode is a string like `100644` (regular file) or `040000` (directory). The name is the filename. The hash is 20 raw bytes, not a hex string.

```rust
struct TreeEntry {
    mode: String,
    name: String,
    hash: String,
}

fn parse_tree(content: &[u8]) -> Vec<TreeEntry> {
    let mut entries = Vec::new();
    let mut pos = 0;

    while pos < content.len() {
        let null_pos = content[pos..].iter().position(|&b| b == 0)
            .expect("Invalid tree: missing null byte") + pos;

        let mode_and_name = std::str::from_utf8(&content[pos..null_pos])
            .expect("Invalid tree: not valid UTF-8");
        let space_pos = mode_and_name.find(' ')
            .expect("Invalid tree entry: missing space");
        let mode = &mode_and_name[..space_pos];
        let name = &mode_and_name[space_pos + 1..];

        pos = null_pos + 1;

        let hash_bytes = &content[pos..pos + 20];
        let hash = hash_bytes.iter()
            .map(|b| format!("{:02x}", b))
            .collect::<Vec<_>>()
            .join("");

        entries.push(TreeEntry {
            mode: mode.to_string(),
            name: name.to_string(),
            hash,
        });

        pos += 20;
    }

    entries
}
```

Now, let me explain what we just did. Tree objects are binary, so we walk through the data byte by byte.

`content[pos..].iter().position(|&b| b == 0)` finds the first null byte starting from the current position. We add `pos` to get the absolute index in the original array. The bytes from `pos` to `null_pos` are the mode and name, separated by a space. So `mode_and_name.find(' ')` finds that space, `&mode_and_name[..space_pos]` is the mode (like `"100644"`), and `&mode_and_name[space_pos + 1..]` is the name (like `"main.rs"`).

After the null byte, the next 20 bytes are the raw SHA-1 hash. `&content[pos..pos + 20]` gives us those bytes. This assumes the tree object is valid and contains at least 20 bytes for the hash. Real parsers would validate bounds more carefully instead of panicking on malformed data. Then we convert each byte to a two-character hex string:

```rust
hash_bytes.iter()
    .map(|b| format!("{:02x}", b))
    .collect::<Vec<_>>()
    .join("")
```

Let me break that iterator chain down. `hash_bytes.iter()` gives us an iterator over each byte. `.map(|b| format!("{:02x}", b))` transforms each byte (like `0xa1`) into a two-character hex string (like `"a1"`). `.collect::<Vec<_>>()` collects all those hex strings into a vector like `["a1", "b2", "c3", ...]`. `.join("")` concatenates them into a single 40-character hash string like `"a1b2c3..."`.

Then we advance `pos` by 20 bytes to move to the next entry.

Now let's write a recursive tree walker that lists every file:

```rust
fn walk_tree(git_dir: &Path, tree_hash: &str, prefix: &str) -> Vec<String> {
    let data = read_object(git_dir, tree_hash);
    let (_, content) = parse_object(&data);
    let entries = parse_tree(content);

    entries.iter()
        .flat_map(|entry| {
            let path = if prefix.is_empty() {
                entry.name.clone()
            } else {
                format!("{}/{}", prefix, entry.name)
            };

            if entry.mode == "040000" {
                walk_tree(git_dir, &entry.hash, &path)
            } else {
                vec![path]
            }
        })
        .collect()
}
```

Now, let me explain what we just did. For each entry in the tree, we build the full path. If the prefix is empty (we're at the root), the path is just the entry name. Otherwise, it's `prefix/name`. So if we're in `src/` and the entry is `main.rs`, the path becomes `src/main.rs`.

If the entry's mode is `"040000"`, it's a directory. We recurse into it by calling `walk_tree` again with the subdirectory's tree hash and the new path. If it's a file (mode `"100644"` or similar), we return a vector with just that one path.

The key here is `flat_map`. Each entry produces either a single-element vector (a file) or a multi-element vector (all files in a subdirectory). Without `flat_map`, the result would be `Vec<Vec<String>>` — a vector of file lists, one per entry. With `flat_map`, all those iterators are flattened into one combined `Vec<String>` of every file path.

### Putting It All Together

Now let's wire everything together in `main`:

```rust
fn main() {
    let args: Vec<String> = std::env::args().collect();
    let git_dir = if args.len() > 1 {
        Path::new(&args[1]).to_path_buf()
    } else {
        Path::new(".git").to_path_buf()
    };

    let head = read_head(&git_dir);
    let head_hash = resolve_ref(&git_dir, &head)
        .expect("Failed to resolve HEAD");

    let mut cache = HashMap::new();
    read_commit(&git_dir, &head_hash, &mut cache);

    log_oneline(&cache, &head_hash);

    if let Some(commit) = cache.get(&head_hash) {
        println!("\nFiles in latest commit:");
        let files = walk_tree(&git_dir, &commit.tree_hash, "");
        for file in &files {
            println!("  {}", file);
        }
    }
}
```

Now, let me explain what we just did. `std::env::args().collect()` reads command line arguments into a `Vec<String>`. If a path argument is provided (`args.len() > 1`), we use it as the git directory. Otherwise, we default to `.git` in the current directory. `Path::new(&args[1]).to_path_buf()` creates an owned `PathBuf` from the string argument.

We read HEAD with `read_head`, which gives us something like `"ref: refs/heads/main"`. Then `resolve_ref` follows that reference to get the actual commit hash.

We create a new, empty `HashMap` as our cache. Then `read_commit` reads the commit graph starting from HEAD, which recursively reads all ancestors. By the time this returns, the cache contains every commit reachable from HEAD.

Finally, we print the log output using `log_oneline`. If the HEAD commit is in the cache (it should always be), we also walk its tree to list all files in the latest snapshot.

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

```
a1b2c3d Initial commit
e5f6a7b Add feature X
f8g9h0i Set up project structure

Files in latest commit:
  src/main.rs
  src/lib.rs
  Cargo.toml
  README.md
```

That's it, your own `git log --oneline` implementation in less than 200 lines of Rust, using `HashMap`, iterators, and the knowledge of Git's object storage model.

## Conclusion

In this post, you learned about `HashMap`, the `Entry` API for single-lookup insert-or-update, the `Iterator` trait and its three forms (`.iter()`, `.iter_mut()`, `.into_iter()`), consuming adapters like `collect` and `count`, iterator adapters like `map`, `filter`, `flat_map`, and how to chain them lazily. You also learned how Git stores objects (blobs, trees, commits) as zlib-compressed files in `.git/objects/`. And you built a Git Object Store Reader that reads real `.git` directories, parses commits and trees, and renders `git log --oneline` output using nothing but the standard library and `flate2`.

In the next article, we will build something even more interesting. See you soon.
