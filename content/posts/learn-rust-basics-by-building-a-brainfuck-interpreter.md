+++
title = "Learn Rust Basics By Building a Brainfuck Interpreter"
date = 2026-04-04
transparent = true

[taxonomies]
tags = ["rust", "project"]
series = ["learning-rust"]
+++


Hi, In this series we are going to learn Rust programming language by building exciting projects per article. For every article, we will first learn some concepts and then build a mini project. I promise you these mini projects will be exciting. The only prerequisite is, you should know any one programming language like just basics of it as this series will focus on teaching rust and not programming from zero. 

My motive is to explain how to do a certain thing in Rust, so I won't explain how a loop works or how a function works. I'll just explain how to work with variables, functions, loops etc in Rust but I'll explain Rust specific concepts in detail.

In this post, we are going to **build a brainfuck language interpreter in Rust**. But before that, we will learn about variables and mutability, scalar types, compound types, functions, basic string handling (we will dive deep in the next article), `println!` & basic macros. We will also learn about cargo and control flow in rust like if and else blocks, loops, and match (this is interesting). 

You can get the source code from **[here](https://github.com/MrSheerluck/brainfuck-interpreter-in-rust)**

Let's start, I can't wait.

## How Rust Works and Cargo
### What happens when you write a Rust program?
Rust is a **compiled language**. This means before the program can run, it has to be translated from human readable Rust code into machine code that your CPU can directly execute. This translation is done by the **Rust compiler** called `rustc`.

### Cargo
Cargo is Rust's official build system and package manager. It does multiple things:
- creates new projects with a standard folder structure
- compiles the rust code by invoking `rustc` under the hood
- downloads and manages external libraries(in rust world we call them **crates**)
- run tests, benchmarks and documentation generation

When you'll install Rust (via `rustup`), Cargo comes with it automatically.

Let me show you some of the common commands that you'll be using constantly:

| Command                  | What it does                                  |
| ------------------------ | --------------------------------------------- |
| `cargo new project_name` | creates a new project folder with boilerplate |
| `cargo run`              | compiles and immediately runs the binary      |
| `cargo check`            | checks for errors without producing a binary  |
| `cargo build`            | compiles your project, produces a binary      |

### Project Structure
Let's try to create a project with Cargo:
Open up your terminal and run the following command:
```bash
cargo new hello
```
It'll create a new Rust project called `hello`. Now, open the project folder in your preferred editor and you'll see a folder structure like this:
```bash
hello/
├── Cargo.toml
└── src/
    └── main.rs
```
Let me explain what each of these files are:
#### `Cargo.toml`
This is the **manifest file** for your project. It's written in TOML format (a simple config format). It contains:
```toml
[package]
name = "hello"
version = "0.1.0"
edition = "2024"

[dependencies]
```
- `name` - the name of your project
- `version` - your project's version
- `edition` - which edition of Rust you are using
- `[dependencies]` - this is where you list down the external crates your project needs. Initially its empty.

#### `src/main.rs`
This is the entry point of every Rust program. Cargo generates this for you:
```rust
fn main() {
	println!("Hello, world!");
}
```

`fn` is the keyword to define a function in Rust. `main` is the name of the function. The curly braces `{}` defines the body of the function.

`println!("Hello, world!");` - `println!` is a `macro`, not a regular function. Notice there is a `!` right before the parentheses `!()`. Macros are just code that generates other code at compile time. You don't need to understand how they work internally right now. Just keep in mind that `println!` prints a line of text to the terminal followed by a new line.

The text inside the quotes is a **string literal**. if you want to print values inside the string, you use `{}` as a placeholder:
```rust
println!("The value is {}", 42);
```

## Variables and Mutability
### Declaring Variables
In Rust, you declare a variable with `let`:
```rust
let x = 5;
```
This creates a variable named `x` and binds the value 5 to it.

### Variables are Immutable by Default
This is one of Rust's core design decisions. Once you bind a value to a variable, you cannot change it unless you explicitly say you want to.
```rust
let x =5;
x = 6; // ERROR: cannot assign twice to immutable variable
```

To make a variable mutable, you need to add `mut` keyword:
```rust
let mut x = 5;
x = 6; // OK this is fine
```

### Shadowing
Rust allows you to **shadow** a variable. This means you can declare a new variable with the same name which replaces the previous one:
```rust
let x = 5;
let x = x + 1; // this is a new `x`, not mutating the old one
let x = x * 2;
println!("{}", x); // prints 12
```

You need to understand that shadowing is different than `mut`. With shadowing, you are creating a brand new variable (and can even change its type). But with `mut`, you're modifying the same variable in place.

## Data Type
Rust is **statically typed**. This means every variable has a type known at compile time. Most of the time the compiler can infer the type from context, so you don't have to write it explicitly. But you can always annotate it:
```rust
let x: i32 = 5;
```
The `: i32` after the variable name is the **type annotation**.

### Integer Types
Rust has multiple integer types. They differ in size (how many bits they use) and whether they can hold negative numbers:

| Type  | Size            | Range                                         |
| ----- | --------------- | --------------------------------------------- |
| i8    | 8-bit signed    | -128 to 127                                   |
| i16   | 16-bit signed   | -32,768 to 32,767                             |
| i32   | 32-bit signed   | ~-2 billion to ~2 billion                     |
| i64   | 64-bit signed   | very large range                              |
| u8    | 8-bit unsigned  | 0 to 255                                      |
| u16   | 16-bit unsigned | 0 to 65,535                                   |
| u32   | 32-bit unsigned | 0 to ~4 billion                               |
| u64   | 64-bit unsigned | ver large range                               |
| usize | pointer-sized   | depends on your OS (64-bit on 64-bit systems) |
`i32` is the default integer type when Rust infers. `usize` is special because its used for indexing into collections (arrays, vectors etc) because its size matches memory address size of your machine.

### Boolean
```rust
let is_active: bool = true;
let is_done = false;
```
Only two values are there for boolean type in Rust: `true` or `false`

### Character
```rust
let c: char = 'A';
```
Rust's char type represents a single Unicode scalar value. It uses single quotes (double quotes are for strings). A char is 4 bytes in Rust, not 1, because it can hold any unicode character.

### Floating Point
```rust
let f: f64 = 3.14;
```
`f32` and `f64` are 32-bit and 64-bit floating point numbers. The default is `f64` because on modern hardware it's roughly as fast as `f32` but more precise.

## Compound Types
### Tuples
A tuple groups multiple values of potentially different types into one compound value. Let me show you an example:
```rust
let tup: (i32, f64, bool) = (500, 6.4, true);
```
One thing to note about tuples is that they have a fixed length. Once they are declared, then you cannot add or remove elements to the tuple.

But you can access elements from tuple, to do that you can use the **dot notation** with the index:
```rust
let x = tup.0; // 500
let y = tup.1 // 6.4
let x = tup.2 // true
```

You can also destructure a tuple. Destructuring means unpacking the tuple elements in individual variables:
```rust
let (a,b,c) = tup;
println!("{}", a); // 500
```

### Arrays
An Array holds multiple values of the same type, with a fixed length.
```rust
let arr: [i32; 5] = [1,2,3,4,5];
```
The type annotation `[i32; 5]` means its an array of `i32` with exactly 5 elements.

To access elements in array, you can use these `[]`:
```rust
let first = arr[0]; // 1
let second = arr[1]; // 2
```

> If you try to access an index that's out of bounds, then Rust will **panic** ( crash at runtime with an error message )

You can also create an array where every element is the same value:
```rust
let zeros = [0u8; 25]; // 25 elements all set to 0
```
This means, create an array of type `u8` with 25 elements and intialize all the elements to 0.

## Functions
### Defining Functions
```rust
fn add(x: i32, y: i32) -> i32 {
	x + y
}
```
To define a function in rust you need to use the `fn` keyword. `add` is the function's name. `(x: i32, y: i32)` are the parameters. Parameter types are always required. `-> i32` this means the function returns an `i32` type and the body is inside the `{}`.

### Return Values
In Rust, the last expression is a function body is automatically returned, that's why we didn't have a return keyword in the above function.

> **Statements** end with a semicolon `;` and do not produce a value but **Expressions** do not end with a semicolon and produce a value.

If you add a semicolon to the last line, it becomes a statement, produces no value and the function now returns `()` (this is called a unit type, basically nothing) instead of `i32` and this would be a compilation error.

You can also keep it simple and use the return keyword:
```rust
fn check(x: i32) -> i32 {
	if x < 0 {
		return 0; // explicit return
	}
	x // implicit return
}
```

## Control Flow
### If/Else 
```rust
let number = 7;
if number < 5 {
	println!("less than 5");
} else if number == 5 {
	println!("exactly 5");
} else {
	println!("greater than 5");
}
```

In Rust, the condition doesn't need parentheses but the body must be inside the curly braces.

### `If` is an Expression
This is important to remember that in Rust, `if` is not just a statement, its an expression that produces a value:
```rust
let result = if number % 2 == 0 { "even" } else { "odd" };
```
Note that both the branches should produce the same type otherwise the compilation will fail.

### Loop
`loop` runs a block of code forever until you explicitly break out of it:
```rust
let mut count = 0;
loop {
	count += 1;
	if count == 5 {
		break;
	}
}
```

`loop` can also return a value through `break`:
```rust
let result = loop {
	count += 1;
	if count == 10 {
		break count * 2; // returns this value from the loop
	}
}
```

### While Loop
While loop runs as longs as a condition is true:
```rust
let mut n = 3;
while n > 0 {
	println!("{}", n);
	n -= 1;
}
```

### For Loop
The most common loop in Rust. The `for` loop iterates over a collection or a range:
```rust
// iterating over an array
let arr = [10, 20, 30];
for element in arr {
	println!("{}", element);
}

// iterating over a range
for i in 0..5 {
	println!("{}", i); // prints 0, 1, 2, 3, 4
}

// 0..=5 includes 5 (inclusive on both ends)
for i in 0..=5 {
	println!("{}", i); // prints 0, 1, 2, 3, 4, 5
}
```

`0..5` is a range, it starts from 0 and goes up to but not including 5. But `0..=5` is an inclusive range that includes 5.

## Match
`match` is Rust's pattern matching construct. It compares a value against a series of **patterns** and executes the code for the first pattern that matches:
```rust
let x = 3;

match x {
	1 => println!("one"),
	2 => println!("two"),
	3 => println!("three"),
	4 => println!("four"),
	_ => println!("other")
}
```

Each line inside the `match` is called an **arm**: `pattern => code`
`_` is the wildcard pattern, it matches anything. It's used as a catch all default case. One thing you need to remember is that `match` is exhaustive. This means you must cover all the possible values. If you don't the compiler will reject your code.

Like `if`, `match` is also an expression and can return a value:
```rust
let name = match x {
	1 => "one",
	2 => "two",
	_ => "other",
};
```
you can also match multiple patterns with `|`:
```rust
match x {
	1 | 2 => println!("one or two"),
	3..=9 => println!("three through nine"),
	_ => println!("something else"),
}
```

## Vectors (Brief Introduction)
Arrays have a fixed size known at compile time but sometimes you need a collection that can grow. This is where you can use a `Vec<T>`:
```rust
let mut v: Vector<char> = Vec::new();
v.push('a');
v.push('b');
println!("{}", v.len()); // 2
```

- `Vec::new()` creates an empty vector
- `.push(value)` adds an element to the end
- `.pop()` removes and returns the last element
- `.len()` returns the number of elements

## Basic String Types
Rust has two main string types:
- `&str` this is a string slice. It is an immutable reference to a sequence of UTF-8 bytes. String literals like `"hello"` have type `&str`.
- `String` this is a heap allocated growable string.
We will dive deep into these in the next article but for now just understand that if you need to have string literals, just use `&str`. If you need to build a string dynamically, then use the `String` type.

To iterate over each character of a string, you can use `chars()`:
```rust
let s = "hello";
for c in s.chars() {
	println!("{}", c);
}
```

This is great, now you know everything to build your project. We are going to build a **Brainfuck Interpreter** in Rust. 

## The Brainfuck Interpreter
Before writing any code, lets fully understand what we've building.

### What is Brainfuck?
Brainfuck is a programming language with only 8 instructions. The entire language fits in 8 characters. Despite that, it can compute anything a normal programming language can.

A brainfuck program operates on:
- A memory tape - an array of cells, each holding a number (a `u8`, so values 0-255). 
- A data pointer - an index that points to the current cell on the tape. It starts at 0 (the leftmost cell)
- A program - a string of characters, most of which are instructions

### The 8 Instructions

| Character | What it does                                                 |
| --------- | ------------------------------------------------------------ |
| >         | Move the data pointer one cell to the right                  |
| <         | Move the data pointer one cell to the left                   |
| +         | Increment the value at the current cell by 1                 |
| -         | Decrement the values at the current cell by 1                |
| .         | Output the current cell's value as an ASCII character        |
| ,         | Read one byte of input and store it in the current cell      |
| [         | If the current cell is 0, jump forward to the matching ]     |
| ]         | If the current cell is non-zero, jump back to the matching [ |

Every other character in a Brainfuck program is a comment, these gets simply ignored.

### How Loop Works
`[` and `]` together form a loop. Let me explain:
- When you hit `[:` check the current cell. If its `0`, skip everything until the matching `]`. If its non zero, enter the loop body.
- When you hit `]:` check the current cell. If its non-zero, jump back to the matching `[`. If its 0, exit the loop.
This is basically a `while (cell != 0) {...}` loop.

## What We Need to Build
1. A memory tape
2. A data pointer
3. A way to iterate through the program instruction by instruction basically a program counter (pc) as a `usize`
4. Bracket matching when we hit `[` or `]`, we need to find the matching counterpart. We will precompute this into a map before running.

### Create the Project
Let's start build our brainfuck interpreter. Open up your terminal and create a new project:
```shell
cargo new brainfuck-interpreter
cd brainfuck-interpreter
```

Open the project in your preferred editor and open the `src/main.rs` file and delete all the code

### The Memory Tape and Pointers
Type this into `src/main.rs`:
```rust
fn main() {
    let program = "++++++++[>++++[>++>+++>+++>+<<<<-]>+>+>->>+[<]<-]>>.>---.+++++++..+++.>>.<-.<.+++.------.--------.>>+.>++.";

    let mut tape = [0u8; 30000];
    let mut dp: usize = 0;
    let mut pc: usize = 0;
}
```
Now, let me explain what we just did:
- `let program = "..."` this is a brainfuck program that prints "Hello World!". It's just a `&str`(string literal). Our interpreter will read through it character by character.
- `let mut tape = [0u8; 30000]` this is our memory tape. This creates an array of 30,000 elements, each of them initialized to `0`, and each of them is of type `u8`(values 0-255). We need `mut` because instructions `+` and `-` will modify the cells.
- `let mut dp: usize = 0` dp stands for **data pointer**. It's the index into tape that points to the current cell. It starts at 0. Its `usize` because array indices in Rust must be `usize`.
- `let mut pc: usize = 0` pc stands for **program counter**. Its the index into program pointing at the current instruction. It starts at 0.

### Precomputing Bracket Matches
Before we run the program, we'll precompute where every `[` matches with its `]` and vice versa. This way, when we need to jump, we just do a lookup instead of scanning through the program every time.
We'll store this in a `Vec` where the index is the position of `[` or `]` and the value is the position of its matching counterpart.

Add this before main, as a separate function:
```rust
fn build_bracket_map(program: &str) -> Vec<usize> {
    let bytes = program.as_bytes();
    let len = bytes.len();
    let mut map = vec![0usize; len];
    let mut stack: Vec<usize> = Vec::new();

    for i in 0..len {
        match bytes[i] {
            b'[' => {
                stack.push(i);
            }
            b']' => {
                let open = stack.pop().expect("Unmatched ]");
                map[open] = i;
                map[i] = open;
            }
            _ => {}
        }
    }
    if !stack.is_empty() {
        panic!("Unmatched [");
    }
    map
}
```

Now, let me explain everything:
- `fn build_bracket_map(program: &str) -> Vec<usize>` this function takes a `&str`(the program text) and returns a `Vec<usize>`(the bracket map)
- `let bytes = program.as_bytes()` here `as_bytes()` converts the `&str` into a slice of raw bytes `&[u8]`. This lets us compare characters as byte values using `b'['` syntax(a byte literal). Its slightly more efficient than working with `char` here and brainfuck only uses ASCII characters so its completely valid.
- `let mut map = vec![0usize; len]` here `vec![value; len]` is a macro that creates a `Vec` with `count` elements all set to `value`. So this creates a vector of `len` zeroes. Here, every position starts as `0`.
- `let mut stack: Vec<usize> = Vec::new()` this is our stack for tracking open brackets. When we see a `[`, we push its position. When we see a `]`, we pop the most recent `[` position because that is its matching opening bracket.
- `for i in 0..len` loop here we iterate through every index of the program
	- `match bytes[i]` we match on the byte at position `i`
		- `b'[' => stack.push(i)` when we see an open bracket, we push its index onto the stack.
		- `b']'` when we see a close bracket
			- `stack.pop()` removes and returns the last pushed index(the matching `[`)
			- `.expect("Unmatched ]")` if the stack is empty, there's no matching `[`, so we crash with this error message. `.expect()` is a method on `Option` that either unwraps the value or panics with your message. We'll cover `Option` deeply later, but for now `pop()` returns `None` if the stack is empty and `expect()` handles that.
			- `map[open] = i` this means at the `[` position, the jump target is `]`
			- `map[i] = open` this means at the `]` position, the jump target is `[`
		- `_ => {}` for any other character, we will just ignore and do nothing
- `if !stack.is_empty() {panic!(...)}` after processing the whole program, if the stack still has entries, that means there are unmatched `[`. `panic!` crashes the program with a message

### The Main Execute Loop
Now back inside `main` function, after the variable declarations, call `build_bracket_map` and then write the execution loop:
```rust
fn main() {
    let program = "++++++++[>++++[>++>+++>+++>+<<<<-]>+>+>->>+[<]<-]>>.>---.+++++++..+++.>>.<-.<.+++.------.--------.>>+.>++.";

    let mut tape = [0u8; 30000];
    let mut dp: usize = 0;
    let mut pc: usize = 0;

    let bracket_map = build_bracket_map(program);
    let bytes = program.as_bytes();

    while pc < bytes.len() {
        match bytes[pc] {
            b'>' => dp += 1,
            b'<' => dp -= 1,
            b'+' => tape[dp] = tape[dp].wrapping_add(1),
            b'-' => tape[dp] = tape[dp].wrapping_sub(1),
            b'.' => print!("{}", tape[dp] as char),
            b',' => { /* input not needed for Hello World */ }
            b'[' => {
                if tape[dp] == 0 {
                    pc = bracket_map[pc];
                }
            }
            b']' => {
                if tape[dp] != 0 {
                    pc = bracket_map[pc];
                }
            }
            _ => {}
        }
        pc += 1;
    }

    println!();
}
```
Now, let me explain this:
- `while pc < bytes.len()` this keep executing as long as the program counter hasn't gone past the end of the program.
- `b'>' => dp += 1` moves the data pointer right, just incrementing the index
- `b'<' => dp -= 1` moves the data pointer left, just decrementing the index
- `b'+' => tape[dp].wrapping_add(1)` this increments the current cell. We use `.wrapping_add(1)` instead of `tape[dp] += 1` because our cells are `u8`(0-255). If the value is 255 and you add 1, a normal += would panic in debug mode due to integer overflow. The `.wrapping_add` instead wraps around to 0. This is standard brainfuck behaviour.
- `b'-' =? tape[dp].wrapping_sub(1)` this decrements the current cell. Same idea as add operation.
- `b'.' => print!("{}", tape[dp] as char)` this prints the current cell as an ASCII character. `tape[dp] as char` is a type cast from `u8` to `char` type. For example, the value `72` becomes `H`. `print!`(without `ln`) prints without creating a newline.
- `b','` we leave it as an empty block as we are not taking input dynamically.
- `b'['` if the current cell is `0`, then jump to the matching `]` by setting `pc = bracket_map[pc]`. The `pc += 1` at the bottom of the loop then moves us past the `]`.
- `b']'` if the current cell is non-zero, then jump back to the matching `[`
- `_ => {}` we are using this again to ignore any non instruction character
- `pc += 1` after processing each instruction, move the program counter to the next character
- `println!()` after the program finishes, it prints a newline so your terminal prompt appears on a fresh line.

Finally, we covered a bunch of stuff and also built our project. Now lets try running it and see it in action. In your terminal, type:
```shell
cargo run
```

You should see an output like:
```shell
Compiling brainfuck-interpreter v0.1.0 (/Users/.../.../.../brainfuck-interpreter)
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.10s
     Running `target/debug/brainfuck-interpreter`
Hello World!
```

## Conclusion
In this post, you understood most of basic common things in Rust and build a simple brainfuck interpreter in Rust. In the next one, you are going to learn about ownership, borrowing and slices and build a **mini grep clone** that's gonna be fun. I hope to see you soon. Till then, goodbye!
