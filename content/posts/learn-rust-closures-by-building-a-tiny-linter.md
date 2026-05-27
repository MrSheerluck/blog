+++
title = "Learn Rust Closures By Building a Tiny Rule-Based Linter"
description = "In this post, we are going to learn about closures and functional patterns in Rust. Once we cover all the concepts, we will build a Tiny Rule-based Text Linter"
date = 2026-05-28
transparent = true

[taxonomies]
tags = ["rust", "project"]
series = ["learning-rust"]
+++


In this post, we are going to learn about closures and functional patterns in Rust. Once we cover all the concepts, we will build a Tiny Rule-based Text Linter where lint rules are closures stored in a `Vec<Box<dyn Fn>>`, pass behaviour as values, and auto-fix code. I'm really excited for this project and I hope you are too. I won't go too deep in theory, just practical and we will build our knowledge of these concepts over time with more articles.

The only prerequisite is that you have read the previous articles in this series, as I will assume you know ownership, borrowing, structs, enums, pattern matching, error handling, generics, traits, and lifetimes.

Get the source code [here](https://github.com/MrSheerluck/linter-rust)

## What is `Box<T>`
Before we talk about closures, we need to understand `Box<T>`. You saw `Box` briefly in the JSON parser when we talked about recursive enums. Let me explain it properly now.

A `Box<T>` is a heap-allocated value. When you write `let x = Box::new(42)`, Rust allocates space for `42` on the heap and stores a pointer to it on the stack. The `Box` owns the value, when the `Box` is dropped, the heap memory is freed.

```rust
let x = Box::new(42);
println!("{}", x); // 42
```
`Box::new(42)` allocates `42` on the heap and returns a `Box<i32>` that owns it. You can use `x` just like a regular `i32`. Rust dereferences it automatically when you access it. This is called "deref coercion."

Without `Box`, local bindings themselves are usually stack-allocated, though many types such as `Vec` and `String` may still allocate their contents on the heap internally. With `Box`, you explicitly move a value onto the heap while keeping a pointer on the stack.
## Why Do We Need Box
There are two main reasons to use Box:
1. Recursive types: A struct that contains itself would have infinite size on the stack. Putting it behind a `Box` gives it a fixed size (just the pointer). This is exactly what we did in the JSON parser with recursive `JsonValue` variants.
2. Trait objects: When you want to store values of different types in a single `Vec`, they must all be the same size. `Box` puts them on the heap so the `Vec` only stores fixed-size pointers.
## What Are Trait Objects
A trait object lets us work with values through a trait interface without knowing their concrete type at compile time.

```rust
trait Animal {
    fn speak(&self);
}

struct Dog;
struct Cat;

impl Animal for Dog {
    fn speak(&self) {
        println!("woof");
    }
}

impl Animal for Cat {
    fn speak(&self) {
        println!("meow");
    }
}
```

`Dog` and `Cat` are completely different concrete types. Normally, a `Vec<T>` can only store a single concrete type:

```rust
let dogs: Vec<Dog> = vec![Dog, Dog];
```

If we try to mix `Dog` and `Cat` directly inside the same vector, Rust rejects it:

```rust
// ERROR
// let animals = vec![Dog, Cat];
```

Rust needs every element in a `Vec` to have the same concrete type and size at compile time.

Trait objects solve this problem.

```rust
let animals: Vec<Box<dyn Animal>> = vec![
    Box::new(Dog),
    Box::new(Cat),
];
```

`dyn Animal` means "Some type that implements the `Animal` trait."

The concrete type (`Dog` or `Cat`) is erased, and we interact with the value only through the trait methods defined by `Animal`.

Now we can iterate over the vector:

```rust
for animal in animals {
    animal.speak();
}
```

Rust will call the correct implementation at runtime, either `Dog::speak` or `Cat::speak` depending on the concrete type behind the trait object.

This is called dynamic dispatch.
Under the hood, a trait object stores a pointer to the actual data along with a pointer to a vtable.
A vtable ("virtual method table") contains function pointers for the trait methods of the concrete type.

When we call:
```rust
animal.speak();
```

Rust looks up the correct function in the vtable and calls the appropriate implementation for the concrete type behind the trait object.

Trait objects are dynamically sized types (DSTs). Rust does not know their size at compile time, so they must be used behind some kind of pointer such as `Box<dyn Trait>`, `&dyn Trait`, or `Rc<dyn Trait>`.

This is why we later use `Box<dyn Fn>` for storing closures of different concrete types inside the same `Vec`.
## Closures
Now that you understand Box and dyn, let's learn about closures.

A closure is an anonymous function that can capture variables from its environment.
```rust
let x = 10;
let add_x = |n| n + x;
println!("{}", add_x(5)); // 15
```
`|n| n + x` is a closure. The parameter `n` goes between the pipes `|n|`, and the body `n + x` follows. The closure captures `x` from the surrounding scope and adds it to `n`. When we call `add_x(5)`, it returns `15`.

This is different from a regular function. A regular `fn` cannot access variables from the enclosing scope

## Closure Syntax
```rust
// Full syntax with type annotations
let closure = |n: i32| -> i32 { n + 1 };
// Inferred types (most common)
let closure = |n| n + 1;
// Multiple parameters
let add = |a, b| a + b;
// No parameters
let greet = || println!("hello");
```
Closures can have type annotations like regular functions, but usually Rust infers the types from how you use the closure. The pipes `||` enclose the parameter list, just like parentheses `()` in a regular function. Unlike functions, closures with a single expression can omit the curly braces.

## How Closures Capture Variables
Closures capture variables from their environment in three ways, matching the three borrowing modes:

| Capture Mode | How It Captures     | Closure Trait |
| ------------ | ------------------- | ------------- |
| `&T`         | Immutable reference | `Fn`          |
| `&mut T`     | Mutable reference   | `FnMut`       |
| `T`          | Ownership (move)    | `FnOnce`      |

Rust infers the capture mode automatically based on what the closure does with the captured variable.

```rust
let s = String::from("hello");
let print_it = || println!("{}", s);

let mut s2 = String::from("hello");
let mut push_world = || s2.push_str(" world");

let s3 = String::from("hello");
let consume = || drop(s3);
```
`print_it` only reads `s`, so Rust captures it by immutable reference and the closure implements `Fn`.

`push_world` mutates `s2`, so Rust captures it by mutable reference and the closure implements `FnMut`.

`consume` takes ownership of `s3` using `drop`, so the closure implements `FnOnce`. After the first call, `s3` is gone and the closure cannot be called again.

The traits form a hierarchy:
- `Fn` closures can be called many times without mutation
- `FnMut` closures can mutate captured state
- `FnOnce` closures may consume captured values
## The `move` Keyword
Sometimes you need to force a closure to take ownership of captured variables. This is essential when the closure will outlive the scope where it was created.
```rust
let s = String::from("hello");
let closure = move || {
    println!("{}", s);
};
// println!("{}", s); // ERROR: s was moved into the closure
```
The `move` keyword before the pipes tells Rust: capture everything by value, even if the closure only reads the variable. Without `move`, the closure would borrow `s` by reference. With `move`, it takes ownership of `s`.

## Storing Closures: The Problem
Every closure has a unique type. Two closures with the same signature are different types:
```rust
let c1 = |x: &str| x.len() > 80;
let c2 = |x: &str| x.contains('\t');
// These are DIFFERENT types. You cannot do this:
// let rules: Vec<???> = vec![c1, c2];
```
We cannot name the type of a closure. Even if we could, they would be different sizes.

## Storing Closures: The Solution with `Box<dyn Fn>`
We use `Box<dyn Fn>`, a boxed trait object. `Box` gives the vector a fixed-size pointer representation even though the underlying closure types differ. `dyn Fn(...)` erases the concrete type and uses a vtable for dynamic dispatch.
```rust
let mut rules: Vec<Box<dyn Fn(&str) -> Vec<String>>> = Vec::new();
rules.push(Box::new(|line| {
    if line.len() > 80 {
        vec!["Line too long".to_string()]
    } else {
        vec![]
    }
}));
rules.push(Box::new(|line| {
    if line.contains("TODO") {
        vec!["Contains TODO".to_string()]
    } else {
        vec![]
    }
}));
```
`Box::new(|line| ...)` heap-allocates the closure. `Box::new` allocates space on the heap and moves the closure into it, returning a `Box` pointer. When we push into rules, Rust sees `Box<UniqueClosureType>` and coerces it to `Box<dyn Fn(...)>`.

The `dyn` keyword means the `Box` now holds a fat pointer: one pointer to the heap-allocated closure data, and one pointer to a vtable that tells Rust how to call `Fn::call` on this specific closure. When we call `rule(line)`, Rust looks up the function address in the vtable and calls through it.

## Why Can't We Use Generics in the Struct
Instead of `Box<dyn Fn>`, why not make the `Linter` struct generic?
```rust
struct Linter<F: Fn(&str) -> Vec<Violation>> {
    rules: Vec<F>,
}
```
A generic struct is monomorphized: the compiler creates a separate copy for each concrete `F`. But we want to store different closures with different types in the same `Vec`. A `Vec<F>` can only hold one type of closure. With `Box<dyn Fn>`, all closures are erased to the same type (`Box<dyn Fn(...)`) so they fit in the same `Vec`.

This is the fundamental tradeoff:
- Generics (`impl Fn` / `F: Fn`): Static dispatch, faster, but all items must be the same concrete type
- Trait objects (`Box<dyn Fn>`): Dynamic dispatch, slightly slower, but items can be different concrete types

## The Project: Tiny Rule-based Text Linter
Now that you understand closures, `Box`, `dyn` trait objects, and how they work together, let's build our Tiny Rule-based Text Linter.

Our program will:
- Define lint rules as closures: Fn(&str) -> `Vec<Violation>`
- Store rules in a `Vec<Box<dyn Fn(&str) -> Vec<Violation>>>`
- Run all rules over each line of a file
- Report all violations with line numbers
- Support fixers as `Fn(&mut String) -> bool` closures
- Apply fixers to auto-correct issues
## Project Setup
Open your terminal and run:
```bash
cargo new linter
cd linter
```

Now open `src/main.rs` and let's build this step by step.

### The Violation and Linter Types
```rust
use std::fs;

#[derive(Debug)]
struct Violation {
    line: usize,
    message: String,
}

struct Linter {
    rules: Vec<Box<dyn Fn(&str) -> Vec<Violation>>>,
    fixers: Vec<Box<dyn Fn(&mut String) -> bool>>,
}
```
`Violation` holds a line number and a message describing the problem. `Linter` holds two vectors of boxed trait objects.

Let's read `Vec<Box<dyn Fn(&str) -> Vec<Violation>>>` from the inside out:
- `&str` is the input: a line of text
- `Vec<Violation>` is the output: all violations found on that line  
- `dyn Fn(&str) -> Vec<Violation>` is a trait object: any closure that takes &str and returns `Vec<Violation>`
- `Box<...>` heap-allocates that trait object so all entries in the `Vec` are the same size (a pointer)
- `Vec<Box<...>>` is the collection holding all our rules
Same for fixers, but fixers take `&mut` String (the entire file) and return `bool` (whether they changed anything).

### Adding Rules and Fixers
```rust
impl Linter {
    fn new() -> Linter {
        Linter {
            rules: Vec::new(),
            fixers: Vec::new(),
        }
    }
    fn add_rule<F>(&mut self, rule: F)
    where
        F: Fn(&str) -> Vec<Violation> + 'static,
    {
        self.rules.push(Box::new(rule));
    }
    fn add_fixer<F>(&mut self, fixer: F)
    where
        F: Fn(&mut String) -> bool + 'static,
    {
        self.fixers.push(Box::new(fixer));
    }
}
```

Each `add_*` method is generic over `F`. The `where` clause constrains `F` to implement the appropriate `Fn` trait and be `'static`.

The `'static` bound means the closure cannot contain borrowed references tied to shorter lifetimes. In practice, this usually means the closure either captures nothing or captures owned values using `move`.This is required because `Box<dyn Fn(...)>` does not carry lifetime information.


When we call `Box::new(rule)`, Rust allocates the closure on the heap. The `Box<F>` is then coerced to `Box<dyn Fn(...)>` when pushed into the vector. The concrete type `F` is erased, replaced with a fat pointer that includes a vtable.

### Running Rules and Fixers
```rust
impl Linter {
    fn check(&self, content: &str) -> Vec<Violation> {
        let mut all_violations = Vec::new();
        for (line_num, line) in content.lines().enumerate() {
            for rule in &self.rules {
                let violations = rule(line);
                for v in violations {
                    all_violations.push(Violation {
                        line: line_num + 1,
                        message: v.message,
                    });
                }
            }
        }
        all_violations
    }
    fn fix(&self, content: &mut String) -> usize {
        let mut fixed_count = 0;
        for fixer in &self.fixers {
            if fixer(content) {
                fixed_count += 1;
            }
        }
        fixed_count
    }
}
```
`check` iterates over every line using `content.lines()`, which returns an iterator. `enumerate()` pairs each line with its 0-based index. We adjust to 1-based for human-friendly output.
For each line, we iterate over every rule in `self.rules`. Each rule is a `Box<dyn Fn(&str) -> Vec<Violation>>`. When we call `rule(line)`, Rust:
1. Reads the fat pointer from the Box
2. Looks up `Fn::call` in the vtable
3. Calls the closure's actual function through the vtable pointer
4. Returns the `Vec<Violation>` result

This is dynamic dispatch. The tiny runtime cost is the vtable lookup.
`fix` is similar but passes `&mut` content to each fixer. Fixers return `bool` to indicate whether they changed anything.

### Defining Lint Rules as Closures
Now let's define some lint rules. Each rule is a closure that takes a line and returns violations.
```rust
fn main() {
    let mut linter = Linter::new();
    // Rule 1: Check for trailing whitespace
    linter.add_rule(|line| {
        let mut violations = Vec::new();
        if line.len() > line.trim_end().len() {
            violations.push(Violation {
                line: 0,
                message: "Trailing whitespace".to_string(),
            });
        }
        violations
    });
    // Rule 2: Check for lines longer than 80 characters
    linter.add_rule(|line| {
        let mut violations = Vec::new();
        if line.len() > 80 {
            violations.push(Violation {
                line: 0,
                message: format!("Line too long ({} characters)", line.len()),
            });
        }
        violations
    });
    // Rule 3: Check for hard tabs
    linter.add_rule(|line| {
        let mut violations = Vec::new();
        if line.contains('\t') {
            violations.push(Violation {
                line: 0,
                message: "Hard tab detected, use spaces".to_string(),
            });
        }
        violations
    });
    // Rule 4: Check for TODO and FIXME comments
    linter.add_rule(|line| {
        let mut violations = Vec::new();
        if line.contains("TODO") || line.contains("FIXME") {
            violations.push(Violation {
                line: 0,
                message: "Contains TODO or FIXME marker".to_string(),
            });
        }
        violations
    });
}
```
Each `linter.add_rule(...)` passes a closure. These closures don't capture anything from the environment, they only use their `line` parameter. Since they have no captures, Rust infers `Fn` for them, and they satisfy `'static` trivially.

Each rule sets `line: 0` as a placeholder. The `check` method overwrites this with the actual line number when it iterates. The rules don't know their line number, they only analyze a single line.

Let's trace through what happens when we call `linter.check`:
1. `check` opens the file and starts reading lines
2. For line 1, it calls the first closure (trailing whitespace rule). Rust looks up the vtable, calls the closure, gets back a `Vec`. If the line has trailing spaces, the `Vec` has one violation. If not, it is empty.
3. It calls the second closure (line length rule) on the same line. Same vtable lookup process.
4. Continues for all four rules on line 1.
5. Moves to line 2, repeats.
6. All violations are collected into a single `Vec`.

### A Fixer Closure
```rust
fn main() {
    // ... rules from above ...
    // Fixer: Remove trailing whitespace
    linter.add_fixer(|content| {
        let original = content.clone();
        *content = content
            .lines()
            .map(|line| line.trim_end())
            .collect::<Vec<_>>()
            .join("\n");
        if original.ends_with('\n') {
            content.push('\n');
        }
        *content != original
    });
}
```
This closure captures nothing. `content.clone()` saves the original so we can compare at the end. `content.lines()` returns an iterator over lines (without trailing newlines). `.map(|line| line.trim_end())` transforms each line by stripping trailing whitespace. `.collect::<Vec<_>>()` collects into a `Vec<&str>`. `.join("\n")` joins them back with newlines.

The tricky part: `lines()` does not include the trailing newline. If the original file ended with `\n`, the joined string won't have one. We check `original.ends_with('\n')` and push a newline if needed.

The closure returns `*content != original`, `true` if we modified the content, `false` if it was already clean.

### The Main Function
```rust
fn main() {
    // ... rule definitions and fixer from above ...
    let args: Vec<String> = std::env::args().collect();
    let file_path = if args.len() > 1 {
        &args[1]
    } else {
        eprintln!("Usage: cargo run -- <file>");
        return;
    };
    let mut content = match fs::read_to_string(file_path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Error reading {}: {}", file_path, e);
            return;
        }
    };
    let violations = linter.check(&content);
    if violations.is_empty() {
        println!("No violations found.");
    } else {
        for v in &violations {
            println!("{}:{} {}", file_path, v.line, v.message);
        }
        println!("\n{} violation(s) found.", violations.len());
    }
    let fixed_count = linter.fix(&mut content);
    if fixed_count > 0 {
        println!("\n{} fixer(s) applied.", fixed_count);
        match fs::write(file_path, &content) {
            Ok(()) => println!("File updated."),
            Err(e) => eprintln!("Error writing {}: {}", file_path, e),
        }
    }
}
```
We read the file into a `String`, run check to collect violations, print them in `filename:line: message` format, then run fix to auto-correct. If any fixer applied changes, we write back to disk.

The check method takes `&self` because rules only read lines. The fix method also takes `&self`, the mutation is on the external content parameter, not on self.

## Closures That Capture
All the closures so far have been "pure" (no captures). Let's make things more interesting by capturing variables

```rust
// Configurable max line length
let max_line_length = 100;
linter.add_rule(move |line| {
    let mut violations = Vec::new();
    if line.len() > max_line_length {
        violations.push(Violation {
            line: 0,
            message: format!(
                "Line too long ({} chars, max {})",
                line.len(),
                max_line_length
            ),
        });
    }
    violations
});
```
The closure captures `max_line_length` from the surrounding scope. We use `move` to force ownership transfer into the closure.

Without `move`, the closure would capture `&max_line_length`, a reference to the local variable. But `Box<dyn Fn(...)>` requires the closure to be `'static`. If the closure held a reference to `max_line_length`, what happens when main returns and `max_line_length` is dropped? The reference would dangle. Rust prevents this at compile time.

