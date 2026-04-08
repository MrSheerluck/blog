+++
title = "Learn Rust Ownership and Borrowing By Building Mini Grep"
description = "In this post, we are going to build mini grep in Rust by learning about Rust's ownership and borrowing concept"
date = 2026-04-09
transparent = true

[taxonomies]
tags = ["rust", "project"]
series = ["learning-rust"]
+++

In this post, we are going to learn about the problem Rust is solving, Rust's ownership, borrowing concept and build a mini grep clone in Rust. I'm really excited for the project and I hope you are too. I won't go too deep in theory, just practical and we will build our knowledge of these concepts over time with more articles. Let's start.

You can get the complete source code [here](https://github.com/MrSheerluck/mini-grep-in-rust)

## The Problem Rust is Solving
Every program needs memory and you use memory to store data like strings, numbers, lists whatever. There is an important question we need to answer and that is **who is responsible for freeing that memory when you're done with it?**

There are two traditional answers.

### The Programmer Does it Manually
Like in C programming language, you call `malloc` to allocate memory and `free` to release it. The best part of this thing is speed and control but the problem is that we can make mistakes and we might free memory twice or forget to free it or use it after freeing it. 

These bugs are problematic. They're hard to reproduce and hard to debug.

### The Language Does it Automatically
Like in Python programming language. There is a garbage collector runs in the background, figures out what memory is no longer reachable, and frees it. The best part is you basically can't have those dangerous memory bugs but the problem is performance. The garbage collector runs at unpredictable times, pauses your program and add overhead.

When it comes to Rust, it gives you memory safety without a garbage collector. It does this through a system. This system is built on three ideas: ownership, borrowing and slices.

## Ownership
Here's the core idea: in Rust, every piece of data has exactly one variable that "owns" it. When that variable goes out of scope, the data is automatically freed. No GC needed, because the compiler can figure out exactly when each piece of data should be cleaned up just by looking at the code.

```rust
fn main() {
	let s = String::from("hello"); // s owns the string
} // s goes out of scope here and Rust automatically frees the string
```

I hope you understand the above example but now lets get to the interesting part.

What happens when you do this?
```rust
let s1 = String::from("hello");
let s2 = s1;
```
In most languages, you'd expect both `s1` and `s2` to point to the same string or `s2` to be a copy of `s1`. In Rust, neither happens. **Ownership moves from `s1` to `s2`.

After the second line, `s1` no longer exists as far as the compiler is concerned. Try to use it and you get a compile error:
```rust
let s1 = String::from("hello");
let s2 = s1;
println!("{}", s1); // ERROR: value borrowed here after move
```

You might ask, **why does Rust do this?** Because `String` is heap allocated. If both `s1` and `s2` owned it, who would free it? If both tried, you'd have a double free bug.

So by keeping a single owner, Rust keeps it simple.

But for simple types like integers don't have this issue as they live on the stack, copying them is trivial and there's no heap memory to worry about. So, for those, Rust just copies:
```rust
let x = 5;
let y = x;
println!("{}", x); // Fine - integers are copied not moved
```

Technically, integers implement the `Copy` trait. `String` does not, so it moves instead. We will understand what trait is later in the series.

## Borrowing
Now the question is, if ownership moves when you pass data around, how do you actually use data in function? If you pass a `String` into a function, does the function consume it?
```rust
fn print_it(s: String) {
	println!("{}", s);
} // s is dropped here


fn main() {
	let s = String::from("hello");
	print_it(s); // ownership moves into the function
	println!("{}", s); // ERROR: s was moved
}

```
Now, this is a problem. If you can't use `s` anymore once you pass it to a function, then its too much restrictive. You don't want every function call to permanently consume your data. To handle this situation, Rust gives you **borrowing**. This means instead of giving ownership, you lend a *reference* to the data.

```rust
fn print_it(s: &String) {
	println!("{}", s);
} // the reference goes out of scope, but the original string is unaffected


fn main() {
	let s = String::from("hello");
	print_it(&s); // lend a reference, don't move ownership
	println!("{}", s); // still works, s is still the owner
}
```

The `&` means "a reference to". You're not passing the string directly instead you are passing a pointer to the string and the compiler tracks this carefully. The function can look at the data through the reference but it doesn't own it, so it can't free it and ownership stays with the original variable.

This is called a **shared reference** or an **immutable reference**. Through this reference, you can read, but you can't modify. You can have as many of these as you want simultaneously because reading doesn't conflict with reading.

### Mutable References
What if you need to modify data? There's a mutable reference for that:
```rust
fn add_world(s: &mut String) {
	s.push_str(" world");
}

fn main() {
	let mut s = String::from("hello");
	add_world(&mut s);
	println!("{}", s); // "hello world"
}
```
If you want mutable access, then you need to make the variable as `mut` mutable and give a mutable reference to the function. But there's a catch, **you can have one mutable reference at a time, and you cannot have any immutable references at the same time**. Wait, let me give you an example:
```rust
let mut s = String::from("hello");

let r1 = &s; // immutable borrow
let r2 = &mut s; // ERROR: can't borrow as mutable while immutable borrow exists
```

But why can't we do this, what's the issue? Because if you could read and write at the same time, you'd have a data race, you're reading data while something else is modifying it. The result is undefined and Rust makes this entire category of bug impossible at the compile time.

To give you a mental model of this borrowing concept:
> You can have either many readers or one write, never both simultaneously. This is not enforced at runtime but by the compiler before your code runs.


## Slices - Borrowing a Piece of Something
Sometimes you don't want to borrow an entire `String`, you just want to borrow part of it. That's what slices are for.
```rust
let s = String::from("hello world");
let hello = &s[0..5];
let world = &s[6..11];
```

`hello` here is of type `&str`. Note that, its not a new string, instead it's a reference that points directly into the memory of `s`.
> A slice is a borrow. It points into someone else's data and that means while a slice is alive, the borrow checker won't let you modify or drop the original.

```rust
let mut s = String::from("hello world");
let word = &s[0..5]; // word borrows from s
s.clear() // ERROR: can't mutate s while word is borrowing from it
println!("{}", word)
```

If `s.clear()` were allowed, it would wipe out that `word` is pointing and you'd have a dangling reference (a pointer into freed memory). In C, this compiles and runs, and crashes or corrupts data unpredictably. In Rust, it doesn't compile. The borrow checker sees that `word` is still alive and still pointing into s, and it rejects the mutation.

> `&str` vs `&String`
> You'll see both `&str` and `&String` in Rust code, and the distinction matters:
> `&String` is a reference to a heap allocated `String` object
> `&str` is a reference to a sequence of UTF-8 bytes

In practice, when writing functions that just need to read a string, you should prefer `&str` as the parameter type as it accepts both string literals and references to `String` values.

Let's now start building our grep clone but before that lets learn a little bit about mini grep.

## Grep 101
`grep` is a command line tool that searches through text for lines that match a pattern. That's it. The name stands for **Global Regular Expression Print**. It reads input, tests every line against a pattern and prints the lines that match.

Open your terminal and try this:
```shell
echo -e "hello world\ngoodbye world\nhello rust" | grep "hello"
```
Output:
```shell
hello world
hello rust
```

It went through three lines and found two that contained the word "hello", and printed those. The third line didn't match so it was ignored. Now, lets try with a flag:
```shell
echo -e "hello world\ngoodbye world\nhello rust" | grep -v "hello"
```

output:
```shell
goodbye world
```
`-v` means invert, this print lines that do not match

Let's try another flag:
```shell
echo -e "hello world\ngoodbye world\nhello rust" | grep -c "hello"
```

output:
```shell
2
```
`-c` means count, this don't print lines instead just print how many matched 
## What are we Building
Before touching `main.rs`, let me tell you what we are building:
Our program will:
- accept a pattern and a path from the command line
- accept optional flags
- walk the directory (or read a single file) recursively
- for each file, read its contents, search line by line
- print results with filename, line number

## Project Setup
Run this in your terminal:
```bash
cargo new rgrep
cd rgrep
```

Now open the `Cargo.toml` file and add the dependencies with this:
```toml
[package]
name = "rgrep"
version = "0.1.0"
edition = "2024"

[dependencies]
regex = "1"
walkdir = "2"
```

We have added three dependencies:
- `regex` compiles and runs regular expression patterns against text
- `walkdir` recursively walks a directory tree, giving you every file one by one

## Imports
Open `src/main.rs` and delete everything. Write this:
```rust
use regex::Regex;
use std::env;
use std::fs;
use walkdir::WalkDir;
```
- `use regex::Regex` is used for regex operations
- `use std::env` is used access process environment like command line arguments and environment variables
- `use std::fs` here `fs` stands for file system and we are using this to read files, write files, checking if path exists etc.
- `use walkdir::WalkDir` this helps us to do recursive directory walk. Basically we can give it a directory and it'll return the every entry inside

### Reading Command Line Arguments
```rust
fn main() {
	let args: Vec<String> = env::args().collect();
}
```
Here, `env::args()` returns an **iterator** over the command line arguments. For example, when a user runs:
```shell
cargo run -- -v "hello" ./src
```
the arguments are: `["rgrep", "-v", "hello", "./src"]`. The first element is always the program's own name.

> An iterator is something you can step through one element at a time. The `.collect()` exhausts the iterator and gathers every element into a collection.

The type annotation `Vec<String>` tells Rust what kind of collection you want. `.collect()` can produce several types, so you have to specify.

> `Vec<String>` means a growable list of owned strings. You can check my previous article for more info.

#### Why `String` and not `&str`?
You might ask, why use `String` and not `&str`? To answer this, you need to understand what `&str` actually is. A `&str` is a reference, it does not own data, it points to data that already exists somewhere in memory and has a defined lifetime. String literals like `"hello"` work as `&str` because the compiler compiles them directly into the binary, so they live for the entire duration of the program.

Command line arguments are different, they come from the operating system at runtime. There is no pre-existing place in your program's memory where they live. Rust has to allocate heap memory to hold each argument string as it reads it. `String` is the type for heap-allocated, owned string data, it carries the data with it and is responsible for freeing it when it goes out of scope. `&str` cannot do this because it is just a pointer, and a pointer needs something to point to.

So `Vec<String>` is the only option here. Each `String` in the vector owns its argument data, and the vector owns all the `String`s. When `args` goes out of scope, everything is cleaned up automatically.

### Validating Argument Count
```rust
if args.len() < 3 {
	println!("Usage: rgrep [OPTIONS] <pattern> <path>");
	eprintln!("Options: -v -c -l");
	std::process::exit(1);
}
```

`args.len()` returns how many arguments we have. The minimum valid call is:
```shell
rgrep "pattern" ./path
```
This gives us `["rgrep", "pattern", "./path"]` a total of 3 elements. If there are fewer than three, the user didn't provide enough and we print an error and exit.

> `eprintln!` is like `println!` but writes to stderr instead of stdout. Errors and usage messages conventionally go to stderr so they don't pollute the output when piping.

Finally, `std::process::exit(1)` terminates the program with exit code 1.

### Parsing Flags
```rust
let mut invert = false;
let mut count_only = false;
let mut files_only = false;
let mut pattern_index = 1;
 
for i in 1..args.len() {
	match args[i].as_str() {
		"-v" => invert = true,
		"-c" => count_only = true,
		"-l" => files_only = true,
		_ => {
			pattern_index = i;
			break;
		}
	}
}
```
We start with four mutable variables. The first three tracks which flags were passed. `pattern_index` tracks where in `args` the pattern is. This starts with `1` because `args[0]` is always the program name

We are iterating over all the arguments and checking which flag is being passed by the user and then setting that to `true`. The `_` is the catch-all, if its none of the above that means we have hit the pattern and we are recording its index and then stop the loop with `break`.

So, if the user runs `rgrep -v -c "hello" ./src`, after the loop: `invert` is true, `count_only` is true, `pattern_index` is 3 (pointing at "hello")

### Extracting Pattern and Path
```rust
if pattern_index + 1 >= args.len() {
	eprintln!("Error: missing pattern or path");
	std::process::exit(1);
}

let pattern = &args[pattern_index];
let path = &args[pattern_index + 1];
```
After the flag loop, `pattern_index` is pointing to the pattern. The paths comes right after it at `pattern_index + 1`. If that index is out of bounds, the user forgot to provide one of them.

`let pattern = &args[pattern_index]` this is the borrowing concept. We don't need our own copy of the pattern, we just need to read it and act accordingly. So, `pattern` is a `&String` type, a reference that borrows from `args`.
Same thing happens for `path`.

### Compiling The Regex
```rust
let regex = match Regex::new(pattern) {
	Ok(r) => r,
	Err(e) => {
		eprintln!("Invalid pattern: {}", e);
		std::process::exit(1);
	}
};
```
`Regex::new(pattern)` takes the pattern string and compiles it into a `Regex` object. "Compiling" here means parsing the pattern syntax and building an internal state machine that can efficiently test strings against it. 

`Regex::new` returns a `Result<Regex, Error>`, this is a enum with two variants: `Ok(value)` meaning success and `Err(error)` meaning failure. This is the way Rust handles operations that can fail.

`match` on a `Result` is the standard way to handle it:
- `Ok(r)` - the pattern is compiled successfully, `r` is the `Regex` object
- `Err(e)` - the pattern was invalid (malformed regex syntax). `e` is the error and we just print it and exit

> If you don't understand clearly, no worries, we will learn more about it in a later article, for now just follow and finish the project

### Walking the Directory
```rust
for entry in WalkDir::new(path).into_iter() {
	let entry = match entry {
		Ok(e) => e,
		Err(_) => continue,
	};

	if !entry.file_type().is_file() {
		continue;
	}

	let file_path = entry.path();
}
```
`WalkDir::new(path).into_iter()` starts a recursive walk at path and gives us entries one at a time. Each entry is a `Result<DirEntry>` because reading a directory can fail may be due to permissions, broken symlinks, etc.

We `match` on each entry. Success case gives us `DirEntry` and in case of failure, we continue to the next iteration

If `!entry.file_type().is_file()` gives us both files and directories, we only care about files so we skip anything that is not a file with `continue`

`entry.path()` gives us a `&Path`, its a borrowed reference to the file's path. `Path` is Rust's type for filesystem paths.

### Reading Files
Once we get to know that we got a file and not a directory, we are keeping its file path and then we are now going to read that file's content:
```rust
let contents = match fs::read_to_string(file_path) {
	Ok(c) => c,
	Err(_) => continue,
};
```
`fs::read_to_string(file_path)` reads the entire file and returns `Result<String>`. On success, `contents` has the file's text and on failure case (again may be due to permission or something else), we just continue to the next iteration.

### The Search Function
We want to search through the content and get back the matching lines. The question we need to ask is what should the search function take and what should it return?

It should take `contents` as a borrow that means `&str` because it only needs to read the text, not own it. 

For the return value, each matching line is a slice of `contents`. This means a `&str` pointing directly into file's text but returning those slices requires lifetime annotations, which we haven't covered yet. So instead we return an owned `String` copy of each matching line. It's of course less efficient but its correct and simple for now.

```rust
fn search(contents: &str, regex: &Regex, invert: bool) -> Vec<(usize, String)> {
    let mut results: Vec<(usize, String)> = Vec::new();
    let mut line_number = 1;

    for line in contents.lines() {
        let is_match = regex.is_match(line);

        let should_include = if invert { !is_match } else { is_match };

        if should_include {
            results.push((line_number, line.to_string()));
        }

        line_number += 1;
    }
    results
}
```

We are borrowing `contents`, `regex` as we only need to read them. The function is returning `Vec<(uszie, String)>`, this is a vector of tuples. Each tuple is a line number. `contents.lines()` gives each line as a `&str` slice pointing into `contents`. 

Inside the loop, we are matching the regex with that line, then checking the `invert` flag and accordingly decides if we need to include the line and line number in the result or not.

`line.to_string()` converts the borrowed `&str` slice into an owned `String`. This is the copy that we take so we don't need to worry about the slice outliving `contents`. Finally, we are just returning the `results`


## Run The Project
```shell
cargo run -- "fn" ./src
```
You should get something like this:
```shell
./src/main.rs:8: fn search(contents: &str, regex: &Regex, invert: bool) -> Vec<(usize, String)> {
./src/main.rs:27: fn main() {
```

You can try using flags too like this:
```shell
cargo run -- -c "fn" ./src
```
you should get something like this:
```shell
./src/main.rs: 2
```

## Conclusion
This was a long one too but I think now you have some practical knowledge on ownership and borrowing. I'm not going too much theoretical as that'll be just boring. We'll learn more about `Result` in a later article. In the next one, we will **build a JSON Parser** by learning about structs, enums and pattern matching. See you soon.
