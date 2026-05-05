+++
title = "Learn Error Handling in Rust By Building a TOML Config Parser"
description = "In this post, we are going to build a toml config parser in Rust and learn error handling in Rust using Result"
date = 2026-05-06
transparent = true

[taxonomies]
tags = ["rust", "project"]
series = ["learning-rust"]
+++

In this post, we are going to learn about error handling in Rust. Once we cover all the concepts, we will build a **TOML config parser with schema validation**. Every error must be handled properly using `Result`. Let's start.

You can get the source code from **[here]([https://github.com/MrSheerluck/config-parser-in-rust](https://github.com/MrSheerluck/toml-config-parser-in-rust))**

## Why `panic!` and `unwrap` Are Not Enough

In the previous articles, we used `panic!` and `.expect()` and `.unwrap()` all over the place. When something went wrong, we just crashed the program. Let me remind you:

In the JSON parser, when the lexer hit an unexpected character, we did this:

```
panic!("Unexpected character: {}", c as char);
```

And when the parser encountered a token it didn't expect:

```
panic!("Expected ':' in object");
```

This is fine for a learning exercise. But real software can't just crash when something goes wrong. A web server can't crash because one request had bad input, it needs to return an error to that client and keep serving others. A config parser can't crash because one field has the wrong type, it needs to tell the user exactly what's wrong and move on.

Here's the rule you should internalise:

> `panic!` is for **programmer bugs**: things that should never happen if your code is correct. Like indexing past the end of an array, or dividing by zero. These are "I messed up" situations.
>
> `Result` is for **expected failures**: things that can happen even when your code is perfect. Like bad user input, missing files, network timeouts. These are "something went wrong and I need to handle it" situations.

In this article, we are going to replace every `panic!` and `.unwrap()` with proper `Result` based error handling. By the end, our program will never crash unexpectedly. It will always produce a clear, specific error message telling you exactly what went wrong and where.

## `Option<T>` - Dealing with Absence

Before we get to `Result`, let's talk about its simpler cousin: `Option`.

How many times have you written code that returns `null` or `-1` or some magic value to signal "nothing found"? In Rust, we don't do that. Instead, we use `Option<T>`.

`Option<T>` is an enum with two variants:

```rust
enum Option<T> {
    Some(T),  // there is a value, and it's of type T
    None,     // there is no value
}
```

Instead of returning `null` or `-1`, a function returns `Option<T>`. If it has a value, it returns `Some(value)`. If not, it returns `None`.

### Creating Options

```rust
let some_number = Some(42);
let some_string = Some("hello");
let nothing: Option<i32> = None;
```

When you create a `Some` value, Rust can infer the type `T`. But when you create a `None`, Rust needs to know what type `T` would be if it were `Some`, so you often need a type annotation.

### Pattern Matching on Option

You can `match` on an `Option` just like any other enum:

```rust
let maybe_number = Some(42);

match maybe_number {
    Some(n) => println!("got {}", n),
    None => println!("got nothing"),
}
```

Or use `if let` when you only care about one variant:

```rust
if let Some(n) = maybe_number {
    println!("got {}", n);
}
```

We actually used `Option` in previous articles. Remember the brainfuck interpreter? `Lexer::current()` returned `Option<u8>`. `Some(byte)` when there was a byte to read, `None` when we reached the end of input. The JSON parser's `Parser::current()` also returned `Option<&Token>`. These are natural uses of `Option`, sometimes there's a value, sometimes there isn't, and the type system forces you to handle both cases.

### Useful Methods on Option

**`.unwrap()`**: extract the value inside `Some`, or panic if `None`:

```rust
let x = Some(5);
println!("{}", x.unwrap()); // 5

let y: Option<i32> = None;
println!("{}", y.unwrap()); // PANICS!
```

We're trying to get away from `unwrap`, but you should still know what it does.

**`.unwrap_or(default)`**:  extract the value, or return a default if `None`:

```rust
let x: Option<i32> = None;
println!("{}", x.unwrap_or(0)); // 0

let y = Some(42);
println!("{}", y.unwrap_or(0)); // 42
```

**`.is_some()` and `.is_none()`**: check which variant you have:

```rust
let x = Some(5);
println!("{}", x.is_some()); // true
println!("{}", x.is_none()); // false
```

## `Result<T, E>` - Dealing with Failure

`Option<T>` handles absence. `Result<T, E>` handles failure. They look similar, but serve different purposes:

- `Option<T>` - "there might be a value, or there might be nothing" (like searching for something in a collection)
- `Result<T, E>` - "this operation might succeed with a value of type T, or it might fail with an error of type E" (like parsing a file, reading from disk, making a network request)

`Result<T, E>` is an enum with two variants:

```rust
enum Result<T, E> {
    Ok(T),   // success, contains a value of type T
    Err(E),  // failure, contains an error of type E
}
```

We actually already used `Result` in the grep article. `Regex::new(pattern)` returns `Result<Regex, Error>`. If the pattern is valid regex, you get `Ok(regex)`. If it's malformed, you get `Err(error)`. And we matched on it:

```rust
let regex = match Regex::new(pattern) {
    Ok(r) => r,
    Err(e) => {
        eprintln!("Invalid pattern: {}", e);
        std::process::exit(1);
    }
};
```

Now we're going to go much deeper.

### Pattern Matching on Result

Just like `Option`, you can match on `Result`:

```rust
match result {
    Ok(value) => println!("success: {}", value),
    Err(error) => println!("failure: {}", error),
}
```

### Useful Methods on Result

**`.unwrap()`** - extract the `Ok` value, or panic on `Err`. Same warning as above: we're moving away from this.

**`.expect("message")`** - like `unwrap`, but panics with your custom message:

```rust
let bad: Result<i32, &str> = Err("error");
bad.expect("the number should be valid"); // PANICS with "the number should be valid: error"
```

**`.unwrap_or(default)`** - extract the `Ok` value, or return a default on `Err`:

```rust
let bad: Result<i32, &str> = Err("oops");
println!("{}", bad.unwrap_or(0)); // 0
```

**`.is_ok()` and `.is_err()`** - check which variant you have:

```rust
let result: Result<i32, &str> = Ok(42);
println!("{}", result.is_ok());  // true
println!("{}", result.is_err()); // false
```

## The `?` Operator

Here's a common pattern in Rust. You call a function that returns a `Result`. If it's `Ok`, you continue. If it's `Err`, you return the error to the caller. Written out with `match`, it looks like this:

```rust
fn do_something() -> Result<i32, MyError> {
    let a = match step_one() {
        Ok(value) => value,
        Err(e) => return Err(e),
    };

    let b = match step_two(a) {
        Ok(value) => value,
        Err(e) => return Err(e),
    };

    let c = match step_three(b) {
        Ok(value) => value,
        Err(e) => return Err(e),
    };

    Ok(c)
}
```

This is called the "pyramid of doom" and it's exhausting to write and read. Rust has the `?` operator to fix this:

```rust
fn do_something() -> Result<i32, MyError> {
    let a = step_one()?;
    let b = step_two(a)?;
    let c = step_three(b)?;
    Ok(c)
}
```

The `?` operator does exactly what the `match` version does:
- If the `Result` is `Ok(value)`, it extracts the value and continues
- If the `Result` is `Err(error)`, it returns the error from the current function immediately

It also works on `Option`:
- If `Some(value)`, it extracts the value and continues
- If `None`, it returns `None` from the current function

> There's one catch: the function you're using `?` in must return a `Result` (or `Option`). You can't use `?` in `main` unless `main` returns a `Result`. We'll handle this by keeping our main logic in a separate `run` function that returns `Result`.

### `?` Also Converts Error Types

If your function returns `Result<T, ErrorA>` and a function you call returns `Result<T, ErrorB>`, you can't just use `?` directly because the error types don't match. But if `ErrorA` implements `From<ErrorB>`, then `?` will automatically convert `ErrorB` into `ErrorA` for you.

We'll use this in our project our custom `ConfigError` type will implement `From<std::io::Error>` (via `thiserror`) so that we can use `?` on file-reading operations that return `io::Error`.

## Defining Custom Error Types

Using `String` as your error type works, but it's not great. You can't programmatically inspect what went wrong. You can't match on different kinds of errors. You can't add structured data like line numbers and column numbers.

The solution is to define your own error type as an enum. Let me show you how.

### Creating the Error Enum

First, define the error enum with a variant for each kind of error:

```rust
enum ConfigError {
    UnexpectedCharacter {
        line: usize,
        col: usize,
        expected: String,
        found: String,
    },
    UnterminatedString {
        line: usize,
        col: usize,
    },
    InvalidNumber {
        line: usize,
        col: usize,
        detail: String,
    },
}
```

Each variant carries specific data about what went wrong and where. `UnexpectedCharacter` tells you the line, column, what was expected, and what was found. `UnterminatedString` tells you where the string started. `InvalidNumber` gives you the position and what was wrong with the number.

This is the structural approach. When you need to display an error message, you match on the variant and format it. When you need to handle specific errors differently, you match on the variant and take different actions.

### Using `thiserror` to Automate the Boilerplate

Writing error messages by hand is repetitive. Every time you add a variant, you have to update the match. The `thiserror` crate automates this with derive macros:

```rust
use thiserror::Error;

#[derive(Debug, thiserror::Error)]
enum ConfigError {
    #[error("unexpected character at line {line}, column {col}: expected {expected}, found '{found}'")]
    UnexpectedCharacter {
        line: usize,
        col: usize,
        expected: String,
        found: String,
    },
    #[error("unterminated string starting at line {line}, column {col}")]
    UnterminatedString { line: usize, col: usize },
    #[error("invalid number at line {line}, column {col}: {detail}")]
    InvalidNumber {
        line: usize,
        col: usize,
        detail: String,
    },
}
```

The `#[error("...")]` attribute on each variant replaces the manual message formatting. The `{field}` placeholders inside the string are replaced with the field values, just like `println!`. And the `#[derive(thiserror::Error)]` macro generates all the necessary trait implementations for us.

Under the hood, `thiserror` implements two traits for our `ConfigError`:

- **The Display trait** - this controls how the error appears when you format it with `{}` (like `format!("{}", err)` or `println!("{}", err)`). The `#[error("...")]` attribute becomes the Display implementation.
- **The Error trait** - this marks our type as an official error in Rust's error system. It's required for interoperability. We'll learn more about traits in a future article, but for now, just know that `#[derive(thiserror::Error)]` handles it for us.

The `Io(#[from] std::io::Error)` variant is special. The `#[from]` attribute tells thiserror to automatically implement `From<std::io::Error> for ConfigError`. This means when we call a function that returns `Result<_, std::io::Error>` (like `fs::read_to_string`), we can use `?` and the `io::Error` will be automatically converted into `ConfigError::Io`.

Notice how every error variant carries a `line` and (often) a `col`. This is deliberate. When you tell a user "invalid character", the first question they'll ask is "where?". By embedding position information in the error type itself, every error message can point to the exact location in the file.

Compare this with the JSON parser from the last article, where errors just said `panic!("Unexpected character")` with no location information. The difference is night and day.

Now, let's start working on our project.

## What is TOML?

TOML stands for **Tom's Obvious Minimal Language**. It's a configuration file format that's designed to be easy for humans to read and write. If you've ever used Rust, you've already seen TOML, every `Cargo.toml` file is a TOML file.

Here's what a TOML file looks like:

```toml
# This is a comment
host = "localhost"
port = 8080
debug = true

[server]
host = "localhost"
port = 8080
debug = true
```

The subset we'll support:
- **Key-value pairs**: `key = value`
- **Value types**: strings (`"hello"`), integers (`8080`), floats (`3.14`), booleans (`true`/`false`)
- **Tables**: `[section_name]` groups key-value pairs into sections
- **Comments**: `#` lines
- **Dotted keys in table headers**: `[server.host]` creates a nested section

We won't support arrays, inline tables, or array-of-tables. This keeps the scope focused on error handling, which is the point of this article.

## Project Setup

```
cargo new config_parser
cd config_parser
```

Open `Cargo.toml` and add `thiserror`:

```toml
[package]
name = "config_parser"
version = "0.1.0"
edition = "2024"

[dependencies]
thiserror = "2"
```

Open `src/main.rs` and delete everything. We'll write it from scratch.

## Step 1: The Error Types

Type this into `src/main.rs`:

```rust
use std::fs;

#[derive(Debug, thiserror::Error)]
enum ConfigError {
    #[error("unexpected character at line {line}, column {col}: expected {expected}, found '{found}'")]
    UnexpectedCharacter {
        line: usize,
        col: usize,
        expected: String,
        found: String,
    },
    #[error("unterminated string starting at line {line}, column {col}")]
    UnterminatedString { line: usize, col: usize },
    #[error("invalid number at line {line}, column {col}: {detail}")]
    InvalidNumber {
        line: usize,
        col: usize,
        detail: String,
    },
    #[error("expected {expected} at line {line}, column {col}, found {found}")]
    ExpectedToken {
        line: usize,
        col: usize,
        expected: String,
        found: String,
    },
    #[error("missing value for key '{key}' at line {line}, column {col}")]
    MissingValue {
        line: usize,
        col: usize,
        key: String,
    },
    #[error("schema violation at line {line}: key '{key}' expected type {expected}, found {found}")]
    SchemaViolation {
        line: usize,
        key: String,
        expected: String,
        found: String,
    },
    #[error("missing required key '{key}'")]
    MissingRequiredKey { key: String },
    #[error("key '{key}' has value {value} which is outside range {min} to {max}")]
    ValueOutOfRange {
        key: String,
        value: String,
        min: i64,
        max: i64,
    },
    #[error("unknown key '{key}' at line {line}")]
    UnknownKey { key: String, line: usize },
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}
```

Let me explain the key parts:

- `#[derive(Debug, thiserror::Error)]` - this tells Rust to automatically implement the `Debug` trait (for `{:?}` formatting) and the `Error` trait. The `thiserror::Error` derive macro generates everything based on the `#[error("...")]` attributes.
- Each `#[error("...")]` attribute is the error message for that variant. The `{field}` placeholders are replaced with the field values, just like in `println!`.
- The `Io(#[from] std::io::Error)` variant is special. The `#[from]` attribute tells thiserror to automatically implement `From<std::io::Error> for ConfigError`. This means when we call a function that returns `Result<_, std::io::Error>` (like `fs::read_to_string`), we can use `?` and the `io::Error` will be automatically converted into `ConfigError::Io`.

Notice how every error variant carries a `line` and (often) a `col`. When you tell a user "invalid character", the first question they'll ask is "where?". By embedding position information in the error type itself, every error message can point to the exact location in the file.

## Step 2: The Token Type and Lexer

### SpannedToken

In the JSON parser, the `Token` enum only carried the token's kind. In this project, we need each token to know where it came from. So we split the token into two parts: the kind and the location.

```rust
#[derive(Debug, Clone, PartialEq)]
enum TokenKind {
    Equal,
    StringLit(String),
    Integer(i64),
    Float(f64),
    Boolean(bool),
    Comment(String),
    Identifier(String),
    TableHeader(String),
    Newline,
}

#[derive(Debug, Clone)]
struct SpannedToken {
    kind: TokenKind,
    line: usize,
    col: usize,
}
```

- `TokenKind` is the "what kind of token is this" enum. `Equal` is `=`, `StringLit("hello")` is a quoted string, `Integer(42)` is a number, `Boolean(true)` is a boolean, `TableHeader("server")` is `[server]`, `Newline` is a line break.
- `SpannedToken` bundles the kind with its position in the source file (`line` and `col`). When we encounter an error, we can pull the position from the token that caused it.

Compare this with the JSON parser's `Token` enum. The key difference: our `SpannedToken` knows where it came from. The JSON parser's tokens had no position information, which is why its error messages were just "unexpected character" with no location.

### The Lexer

```rust
struct Lexer {
    input: Vec<u8>,
    pos: usize,
    line: usize,
    col: usize,
}
```

This is very similar to the JSON parser's lexer, but with one crucial addition: `line` and `col` tracking. Every time `advance()` is called, we check if the current byte is a newline. If it is, we increment `line` and reset `col` to 1. Otherwise, we just increment `col`. This gives us exact position information for every byte in the input.

### The tokenize Method

```rust
fn tokenize(&mut self) -> Result<Vec<SpannedToken>, ConfigError> {
```

Notice the return type: `Result<Vec<SpannedToken>, ConfigError>`. In the JSON parser, `tokenize` returned `Vec<Token>` and just paniced on errors. Here, it returns a `Result`. If tokenization succeeds, you get `Ok(tokens)`. If it fails, you get `Err(ConfigError)` with a specific variant telling you exactly what went wrong and where.

The body of `tokenize` is similar to the JSON parser, but every error case returns `Err(ConfigError::...)` instead of `panic!()`. Here's the key difference: in the JSON parser, an unexpected character caused `panic!("Unexpected character: {}", c as char)`. In our project, it returns `Err(ConfigError::UnexpectedCharacter { line, col, expected, found })` with the exact position built in.

### Reading Strings

```rust
fn read_string(&mut self) -> Result<(String, usize, usize), ConfigError> {
    let start_line = self.line;
    let start_col = self.col;
    self.advance();

    let mut result = String::new();
    loop {
        match self.current() {
            None => {
                return Err(ConfigError::UnterminatedString {
                    line: start_line,
                    col: start_col,
                });
            }
            Some(b'"') => {
                self.advance();
                return Ok((result, start_line, start_col));
            }
            Some(b'\\') => {
                self.advance();
                match self.current() {
                    Some(b'"') => { result.push('"'); self.advance(); }
                    Some(b'\\') => { result.push('\\'); self.advance(); }
                    Some(b'n') => { result.push('\n'); self.advance(); }
                    Some(b't') => { result.push('\t'); self.advance(); }
                    Some(b'r') => { result.push('\r'); self.advance(); }
                    _ => {
                        let found = match self.current() {
                            Some(b) => (b as char).to_string(),
                            None => String::from("end of input"),
                        };
                        return Err(ConfigError::UnexpectedCharacter {
                            line: self.line,
                            col: self.col,
                            expected: "valid escape sequence".to_string(),
                            found,
                        });
                    }
                }
            }
            Some(c) => {
                result.push(c as char);
                self.advance();
            }
        }
    }
}
```

In the JSON parser, unterminated strings caused `panic!("Unterminated string")`. Now they return `Err(ConfigError::UnterminatedString { line, col })` with the exact position where the string started. The error message will say "unterminated string starting at line 3, column 12" instead of just crashing.

### Reading Numbers

```rust
fn read_number(&mut self) -> Result<(TokenKind, usize, usize), ConfigError> {
    let start_line = self.line;
    let start_col = self.col;
    let mut s = String::new();
    let mut has_dot = false;

    if let Some(b'-') = self.current() {
        s.push('-');
        self.advance();
    }

    loop {
        match self.current() {
            Some(c @ b'0'..=b'9') => {
                s.push(c as char);
                self.advance();
            }
            Some(b'.') => {
                if has_dot {
                    return Err(ConfigError::InvalidNumber {
                        line: start_line,
                        col: start_col,
                        detail: "multiple decimal points".to_string(),
                    });
                }
                has_dot = true;
                s.push('.');
                self.advance();
            }
            _ => break,
        }
    }

    if has_dot {
        let value: f64 = match s.parse() {
            Ok(v) => v,
            Err(_) => {
                return Err(ConfigError::InvalidNumber {
                    line: start_line,
                    col: start_col,
                    detail: format!("cannot parse '{}' as float", s),
                });
            }
        };
        Ok((TokenKind::Float(value), start_line, start_col))
    } else {
        let value: i64 = match s.parse() {
            Ok(v) => v,
            Err(_) => {
                return Err(ConfigError::InvalidNumber {
                    line: start_line,
                    col: start_col,
                    detail: format!("cannot parse '{}' as integer", s),
                });
            }
        };
        Ok((TokenKind::Integer(value), start_line, start_col))
    }
}
```

Two important things here. First, multiple decimal points like `3.14.159` now return `Err(ConfigError::InvalidNumber { ... detail: "multiple decimal points" })` instead of panicking.

Second, the `.parse()` calls use `match` instead of `.unwrap()`. When you call `"abc".parse::<i64>()`, it returns `Result<i64, ParseIntError>`. We can't use `?` here because `ParseIntError` is not our `ConfigError` type. Instead, we `match` on the result and construct our own error with the position information. This is a common pattern: when a library returns an error type that doesn't match yours, you match on their result and create your own error.

## Step 3: The TomlValue Type

```rust
#[derive(Debug, Clone, PartialEq)]
enum TomlValue {
    String(String),
    Integer(i64),
    Float(f64),
    Boolean(bool),
    Table(Vec<(String, TomlValue)>),
}
```

This is similar to the `JsonValue` enum from the JSON parser, but simpler because TOML doesn't have arrays or null. The `Table` variant uses a `Vec<(String, TomlValue)>` just like the JSON parser's `Object`, each key-value pair is a tuple.

To display a `TomlValue`, we write a standalone function, just like we did for `JsonValue` in the previous article:

```rust
fn display(value: &TomlValue) -> String {
    match value {
        TomlValue::String(s) => format!("\"{}\"", s),
        TomlValue::Integer(n) => format!("{}", n),
        TomlValue::Float(n) => format!("{}", n),
        TomlValue::Boolean(b) => format!("{}", b),
        TomlValue::Table(pairs) => {
            let mut result = String::from("{");
            let mut first = true;
            for (k, v) in pairs {
                if !first {
                    result.push_str(", ");
                }
                result.push_str(&format!("{}: {}", k, display(v)));
                first = false;
            }
            result.push('}');
            result
        }
    }
}
```

This is exactly the same pattern we used for the JSON parser, a recursive function that pattern matches on each variant and builds a string.

## Step 4: The Parser

The parser takes a `Vec<SpannedToken>` and turns it into a `TomlValue`. It uses the same cursor pattern as the lexer, a current position that advances as tokens are consumed.

```rust
struct Parser {
    tokens: Vec<SpannedToken>,
    pos: usize,
}
```

### The Main Parse Method

The parser handles three kinds of top-level items:

1. **Comments and newlines** - skip them
2. **Table headers** like `[server]` - collect all following key-value pairs into a sub-table
3. **Key-value pairs** - parse key, equal sign, value

Every place the JSON parser had `panic!()`, we have `Err(ConfigError::...)`. Even better, every error includes the line and column from the token. When a key is followed by something other than `=`, the error says "expected = at line 5, column 12, found Integer" instead of crashing with no context.

The `?` operator is used throughout: `self.parse_value()?` propagates errors automatically. If `parse_value` fails, the error bubbles up through `parse` and up to the caller effortlessly.

### Parse Value

```rust
fn parse_value(&mut self) -> Result<TomlValue, ConfigError> {
    let token = self.current();
    match token {
        Some(t) => match &t.kind {
            TokenKind::StringLit(s) => {
                let val = TomlValue::String(s.clone());
                self.advance();
                Ok(val)
            }
            TokenKind::Integer(n) => {
                let val = TomlValue::Integer(*n);
                self.advance();
                Ok(val)
            }
            TokenKind::Float(n) => {
                let val = TomlValue::Float(*n);
                self.advance();
                Ok(val)
            }
            TokenKind::Boolean(b) => {
                let val = TomlValue::Boolean(*b);
                self.advance();
                Ok(val)
            }
            _ => Err(ConfigError::ExpectedToken {
                line: t.line,
                col: t.col,
                expected: "value (string, integer, float, or boolean)".to_string(),
                found: format!("{:?}", t.kind),
            }),
        },
        None => Err(ConfigError::ExpectedToken {
            line: 0,
            col: 0,
            expected: "value".to_string(),
            found: "end of input".to_string(),
        }),
    }
}
```

Clean and straightforward. If we have a token that's a valid value type, we return it. If not, we return a specific error saying what we expected and what we found instead.

## Step 5: The Schema

The schema defines what keys are expected in the config file, what types they should be, and whether they're required. The schema is itself a TOML file, parsed by our own parser.

```rust
enum FieldType {
    String,
    Integer,
    Float,
    Boolean,
}

struct FieldSchema {
    field_type: FieldType,
    required: bool,
    default: Option<TomlValue>,
    min: Option<i64>,
    max: Option<i64>,
}

impl FieldType {
    fn from_str(s: &str) -> Option<FieldType> {
        match s {
            "string" => Some(FieldType::String),
            "integer" => Some(FieldType::Integer),
            "float" => Some(FieldType::Float),
            "boolean" => Some(FieldType::Boolean),
            _ => None,
        }
    }

    fn name(&self) -> &'static str {
        match self {
            FieldType::String => "string",
            FieldType::Integer => "integer",
            FieldType::Float => "float",
            FieldType::Boolean => "boolean",
        }
    }
}

#[derive(Debug, Clone)]
struct FieldSchema {
    field_type: FieldType,
    required: bool,
    default: Option<TomlValue>,
    min: Option<i64>,
    max: Option<i64>,
}

type Schema = Vec<(String, FieldSchema)>;
```

`FieldType` - the expected type for a config key. 
`FieldSchema` - the full validation spec for a single key. 
`required` - if true, the key must be present (unless it has a default). 
`default` - a value to use if the key is missing. 
`min` and `max` - for integers, the valid range. 
`Schema` - a list of key names and their validation rules. 

`FieldType::from_str` converts a string like `"integer"` into a `FieldType` variant (or `None` if the string isn't a valid type name). `FieldType::name` converts a variant back into a string for error messages.

The schema TOML file looks like this:

```toml
[server.host]
type = "string"
required = true

[server.port]
type = "integer"
min = 1
max = 65535
required = true
```

When our parser processes this, `[server.host]` becomes a `TableHeader("server.host")`, and the key-value pairs inside it become entries in a sub-table. The `parse_schema` function walks this sub-table and extracts the validation rules:

```rust
fn parse_schema(value: &TomlValue) -> Result<Schema, ConfigError> {
    let mut schema = Vec::new();
    let table = match value {
        TomlValue::Table(pairs) => pairs,
        _ => {
            return Err(ConfigError::UnexpectedCharacter {
                line: 0,
                col: 0,
                expected: "table".to_string(),
                found: "non-table value".to_string(),
            });
        }
    };

    for (key, val) in table {
        let inner = match val {
            TomlValue::Table(pairs) => pairs,
            _ => continue,
        };

        let mut field_type = FieldType::String;
        let mut required = false;
        let mut default_val: Option<TomlValue> = None;
        let mut min_val: Option<i64> = None;
        let mut max_val: Option<i64> = None;

        for (field_name, field_val) in inner {
            match field_name.as_str() {
                "type" => {
                    let type_str = match field_val {
                        TomlValue::String(s) => s.clone(),
                        _ => String::new(),
                    };
                    let ft = FieldType::from_str(&type_str);
                    match ft {
                        Some(t) => field_type = t,
                        None => {
                            return Err(ConfigError::SchemaViolation {
                                line: 0,
                                key: key.clone(),
                                expected: "valid type (string, integer, float, boolean)".to_string(),
                                found: type_str,
                            });
                        }
                    }
                }
                "required" => {
                    required = match field_val {
                        TomlValue::Boolean(b) => *b,
                        _ => false,
                    };
                }
                "default" => {
                    default_val = Some(field_val.clone());
                }
                "min" => {
                    min_val = match field_val {
                        TomlValue::Integer(n) => Some(*n),
                        _ => None,
                    };
                }
                "max" => {
                    max_val = match field_val {
                        TomlValue::Integer(n) => Some(*n),
                        _ => None,
                    };
                }
                _ => {}
            }
        }

        schema.push((
            key.clone(),
            FieldSchema {
                field_type,
                required,
                default: default_val,
                min: min_val,
                max: max_val,
            },
        ));
    }

    Ok(schema)
}
```

This function takes the parsed schema `TomlValue` (which is a `Table` of sub-tables) and walks each entry. For each key like `server.port`, it reads the `type`, `required`, `default`, `min`, and `max` fields from the sub-table. If the `type` string isn't one of our known types, it returns a `SchemaViolation` error.

The `flatten_table` helper is also needed, it converts the nested `TomlValue::Table` into a flat list of dotted keys like `server.host`, `server.port`, etc.:

```rust
fn flatten_table(table: &TomlValue, prefix: &str) -> Vec<(String, TomlValue)> {
    let pairs = match table {
        TomlValue::Table(pairs) => pairs,
        _ => return vec![],
    };

    let mut result = Vec::new();
    for (key, value) in pairs {
        let full_key = if prefix.is_empty() {
            key.clone()
        } else {
            format!("{}.{}", prefix, key)
        };

        match value {
            TomlValue::Table(_) => {
                let nested = flatten_table(value, &full_key);
                for item in nested {
                    result.push(item);
                }
            }
            _ => {
                result.push((full_key, value.clone()));
            }
        }
    }
    result
}
```

And a small `toml_type_name` helper that maps a `TomlValue` variant to a human-readable type name, used in schema violation error messages:

```rust
fn toml_type_name(value: &TomlValue) -> &'static str {
    match value {
        TomlValue::String(_) => "string",
        TomlValue::Integer(_) => "integer",
        TomlValue::Float(_) => "float",
        TomlValue::Boolean(_) => "boolean",
        TomlValue::Table(_) => "table",
    }
}
```

## Step 6: Schema Validation

The `validate` function takes a parsed config, a schema, and the original source text. It checks every key in the config against the schema and collects all errors.

```rust
fn validate(config: &TomlValue, schema: &Schema, source: &str) -> Result<(), Vec<ConfigError>> {
    let mut errors = Vec::new();
    let flat_config = flatten_table(config, "");

    for (key, field) in schema {
        let mut found_value: Option<&TomlValue> = None;
        for (k, v) in &flat_config {
            if k == key {
                found_value = Some(v);
                break;
            }
        }

        match found_value {
            None => {
                if field.required {
                    match &field.default {
                        Some(_) => {}
                        None => {
                            errors.push(ConfigError::MissingRequiredKey { key: key.clone() });
                        }
                    }
                }
            }
            Some(value) => {
                let type_matches = match (&field.field_type, value) {
                    (FieldType::String, TomlValue::String(_)) => true,
                    (FieldType::Integer, TomlValue::Integer(_)) => true,
                    (FieldType::Float, TomlValue::Float(_)) => true,
                    (FieldType::Float, TomlValue::Integer(_)) => true,
                    (FieldType::Boolean, TomlValue::Boolean(_)) => true,
                    _ => false,
                };

                if !type_matches {
                    let line = find_line_for_key(source, key);
                    errors.push(ConfigError::SchemaViolation {
                        line,
                        key: key.clone(),
                        expected: field.field_type.name().to_string(),
                        found: toml_type_name(value).to_string(),
                    });
                }

                if let (TomlValue::Integer(n), Some(min)) = (value, field.min) {
                    if *n < min {
                        errors.push(ConfigError::ValueOutOfRange {
                            key: key.clone(),
                            value: n.to_string(),
                            min,
                            max: field.max.unwrap_or(0),
                        });
                    }
                }

                if let (TomlValue::Integer(n), Some(max)) = (value, field.max) {
                    if *n > max {
                        errors.push(ConfigError::ValueOutOfRange {
                            key: key.clone(),
                            value: n.to_string(),
                            min: field.min.unwrap_or(0),
                            max,
                        });
                    }
                }
            }
        }
    }

    for (key, _) in &flat_config {
        let mut is_known = false;
        for (k, _) in schema {
            if k == key {
                is_known = true;
                break;
            }
        }
        if !is_known {
            let line = find_line_for_key(source, key);
            errors.push(ConfigError::UnknownKey {
                key: key.clone(),
                line,
            });
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors)
    }
}
```

`validate` returns `Result<(), Vec<ConfigError>>`, not `Result<(), ConfigError>`. It collects **all** errors, not just the first one. This is important for a config validator — you want to see everything that's wrong, not fix one error, re-run, fix another, re-run, etc.

The `flatten_table` helper converts the nested `TomlValue::Table` into a flat list of dotted keys like `server.host`, `server.port`, etc. This makes it easy to match against the schema keys.

The `find_line_for_key` helper searches the original TOML source text for a key and returns its line number. It strips the section prefix from dotted keys (turning `server.host` into just `host`) and scans for lines matching `key =`:

```rust
fn find_line_for_key(source: &str, target_key: &str) -> usize {
    let short_key = if target_key.contains('.') {
        let mut parts = target_key.rsplit('.');
        match parts.next() {
            Some(k) => k,
            None => target_key,
        }
    } else {
        target_key
    };

    for (i, line) in source.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.starts_with('#') || trimmed.starts_with('[') || trimmed.is_empty() {
            continue;
        }
        if let Some(eq_pos) = trimmed.find('=') {
            let key_part = trimmed[..eq_pos].trim();
            if key_part == short_key {
                return i + 1;
            }
        }
    }
    0
}
```

It skips comments, section headers, and empty lines, then looks for lines where the part before `=` matches the key. If it can't find the key, it returns `0` (which `format_error` treats as "no line information available").

## Step 7: Displaying Errors

```rust
fn format_error(err: &ConfigError, source: &str) -> String {
    let line_num = match err {
        ConfigError::UnexpectedCharacter { line, .. } => *line,
        ConfigError::UnterminatedString { line, .. } => *line,
        ConfigError::InvalidNumber { line, .. } => *line,
        ConfigError::ExpectedToken { line, .. } => *line,
        ConfigError::MissingValue { line, .. } => *line,
        ConfigError::SchemaViolation { line, .. } => *line,
        ConfigError::UnknownKey { line, .. } => *line,
        _ => 0,
    };

    if line_num == 0 {
        return format!("Error: {}", err);
    }

    let lines: Vec<&str> = source.lines().collect();
    let line_content = match lines.get(line_num - 1) {
        Some(l) => *l,
        None => "",
    };

    format!(
        "Error: {}\n   |\n{:>2} | {}\n   |",
        err,
        line_num,
        line_content
    )
}
```

This function takes an error and the original source text, finds the offending line, and formats it like:

```
Error: schema violation at line 3: key 'server.host' expected type string, found integer
   |
 3 | host = 1234
   |
```

The `match err { ... }` extracts the line number from whichever error variant it is. All the variants that carry a `line` field get their line number extracted. Variants like `MissingRequiredKey` that don't have a specific line get `0`, in which case we just print the error message without a source line.

## Step 8: Main Function and Demo

```rust
fn run(config_path: &str, schema_path: &str) -> Result<(), Vec<ConfigError>> {
    let config_source = match fs::read_to_string(config_path) {
        Ok(s) => s,
        Err(e) => return Err(vec![ConfigError::from(e)]),
    };
    let schema_source = match fs::read_to_string(schema_path) {
        Ok(s) => s,
        Err(e) => return Err(vec![ConfigError::from(e)]),
    };

    let mut config_lexer = Lexer::new(&config_source);
    let config_tokens = match config_lexer.tokenize() {
        Ok(tokens) => tokens,
        Err(e) => return Err(vec![e]),
    };
    let mut config_parser = Parser::new(config_tokens);
    let config_value = match config_parser.parse() {
        Ok(v) => v,
        Err(e) => return Err(vec![e]),
    };

    let mut schema_lexer = Lexer::new(&schema_source);
    let schema_tokens = match schema_lexer.tokenize() {
        Ok(tokens) => tokens,
        Err(e) => return Err(vec![e]),
    };
    let mut schema_parser = Parser::new(schema_tokens);
    let schema_value = match schema_parser.parse() {
        Ok(v) => v,
        Err(e) => return Err(vec![e]),
    };

    let schema = match parse_schema(&schema_value) {
        Ok(s) => s,
        Err(e) => return Err(vec![e]),
    };

    validate(&config_value, &schema, &config_source)?;

    println!("Config is valid!");
    println!();
    println!("Parsed config:");
    for (key, value) in flatten_table(&config_value, "") {
        println!("  {} = {}", key, display(&value));
    }

    Ok(())
}
```

This is the beauty of proper error handling. Look at `run()`: it's a pipeline of operations, each of which can fail. Each `match` on a `Result` handles the error case explicitly. For cases where we want to convert a single error into a `Vec` of errors, we wrap it with `vec![e]`.

Notice we use `match` here instead of `?`. That's because `run` returns `Result<(), Vec<ConfigError>>`, but most of the inner calls return `Result<_, ConfigError>` (a single error, not a Vec). The `?` operator only works when the error types match, so we explicitly match and wrap single errors into a Vec where needed.

The `ConfigError::from(e)` on the `fs::read_to_string` error lines works because we defined `Io(#[from] std::io::Error)` in our error enum. The `#[from]` attribute generated a `From<std::io::Error> for ConfigError` implementation, so `ConfigError::from(e)` converts an `io::Error` into our `ConfigError::Io` variant.

The `main` function reads the file paths from command-line arguments (or defaults to the example files), calls `run`, and handles any errors:

```rust
fn main() {
    let args: Vec<String> = std::env::args().collect();

    let (config_path, schema_path) = if args.len() >= 3 {
        (args[1].clone(), args[2].clone())
    } else {
        (String::from("examples/valid_config.toml"), String::from("examples/schema.toml"))
    };

    match run(&config_path, &schema_path) {
        Ok(()) => {}
        Err(errors) => {
            let source = match fs::read_to_string(&config_path) {
                Ok(s) => s,
                Err(_) => String::new(),
            };
            for err in &errors {
                eprintln!("{}", format_error(err, &source));
                eprintln!();
            }
            std::process::exit(1);
        }
    }
}
```

If `run` returns `Ok(())`, we're done. If it returns `Err(errors)`, we load the source text (so we can point to specific lines), format each error with `format_error`, print them to stderr, and exit with code 1.

### Running with a Valid Config

Create `examples/valid_config.toml`:

```toml
# Server configuration
[server]
host = "localhost"
port = 8080
debug = true

[database]
url = "postgres://localhost/mydb"
max_connections = 10
```

Run it:

```
cargo run -- examples/valid_config.toml examples/schema.toml
```

Output:

```bash
Config is valid!

Parsed config:
  server.host = "localhost"
  server.port = 8080
  server.debug = true
  database.url = "postgres://localhost/mydb"
  database.max_connections = 10
```

### Running with an Invalid Config

Create `examples/invalid_config.toml`:

```toml
# Config with multiple errors
[server]
host = 1234
port = 99999
debug = "yes"

[database]
url = "postgres://localhost/mydb"
max_connections = 200
```

Run it:

```
cargo run -- examples/invalid_config.toml examples/schema.toml
```

Output:

```
Error: schema violation at line 3: key 'server.host' expected type string, found integer
   |
 3 | host = 1234
   |

Error: key 'server.port' has value 99999 which is outside range 1 to 65535

Error: schema violation at line 5: key 'server.debug' expected type boolean, found string
   |
 5 | debug = "yes"
   |

Error: key 'database.max_connections' has value 200 which is outside range 1 to 100
```

All four errors are reported at once. No panicking, no crashing, no vague messages. Every error tells you exactly what's wrong and where.

## Conclusion

In this post, we replaced every `panic!` and `unwrap` with proper `Result` based error handling. We defined a custom `ConfigError` enum with rich error variants carrying line numbers and context. We used `thiserror` to avoid writing boilerplate code. We used the `?` operator to propagate errors effortlessly. And we built a validator that collects **all** errors and displays them with source lines, not just the first one.


In the next article, we'll learn about generics, traits, and lifetimes and build a **Generic LRU Cache**. See you soon.