With `move`, the closure takes ownership of `max_line_length`. The `i32` value is copied into the closure's internal state (on the heap, inside the Box). Now the closure is self-contained and `'static`.

### Forbidden Words Rule
```rust
let forbidden_words = vec!["debug", "println", "unwrap", "todo"];
linter.add_rule(move |line| {
    let mut violations = Vec::new();
    for word in &forbidden_words {
        if line.contains(word) {
            violations.push(Violation {
                line: 0,
                message: format!("Forbidden word '{}' found", word),
            });
        }
    }
    violations
});
```
`move` gives ownership of the entire `Vec<&str>` to the closure.The `Vec` stores its elements in a heap-allocated buffer, while the `Vec` struct itself contains pointer/len/cap metadata. With `move`, the closure owns this vector. Inside the closure, for word in `&forbidden_words` borrows from the closure's own captured state.

Closures let us package both behaviour and captured state together as a single value.
## Running The Project
Create a test file:
```bash
cat > test.rs << 'EOF'
fn main() {
    println!("hello world");   
    let x = 10; // TODO: fix this
    println!("{}", x);
}
EOF
```
This contains three trailing whitespace after the `println!("hello world");`.

Now run the linter:
```bash
cargo run -- test.rs
```
You should see output like this:
```bash
test.rs:2 Trailing whitespace
test.rs:3 Contains TODO or FIXME marker
2 violation(s) found.
1 fixer(s) applied.
File updated.
```
The linter found trailing whitespace on line 2 and a TODO marker on line 3. The trailing whitespace fixer ran and cleaned up the file automatically.
