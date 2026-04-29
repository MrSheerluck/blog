+++
title = "Build a JSON Parser in Rust from Scratch"
description = "Build a JSON Parser in Rust from Scratch Learn structs, enums, and pattern matching by tokenizing and parsing JSON into a recursive data structure"
date = 2026-04-29
transparent = true

[taxonomies]
tags = ["rust", "project", "parser"]
series = ["learning-rust"]
+++


In this post, we are going to learn about structs, enums and pattern matching in Rust. Once we cover all these concepts, we will build a **JSON Parser in Rust from scratch**. I'm really excited about this project. Let's start.

Get the source code from [here](https://github.com/MrSheerluck/json-parser-in-rust)

## Structs in Rust
### What a Struct Is?
A struct is a way to define a new type of grouping related pieces of data together under a single name. Each piece of data inside a struct is called a **field**, and every field has a name and a type.

Let's say you are building a product and you want to keep track of all the data for a user like name, age, etc. This is where you can use a struct to group together all the related data for a **User** type. Don't worry if you don't understand this, once we start working on the project this will be clear.

### Defining a Struct in Rust
```rust
struct User {
	name: String,
	age: u32,
	active: bool,
}
```
This defines a new type called `User`. It has three fields. The definition itself doesn't create any data, its just a definition or schema of the type like what kind  of data this struct can hold. No memory is allocated at this point.

There are some rules to define a struct:
- The struct name uses `PascalCase` by convention
- Each field is `name: Type`
- Fields are separated by commas
- A trailing comma after the last field is allowed and idiomatic in Rust

### Creating an Instance of a Struct in Rust
To actually create a value of type `User`, you create an instance:
```rust
let user = User{
	name: String::from("alice"),
	age: 30,
	active: true,
};
```
This is called a **struct literal**. You provide values for every field by name. The order you write the fields doesn't matter, Rust matches them by bame and not by position. But remember that you must provide all the fields. If you skip any field then it'll show a compile error.

### Accessing Fields
You access fields with dot notation:
```rust
println!("{}", user.name); // alice
println!("{}", user.age); // 30
println!("{}", user.active); // true
```

### Mutability
Rust's mutability applies to the entire struct instance. You can't make just once field mutable. If you want to modify any field, the whole binding must be `mut`:
```rust
let mut user = User{
	name: String::from("alice"),
	age: 30,
	active: true,
};

user.age = 31; // this is fine as user is a mutable struct
user.active = false // this is fine too for the same reason
```
If `user` is not `mut`, no field can be modified. Let's not go to why this is the case, I might explain it at some point later in this series.

### Field Shorthand
When you're creating a struct instance and you have a local variable with the same name as a field, you don't need to repeat yourself:
```rust
fn build_user(name: String, age: u32) -> {
	User {
		name, // shorthand for name: name
		age, // shorthand for age: age
		active: true,
	}
}
```
This only works when the variable name and the field name are identical.

### Struct Update Syntax
If you want to create a new instance of a struct that's mostly same to an existing one, but with some fields changed, you can use struct update syntax:
```rust
let user2 = User {
	age: 25,
	...user
};
```
The `...user` part means "fill in all remaining fields from `user`". Fields you specify explicitly take precedence. Fields not mentioned are copied or moved from `user`. 

> There's an important ownership nuance here: if any field being moved out of user is a non-Copy type (like `String`), then `user` is partially moved and you can no longer use it as a whole after this. You can still use fields that were not moved (like `age` and `active`, which are Copy types), but `user.name` would be moved into `user2.name`.

### `impl` Blocks (Giving a Struct Behaviour)
A struct definition only describes data but to give a struct behaviour that means functions that operate on that data, you write an `impl` block:
```rust
impl User {
	// methods and assocuated functions go here
}
```
`impl` stands for "implementation". Everything inside an `impl User` block belongs to the `User` type. You can have multiple `impl` blocks for the same type and Rust will them as one, though conventionally you group everything into one block.

### Methods (Functions with `self`)
A `method` is a function defined inside an `impl` block that takes `self` as its first parameter. `self` refers to the specific instance the method is being called on. There are three forms of `self` and each of them has a distinct meaning:

#### `&self` Immutable Borrow of an Instance
```rust
impl User {
	fn greeting(&self) -> String {
		format!("Hello, my name is {} and I am {} years old", self.name, self.age)
	}
}
```
`&self` is shorthand for `self: &User`. The method borrows the instance immutably. It can read fields but cannot modify them. The caller retains the ownership of the instance after the call.
```rust
let user = User{
	name: String::from("alice"),
	age: 30,
	active: true,
};

println!("{}", user.greeting()); // Hello, my name is alice and I am 30 year old
// user is still valid here
```
This is by far the most common form. Use it whenever a method only needs to read data.

#### `&mut self` Mutable Borrow of an Instance
```rust
impl User {
	fn deactivate(&mut self) {
		self.active = false;
	}
	fn have_birthday(&mut self) {
		self.age += 1;
	}
}
```
`&mut self` is shorthand for `self: &mut User`. The method borrows the instance mutably. It can read and modify fields. The caller must have a `mut` binding and the normal borrow rules apply (no other borrows of the instance can exist while this method runs).
```rust
let mut user = User{
	name: String::from("alice"),
	age: 30,
	active: true,
};

user.have_birthday();
println!("{}", user.age); // 31

user.decativate();
println!("{}", user.active); // false
```

#### `self` Taking Ownership of the Instance
```rust
impl User {
	fn into_name(self) -> String {
		self.name // self is consumed, we return just the name
	}
}
```
`self` (no reference) means the method takes the ownership of the instance. After calling it, the original binding is gone, it is moved into the method.
```rust
let user = User {
	name: String::from("alice"),
	age: 30,
	active: true,
};

let name = user.into_name();
// user is no longer valid here, it was moved to that method
println!("{}", name); // alice
```
This is used when a method is meant to consume the instance and produce something else from it may be a transformation or conversion. It's less common than the borrow forms.

### Associated Functions
An associated function is defined inside an `impl` block but does not take self in any form. It belongs to the type, not to any specific instance.
```rust
impl User {
	fn new(name: String, age: u32) -> User {
		User {
			name,
			age,
			active: true,
		}
	}
}
```
You call it with `::` syntax on the type name, not on an instance:
```rust
let user = User::new(String::from("alice"), 30);
```
This is the conventional way to write constructors in Rust. Rust has no special constructor syntax. `new` is just a naming convention for an associated function that produces an instance. You can name it anything.

Another common pattern: associated functions that act as alternative constructors with specific defaults or validation logic:
```rust
impl User {
	fn guest() -> {
		User {
			name: String::from("guest"),
			age: 0,
			active: false,
		}
	}
}

let g = User::guest();
```

## Enums in Rust
### What an Enum Is?
An enum (short for enumeration) is a type that defines a fixed set of possible variants. A value of an enum type is exactly one of those variants at any given time.
You've already used enums without thinking about it. `Option<T>` and `Result<T, E>` are both enums defined in Rust's standard library. But before we get to the advanced forms, we need to build up from the ground up.

### Basic enums
The simplest form of an enum is a set of named variants that carry no data:
```rust
enum Direction {
	North,
	South,
	East,
	West,
}
```
This defines a new type called `Direction`. A value of type `Direction` is one of exactly those four things. You create a value using `::` syntax:
```rust
let d = Direction::North;
```
Each variant is namespaced under the enum name. You can't just write `North`, you need to write it like `Direction::North`. This prevents name collisions and makes code immediately readable.

At the memory level, a basic enum with no data is stored as an integer. Rust chooses the smallest integer type that fits all variants. With four variants, it fits in a `u8`.

### Data Carrying Variants
This is where Rust enums become genuinely powerful and unlike enums in most other languages. Each variant of an enum can carry its own data, and each variant can carry different data with a different shape:
```rust
enum Shape {
	Circle(f64),
	Rectangle(f64, f64),
	Triangle(f64, f64, f64),
}
```
`Circle` carries one `f64` (the radius). `Rectangle` carries two `f64`s (width and height). `Triangle` carries three `f64`s (the three sides). These are called **tuple variants** because the data is positional just like a tuple.

You can create them like this:
```rust
let c = Shape::Circle(5.0);
let r = Shape::Rectangle(4.0, 6.0);
let t = Shape::Triangle(3.0, 4.0, 5.0);
```
Variants can also carry named fields, like a struct:
```rust
enum Shape {
	Circle{ radius: f64 },
	Rectangle{ width: 64, height: f64 },
	Triangle{ a: f64, b: f64, c:f64 },
}

let r = Shape::Rectangle{ width: 4.0, height: 6.0 };
```
These are called **struct variants**. Named fields are more verbose but more readable, especially when a variant carries several values that could be confused with each other.

### What an Enum Value Actually Looks Like in Memory
This is important to understand. An enum value in memory is laid out as a **tagged union**. It consists of:
1. A **tag** (the discriminant) - an integer identifying which variant this value is
2. **Space for the largest variant's data** - all variants share the same memory region, sized to fit whichever variant is biggest
So if you have:
```rust
enum Message {
	Quit,
	Move { x: i32, y: i32 },
	Write(String),
	Color(u8, u8, u8),
}
```
The size of `Message` value in memory is the size of the largest variant (`Write(String)`) is the biggest here since `String` is 24 bytes on 64-bit machines plus the tag. Every `Message` value occupies the same amount of space, regardless of which variant it actually is. If it's `Quit`, most of those bytes are unused but they are still there, reserved.

### Enums with Mixed Variant Shapes
Nothing forces all variants to have the same kind of data, you can feely mix:
```rust
enum Event {
	KeyPress(char),
	MouseClick{ x: u32, y: u32 },
	Resize(u32, u32),
	Quit,
}
```

`KeyPress` is a tuple variant with one value. `MouseClick` is a struct variant with named fields. `Resize` is a tuple variant with two values. `Quit` has no data. This is completely valid.

### Enums in `impl` Blocks
Just like structs, enums can have `impl` blocks with methods:
```rust
enum Direction {
    North,
    South,
    East,
    West,
}

impl Direction {
    fn opposite(&self) -> Direction {
        match self {
            Direction::North => Direction::South,
            Direction::South => Direction::North,
            Direction::East => Direction::West,
            Direction::West => Direction::East,
        }
    }

    fn is_vertical(&self) -> bool {
        match self {
            Direction::North | Direction::South => true,
            Direction::East | Direction::West => false,
        }
    }
}
```
The `match` expression here is the primary tool for working with enum values. We'll cover it in depth in the next section, but notice already: you can't access the "contents" of an enum variant without pattern matching. There are no fields you can dot into directly. The match forces you to say "if it's this variant, do this; if it's that variant, do that."

### Recursive Enums and `Box<T>`
Here's where enums become essential for building data structures like parsers, ASTs and trees.
Suppose you want to define a type that represents a simple expression like a number, or an addition of two expressions:
```rust
enum Expr {
	Number(f64),
	Add(Expr, Expr), // ERROR: recursive type has infinite size
}
```
This won't compile because the compiler needs to know the size of `Expr` at compile time. But `Expr::Add` contains two `Expr` values, each of which might be `Add` themselves which contain more `Expr` values. The could go on till infinity.

The fix is `Box<T>`. A `Box<T>` is a heap allocated values basically its a pointer and a pointer always has a fixed, known size (8 bytes on 64-bit).So instead of storing the `Expr` directly inside `Add`, you store a pointer to it on the heap:
```rust
enum Expr {
	Number(f64),
	Add(Box<Expr>, Box<Expr>),
}
```
Now the compiler knows the size of `Expr`: its the size of the largest variant. `Number(f64)` is 8 bytes and `Add(Box<Expr>, Box<Expr>)` is two pointers, so 16 bytes. The size is fixed and finite even though the actual tree in memory can be arbitrarily deep.

Creating a recursive value with `Box`:
```rust
let expr = Expr::Add(
	Box::new(Expr::Number(1.0)),
	Box::new(Expr::Add(
		Box::new(Expr::Number(2.0)),
		Box::new(Expr::Number(3.0)),
	)),
);
```
This represents `1 + (2 + 3)`. The outer `Add` holds two boxed `Expr` values on the heap. The inner `Add` is also heap-allocated. The leaves (`Number`) hold their data directly.

## Pattern Matching
Pattern matching is a mechanism for simultaneously inspecting the structure of a value and binding names to the parts inside it. A switch statement checks a condition and jumps to a branch. Pattern matching does that plus it destructures the value, extracts its internals, binds those internals to names you can use and the compiler verifies that every possible case is handled.

### The `match` Expression
```rust
match some_value {
	pattern1 => expression1,
	pattern2 => expression2,
	pattern3 => expression3,
}
```
`match` takes a value and compares it against a series of **arms**. Each arm has a pattern on the left of `=>` and an expression on the right. Rust tries each pattern from top to bottom and executes the first one that matches. The entire `match` is an expression that means it produces a value and all arms must produce the same type of value.

The simplest possible match is on a plain value:
```rust
let x:i32 = 3;

let description = match x {
	1 => "one",
	2 => "two",
	3 => "three",
	_ => "something else",
};

println!("{}", description); // three
```
`_` is the wildcard. It matches anything and binds nothing. Every `match` on a type with more possibilities than your explicit arms must include a catch-all or the compiler will complain.

### Matching on Enum Variants With Data
When a variant carries data, the pattern names bindings to extract that data:
```rust
enum Shape {
	Circle(f64),
	Rectangle(f64, f64),
}

let s = Shape::Rectangle(4.0, 6.0);

match s {
	Shape::Circle(radius) => {
		println!("Circle with radius {}", radius);
	}
	Shape::Rectangle(width, height) => {
		println!("Rectangle {}x{}", width, height);
	}
}
```
`Shape::Circle(radius)` is a pattern that matches any `Circle` variant and binds the inner `f64` to the name `radius`. Inside the arm, `radius` is a local variable holding that value. Same for width and height in the rectangle arm.

For struct variants with named fields:
```rust
enum Shape {
    Circle { radius: f64 },
    Rectangle { width: f64, height: f64 },
}

let s = Shape::Circle { radius: 5.0 };

match s {
    Shape::Circle { radius } => println!("Circle, radius = {}", radius),
    Shape::Rectangle { width, height } => println!("{}x{}", width, height),
}
```

The pattern `Shape::Circle { radius }` matches any `Circle` variant and binds the `radius` field to a local variable also called `radius`. If you want to rename it, you write `Shape::Circle { radius: r }`

### How ownership works in match
This is subtle and important. When you match on a value, what happens to ownership depends on whether you match by value or by reference.

#### Matching by value
```rust
let s = Shape::Circle(5.0);

match s {
    Shape::Circle(r) => println!("{}", r),
    Shape::Rectangle(w, h) => println!("{} {}", w, h),
}
// s is moved — no longer usable
```
The entire value `s` is moved into the match. The matched arm receives ownership of the extracted data.

#### Matching by reference
```rust
let s = Shape::Circle(5.0);

match &s {
    Shape::Circle(r) => println!("{}", r),
    Shape::Rectangle(w, h) => println!("{} {}", w, h),
}
// s is still valid here
```
When you match on `&s`, the patterns automatically match against references. The bindings `r`, `w`, `h` become references to the data inside the variant (`&f64` in this case)

In practice, when you have a method taking `&self`, you match on `self` (which is already `&Shape` inside the method), and your bindings are references. If you're in a context where you own the value and want to consume it, you match on the value directly.

### Binding with `@`
Sometimes you want to test whether a value matches a pattern and also give that value a name to use in the arm. The `@` operator does this:
```rust
let n: u32 = 7;

match n {
    small @ 1..=5 => println!("{} is small", small),
    medium @ 6..=10 => println!("{} is medium", medium),
    large => println!("{} is large", large),
}
```
`medium @ 6..=10` means: match any value in the range 6 to 10, and bind that value to the name `medium`. Without `@`, a range pattern matches but gives you no name for the value. With `@`, you get both the test and the binding.

### Range Patterns
Numeric and character types support range patterns:
```rust
let grade: u32 = 85;

let letter = match grade {
    90..=100 => "A",
    80..=89  => "B",
    70..=79  => "C",
    60..=69  => "D",
    _        => "F",
};
```
`90..=100` is an **inclusive range pattern**,  it matches any value from 90 through 100 inclusive. The `..=` syntax is required for patterns (exclusive ranges with `..` are not allowed in match patterns because the compiler can't always verify exhaustiveness with them).

### Multiple Patterns with `|`
A single arm can match multiple patterns using `|`:
```rust
let x: i32 = 3;

match x {
    1 | 2 => println!("one or two"),
    3 | 4 => println!("three or four"),
    _     => println!("something else"),
}
```
This is OR, the arm firsts if the value matches any of the listed patterns. You can combine this with ranges:
```rust
match x {
    1 | 2 | 3..=5 => println!("between 1 and 5"),
    _ => println!("out of range"),
}
```

### Match Guards
A **match guard** is an additional `if` condition attached to an arm. The arm only fires if both the pattern matches and the guard is true:
```rust
let pair = (2, -3);

match pair {
    (x, y) if x == y        => println!("equal"),
    (x, y) if x + y == 0    => println!("sum is zero"),
    (x, _) if x > 0         => println!("x is positive"),
    _                        => println!("anything else"),
}
// prints: sum is zero
```
The guard `if x + y == 0` has access to the bindings created by the pattern. Bindings are established first, then the guard is evaluated. If the guard fails, Rust moves on to the next arm

> One important caveat: **the compiler does not consider guards when checking exhaustiveness**. Guards are runtime conditions, and the compiler can't reason about their runtime truth. So even if your guards collectively cover all cases, the compiler will still require a wildcard arm if the patterns themselves don't cover all cases.

### Wildcard Patterns in Depth
`_` is not just a catch-all for the whole value. It can appear inside patterns to ignore specific parts:
```rust
let triple = (1, -2, 3);

match triple {
    (0, _, _) => println!("starts with zero"),
    (x, 0, _) => println!("middle is zero, first is {}", x),
    (x, y, _) => println!("first two: {} and {}", x, y),
}
```
The `_` in position means "match anything here, but don't bind it to a name". This is different from a named binding, which would move or copy the value. `_` explicitly discards it. If you are coming from languages like go or python, this should be familiar.

You can also use `..` to ignore multiple fields at once in a struct pattern:
```rust
struct Point {
    x: i32,
    y: i32,
    z: i32,
}

let p = Point { x: 1, y: 2, z: 3 };

match p {
    Point { x, .. } => println!("x is {}", x),
}
```
`..` means "ignore all remaining fields". This is especially useful for structs with many fields when you only care about one or two.

### Matching on Structs Directly
You don't have to put a struct inside an enum to match on it. Structs support pattern matching directly in a `match` or a `let` binding:
```rust
struct Point {
    x: i32,
    y: i32,
}

let p = Point { x: 3, y: 7 };

match p {
    Point { x: 0, y } => println!("on y-axis at {}", y),
    Point { x, y: 0 } => println!("on x-axis at {}", x),
    Point { x, y }    => println!("at ({}, {})", x, y),
}
```
`Point { x: 0, y }` matches only when `x` is exactly `0`, and binds whatever `y` is to the name `y`. `Point { x, y }` matches any `Point` and binds both fields.


## `if let` And `while let`
`match` is exhaustive by design, it forces you to handle every variant. That's exactly what you want most of the time. But sometimes you only care about one specific variant and want to do nothing for all other cases. Writing a full `match` for that feels like unnecessary:
```rust
enum Message {
    Quit,
    Write(String),
    Move { x: i32, y: i32 },
}

let msg = Message::Write(String::from("hello"));

match msg {
    Message::Write(text) => println!("{}", text),
    _ => (), // do nothing — feels like noise
}
```
The `_ => ()` arm is doing nothing meaningful. It's just there to satisfy exhaustiveness. `if let` exists precisely for this situation.

### `if let`
`if let` combines a pattern match with a conditional. It executes the body only if the pattern matches, and does nothing otherwise:
```rust
let msg = Message::Write(String::from("hello"));

if let Message::Write(text) = msg {
    println!("{}", text);
}
```
Read this as: "if `msg` matches the pattern `Message::Write(text)`, bind the inner value to `text` and execute the block." If `msg` is `Message::Quit` or `Message::Move { .. }`, the block is skipped entirely

The binding `text` only exists inside the `if let` block. Outside it, `text` doesn't exist.

### `if let` with an `else` branch
You can attach an `else` to handle the non-matching case:
```rust
let msg = Message::Quit;

if let Message::Write(text) = msg {
    println!("Message: {}", text);
} else {
    println!("Not a write message");
}
```

And you can chain `else if let` to check multiple patterns sequentially:
```rust
let msg = Message::Move { x: 3, y: 7 };

if let Message::Write(text) = msg {
    println!("Write: {}", text);
} else if let Message::Move { x, y } = msg {
    println!("Move to ({}, {})", x, y);
} else {
    println!("Something else");
}
```
This is a chain of independent pattern tests, tried in order. Unlike `match`, this does not have exhaustiveness checking. Use `match` when you need exhaustiveness, use `if let` when you genuinely only care about one case.

### Ownership in `if let`
The same ownership rules that apply to `match` apply here. If you write:
```rust
let msg = Message::Write(String::from("hello"));

if let Message::Write(text) = msg {
    println!("{}", text);
}
// msg is moved — no longer usable
```
`msg` is moved into the pattern. To avoid moving, match on a reference:
```rust
let msg = Message::Write(String::from("hello"));

if let Message::Write(text) = &msg {
    println!("{}", text); // text is &String
}
// msg is still valid
```
Same thing as `match`

### `while let`
`while let` runs a loop for as long as a pattern keeps matching. The moment the pattern stops matching, the loop exits:
```rust
let mut stack = vec![1, 2, 3];

while let Some(top) = stack.pop() {
    println!("{}", top);
}
```
`Vec::pop()` returns `Option<T>`.  `Some(value)` if the vector has elements, `None` when it's empty. The `while let` keeps looping and binding `top` to each popped value as long as `pop()` returns `Some`. The instant it returns `None`, the pattern doesn't match and the loop exits.

Without `while let`, you'd write this as:
```rust
loop {
    match stack.pop() {
        Some(top) => println!("{}", top),
        None => break,
    }
}
```
`while let` is just cleaner syntax for this exact pattern

### What `if let` and `while let` actually are
They are not new features with new rules. They are shorthand for specific shapes of `match` that are common enough to deserve their own syntax. The compiler desugars them into `match` expressions before doing anything else.

`if let` = `match` with one meaningful arm and `_ => ()` for everything else, plus an optional `else`.

`while let` = `loop` containing a `match` that breaks on the non-matching case.

### Guards in `if let`
You can attach a guard to `if let` the same way as in `match`:
```rust
let number = Some(7);

if let Some(n) = number && n > 5 {
    println!("{} is greater than 5", n);
}
```
This syntax (using `&&` directly after the pattern) is available in Rust 1.65+

## Destructuring in `let` Bindings and `for` Loops
Destructuring is using a pattern on the left side of a `let` binding or in a `for` loop to simultaneously unpack a value and bind its parts to names. 

### Destructuring tuples in `let`
The simplest case is a tuple:
```rust
let (x, y, z) = (1, 2, 3);

println!("{} {} {}", x, y, z); // 1 2 3
```
The left side `(x, y, z)` is a pattern. Rust matches the right side `(1, 2, 3)` against it, binding `1` to `x`, `2` to `y`, `3` to `z`. All three bindings are created simultaneously in a single statement.

You can ignore parts with `_`:
```rust
let (first, _, third) = (10, 20, 30);

println!("{} {}", first, third); // 10 30
```

Or ignore a trailing portion with `..`:
```rust
let (head, ..) = (1, 2, 3, 4, 5);

println!("{}", head); // 1
```

### Destructuring Structs in `let`
Struct patterns work directly in `let` bindings too:
```rust
struct Point {
    x: i32,
    y: i32,
}

let p = Point { x: 10, y: 20 };
let Point { x, y } = p;

println!("{} {}", x, y); // 10 20
```
`let Point { x, y } = p` destructures `p` into two bindings `x` and `y`. After this, `p` is moved (since `Point` doesn't implement `Copy`), and `x` and `y` are the extracted values

To rename while destructuring:
```rust
let Point { x: horizontal, y: vertical } = p;

println!("{} {}", horizontal, vertical); // 10 20
```
The field `x` is bound to the local name `horizontal`. The field `y` is bound to `vertical`. The struct field name is on the left of `:`, the local binding name is on the right.

To avoid moving, destructure from a reference:
```rust
let p = Point { x: 10, y: 20 };
let Point { x, y } = &p;

// x and y are &i32 here
println!("{} {}", x, y);
// p is still valid
```

### Destructuring Enums in `let`
You can destructure an enum variant directly in a `let` binding, but only if you're certain which variant it is because `let` patterns are **irrefutable**. An irrefutable pattern is one that is guaranteed to match for any possible value of the type.

A tuple `(x, y)` is irrefutable for any tuple with two elements, it always matches. A struct pattern `Point { x, y }` is irrefutable for a `Point`, it always matches. But `Some(x)` is refutable for `Option<T>`, it doesn't match `None`.

If you try:
```rust
let Some(value) = some_option; // ERROR: refutable pattern
```
The compiler rejects this. It can't guarantee the pattern matches. For refutable patterns, you must use `match` or `if let`.

This restriction exists because a failing `let` binding has nowhere to go, there's no else branch, no other arm. The compiler catches this at compile time rather than letting it panic at runtime.

### Destructuring in `for` loops
A `for` loop iterates over a sequence and binds each element to a pattern. Most of the time people write:
```rust
for item in collection {
    // use item
}
```
But `item` is actually a pattern, not just a name. You can put any irrefutable pattern there:
```rust
let pairs = vec![(1, 'a'), (2, 'b'), (3, 'c')];

for (number, letter) in pairs {
    println!("{}: {}", number, letter);
}
```
Each element of `pairs` is a tuple `(i32, char)`. The pattern `(number, letter)` destructures each tuple on the spot, giving you both values named and ready to use inside the loop body. Without destructuring, you'd need to write `pair.0` and `pair.1`, which is less clear.

Destructuring structs in `for` loops works the same way:
```rust
struct Point {
    x: i32,
    y: i32,
}

let points = vec![
    Point { x: 1, y: 2 },
    Point { x: 3, y: 4 },
];

for Point { x, y } in &points {
    println!("({}, {})", x, y);
}
```

> Note `&points` iterating over a reference to the vector gives you references to each element, so `x` and `y` are `&i32`. The vector remains valid after the loop.

### Nested Destructuring
Patterns can be nested to match nested structures:
```rust
let nested = ((1, 2), (3, 4));
let ((a, b), (c, d)) = nested;

println!("{} {} {} {}", a, b, c, d); // 1 2 3 4
```
The outer pattern `((a, b), (c, d))` matches a tuple of two tuples. Rust unpacks both levels simultaneously. This scales to arbitrary depth.

### Destructuring Function Parameters
Patterns also work directly in function parameter position:
```rust
fn print_point(&(x, y): &(i32, i32)) {
    println!("x={}, y={}", x, y);
}

let p = (3, 7);
print_point(&p);
```
`&(x, y)` in the parameter position is a pattern that matches a reference to a tuple and immediately destructures it. Inside the function, `x` and `y` are `i32` values, not references. This is occasionally useful but less common than destructuring in `let` or `for`.

Now, its time to start working on our JSON parser. If you think you don't understand all the above concepts thats fine. I would say just start building the project and read the required concept again. It's too much to take at once, so take your time.

## What a JSON Parser Actually Does
Parsing is the process of taking raw text and turning it into structured data your program can work with. For JSON, that means taking a string like this:
```json
{"name": "alice", "age": 30, "scores": [95, 87, 100], "active": true}
```
and producing a value in memory that your Rust code can inspect, traverse and query. Something like: "this is an object with four keys, the first key `name` maps to the string `alice`, the second key `age` maps to the number `30`" and so on

A parser typically works in two stages:
1. Tokenization (lexing) - walk the raw input character by character and group characters into meaningful units called tokens. A token might be `{` or `"alice"` or `30` or `true` or `[`. At this stage you are not thinking about structure, you are just identifying the atoms of the language.
2. Parsing - Take the stream of tokens and build a structured value from them according to the grammar rules of JSON. This is where you recognise that `{` starts an object, that an object contains key-value pairs separated by ",", that each key is a string followed by `:` followed by a value and so on.

### The Grammar of JSON
JSON is simple, precise grammar. A JSON value is exactly one of:
- An object: `{` followed by zero or more `"key": value` pairs separated by `,`, followed by `}`
- An array: `[` followed by zero or more values separated by `,`, followed by `]`
- A string: `"` followed by characters followed by `"`
- A number: an optional `-`, digits, optional decimal point and more digits
- A boolean: exactly `true` or `false`
- null: exactly `null`

Objects and arrays contain values and values can themselves be objects or arrays. This is what makes JSON recursive, and why recursive enum is the right representation.

### The `JSONValue` type
Before writing any parsing code, we define the type that represents a parsed JSON value:
```rust
enum JSONValue {
    Object(Vec<(String, JSONValue)>),
    Array(Vec<JSONValue>),
    Str(String),
    Number(f64),
    Bool(bool),
    Null,
}
```
Let's understand each and every variant:
- `Object(Vec<(String, JsonValue)>)` - A JSON object is an unordered collection of key-value pairs. Each key is always a string. Each value is any `JsonValue`. We represent this as a `Vec` of `(String, JsonValue)` tuples. We're using a `Vec` of tuples rather than a `HashMap` because we haven't covered hashmap concept yet. A `Vec` of tuples works correctly and is simpler.
- `Array(Vec<JsonValue>)` - A JSON array is an ordered sequence of values. Each element is any `JsonValue`. Straightforward.
- `Str(String)` - A JSON string. We name the variant `Str` rather than `String` to avoid conflicting with Rust's built-in `String` type name.
- `Number(f64)` - JSON makes no distinction between integers and floats. The spec says all numbers are IEEE 754 doubles, so `f64` is the correct choice.
- `Bool(bool)` - JSON booleans `true` and `false`.
- `Null` - JSON null. No data needed.

Notice that `Object` contains `JsonValue` inside it, and `Array` contains `JsonValue` inside it. This is the recursive structure. But unlike the `Expr` example from the enums section, we don't need explicit `Box` here because `Vec` already heap-allocates its contents. The `Vec` itself is a fixed-size struct on the stack (a pointer, a length, and a capacity of 24 bytes). The actual `JsonValue` elements live on the heap inside the `Vec`'s buffer. So the indirection is already there.

### The Token Type
The tokenizer will produce a sequence of tokens. Here's what the token type looks like:
```rust
enum Token {
    LeftBrace,        // {
    RightBrace,       // }
    LeftBracket,      // [
    RightBracket,     // ]
    Colon,            // :
    Comma,            // ,
    StringToken(String),
    NumberToken(f64),
    True,
    False,
    Null,
}
```

Each variant represents one meaningful unit from the input. Single-character punctuation maps to simple variants with no data. Strings and numbers carry their parsed value. `True`, `False`, and `Null` are keyword tokens.

### Project Setup
Create the project:
```bash
cargo new json_parser
cd json_parser
```

Open `src/main.rs`. We'll put everything in one file for simplicity, we will later learn about modularising our code. Here's the skeleton we'll fill in:

```rust
// The token type
enum Token {
    LeftBrace,
    RightBrace,
    LeftBracket,
    RightBracket,
    Colon,
    Comma,
    StringToken(String),
    NumberToken(f64),
    True,
    False,
    Null,
}

// The JSON value type
enum JsonValue {
    Object(Vec<(String, JsonValue)>),
    Array(Vec<JsonValue>),
    Str(String),
    Number(f64),
    Bool(bool),
    Null,
}

// Stage 1: tokenizer
fn tokenize(input: &str) -> Vec<Token> {
    todo!()
}

// Stage 2: parser
fn parse(tokens: &[Token]) -> JsonValue {
    todo!()
}

fn main() {
    let input = r#"{"name": "alice", "age": 30, "active": true}"#;
    let tokens = tokenize(input);
    let value = parse(&tokens);
}
```

`todo!()` is a macro that panics with "not yet implemented". It lets the code compile while functions are incomplete.

The `r#"..."#` syntax is a raw string literal. The `#` delimiters mean backslashes and inner quotes are not treated as escape sequences. This makes it easier to write JSON strings in Rust source code without escaping every `"`.

### The Tokenizer
The tokenizer's job is to walk the input string character by character and produce a `Vec<Token>`. It needs to:

- Skip whitespace
- Recognise single-character punctuation (`{`, `}`, `[`, `]`, `:`, `,`)
- Recognise string literals (everything between `"` and `"`, handling escape sequences)
- Recognise numbers (digits, optional minus sign, optional decimal)
- Recognise the keywords `true`, `false`, `null`
- Panic on anything unexpected

### How We'll Walk the Input
We need to walk through the characters of the input string with the ability to:
- Look at the current character
- Advance past it
- Sometimes look ahead without advancing

The right tool for this is a **struct** that holds the input as a slice of bytes and tracks the current position:
```rust
struct Lexer {
    input: Vec<u8>,
    pos: usize,
}
```
`input` is the raw bytes of the input string, owned by the lexer. `pos` is the current position, its the index of the next character to be processed.

> We could use a concept called lifetime here but lets not go there as we haven't understood that concept as of now. We will keep it simple by letting the lexer own its data

Now the `impl` block:
```rust
impl Lexer {
    fn new(input: &str) -> Lexer {
        Lexer {
            input: input.as_bytes().to_vec(),
            pos: 0,
        }
    }

    fn current(&self) -> Option<u8> {
        if self.pos < self.input.len() {
            Some(self.input[self.pos])
        } else {
            None
        }
    }

    fn advance(&mut self) {
        self.pos += 1;
    }

    fn peek(&self) -> Option<u8> {
        if self.pos + 1 < self.input.len() {
            Some(self.input[self.pos + 1])
        } else {
            None
        }
    }
}
```
- `new` converts the `&str` to a `Vec<u8>`,  we work with raw bytes because JSON is ASCII-compatible for all structural characters, and byte indexing is simpler than character indexing for this purpose.
- `current` returns the byte at the current position, wrapped in `Option`,  `None` if we've reached the end.
- `advance` moves the position forward by one.
- `peek` looks one position ahead without moving. We'll need this for number parsing to distinguish `-3` (a negative number) from `-` followed by something invalid.

### The Main Tokenize Loop
Now the `tokenize` function creates a `Lexer` and drives a loop:
```rust
fn tokenize(input: &str) -> Vec<Token> {
    let mut lexer = Lexer::new(input);
    let mut tokens = Vec::new();

    loop {
        match lexer.current() {
            None => break,

            Some(b' ') | Some(b'\t') | Some(b'\n') | Some(b'\r') => {
                lexer.advance();
            }

            Some(b'{') => { tokens.push(Token::LeftBrace);    lexer.advance(); }
            Some(b'}') => { tokens.push(Token::RightBrace);   lexer.advance(); }
            Some(b'[') => { tokens.push(Token::LeftBracket);  lexer.advance(); }
            Some(b']') => { tokens.push(Token::RightBracket); lexer.advance(); }
            Some(b':') => { tokens.push(Token::Colon);        lexer.advance(); }
            Some(b',') => { tokens.push(Token::Comma);        lexer.advance(); }

            Some(b'"') => {
                let s = lexer.read_string();
                tokens.push(Token::StringToken(s));
            }

            Some(b't') => {
                lexer.read_keyword("true");
                tokens.push(Token::True);
            }
            Some(b'f') => {
                lexer.read_keyword("false");
                tokens.push(Token::False);
            }
            Some(b'n') => {
                lexer.read_keyword("null");
                tokens.push(Token::Null);
            }

            Some(b'-') | Some(b'0'..=b'9') => {
                let n = lexer.read_number();
                tokens.push(Token::NumberToken(n));
            }

            Some(c) => {
                panic!("Unexpected character: {}", c as char);
            }
        }
    }

    tokens
}
```
A few things to understand here:

`b' '` is a **byte literal** - the ASCII value of the space character as a `u8`. This is how you write character comparisons when working with `&[u8]` instead of `&str`.

`b'0'..=b'9'` is a byte range pattern - it matches any byte whose value is between the ASCII value of `'0'` and the ASCII value of `'9'` inclusive. This is how you check "is this character a digit" without calling any methods.

The `Some(b't')`, `Some(b'f')`, `Some(b'n')` arms peek at the first character to decide which keyword we're reading, then delegate to `read_keyword` which consumes the full keyword and panics if it doesn't match.

`Some(c)` at the bottom is the catch-all - if we hit any character we don't recognise, we panic with a message showing what it was.

### Reading Keywords
```rust
impl Lexer {
    fn read_keyword(&mut self, keyword: &str) {
        for expected in keyword.as_bytes() {
            match self.current() {
                Some(c) if c == *expected => self.advance(),
                Some(c) => panic!(
                    "Unexpected character '{}' while reading keyword '{}'",
                    c as char, keyword
                ),
                None => panic!("Unexpected end of input while reading keyword '{}'", keyword),
            }
        }
    }
}
```
We iterate over the bytes of the expected keyword string. For each expected byte, we check the current character. If it matches, we advance. If it doesn't match or we hit the end of input, we panic.

The pattern `Some(c) if c == *expected` is a match guard. `expected` is `&u8` (a reference to a byte in the keyword slice), so we dereference it with `*expected` to compare against `c` which is `u8`

### Reading Strings
String reading is the most involved part of the tokenizer because JSON strings support escape sequences: `\"`, `\\`, `\/`, `\n`, `\t`, `\r`, and Unicode escapes `\uXXXX`.
```rust
impl Lexer {
    fn read_string(&mut self) -> String {
        // consume the opening "
        self.advance();

        let mut result = String::new();

        loop {
            match self.current() {
                None => panic!("Unterminated string"),

                Some(b'"') => {
                    self.advance(); // consume closing "
                    return result;
                }

                Some(b'\\') => {
                    self.advance(); // consume the backslash
                    match self.current() {
                        Some(b'"')  => { result.push('"');  self.advance(); }
                        Some(b'\\') => { result.push('\\'); self.advance(); }
                        Some(b'/')  => { result.push('/');  self.advance(); }
                        Some(b'n')  => { result.push('\n'); self.advance(); }
                        Some(b't')  => { result.push('\t'); self.advance(); }
                        Some(b'r')  => { result.push('\r'); self.advance(); }
                        Some(b'b')  => { result.push('\x08'); self.advance(); }
                        Some(b'f')  => { result.push('\x0C'); self.advance(); }
                        Some(b'u')  => {
                            self.advance(); // consume 'u'
                            let codepoint = self.read_unicode_escape();
                            let ch = char::from_u32(codepoint)
                                .unwrap_or_else(|| panic!("Invalid unicode codepoint: {}", codepoint));
                            result.push(ch);
                        }
                        Some(c) => panic!("Invalid escape sequence: \\{}", c as char),
                        None    => panic!("Unterminated escape sequence"),
                    }
                }

                Some(c) => {
                    result.push(c as char);
                    self.advance();
                }
            }
        }
    }

    fn read_unicode_escape(&mut self) -> u32 {
        let mut value: u32 = 0;
        for _ in 0..4 {
            match self.current() {
                Some(c) => {
                    let digit = match c {
                        b'0'..=b'9' => (c - b'0') as u32,
                        b'a'..=b'f' => (c - b'a' + 10) as u32,
                        b'A'..=b'F' => (c - b'A' + 10) as u32,
                        _ => panic!("Invalid hex digit in unicode escape: {}", c as char),
                    };
                    value = value * 16 + digit;
                    self.advance();
                }
                None => panic!("Unterminated unicode escape"),
            }
        }
        value
    }
}
```
The outer loop runs until we hit the closing `"` or the end of input. Three cases:

- `Some(b'"')` - closing quote, we advance past it and return the accumulated string.
- `Some(b'\\')` - backslash, meaning an escape sequence follows. We advance past the backslash, then look at the next character to determine which escape it is. Each escape character maps to its actual value. The `\uXXXX` case reads exactly four hex digits and converts them to a Unicode codepoint.
- `Some(c)` - any other character, push it directly onto the result string. `c as char` converts the `u8` byte to a Rust `char`.

In `read_unicode_escape`, the hex digit parsing uses byte arithmetic: `c - b'0'` gives the numeric value of a decimal digit (e.g., `b'3' - b'0'` = `3`). `c - b'a' + 10` gives the numeric value of a lowercase hex letter (e.g., `b'c' - b'a' + 10` = `12`). We accumulate the four digits into a `u32` using `value = value * 16 + digit`, shifting left one hex place each iteration.

### Reading Numbers
JSON numbers can be negative, can have a decimal point, and can have an exponent (`1.5e10`). We'll support negative, integer, and decimal forms. Exponent notation is rare in practice and we'll leave it out to keep the code focused.

```rust
impl Lexer {
    fn read_number(&mut self) -> f64 {
        let mut s = String::new();

        // optional minus sign
        if let Some(b'-') = self.current() {
            s.push('-');
            self.advance();
        }

        // integer part
        loop {
            match self.current() {
                Some(c @ b'0'..=b'9') => {
                    s.push(c as char);
                    self.advance();
                }
                _ => break,
            }
        }

        // optional decimal part
        if let Some(b'.') = self.current() {
            s.push('.');
            self.advance();

            loop {
                match self.current() {
                    Some(c @ b'0'..=b'9') => {
                        s.push(c as char);
                        self.advance();
                    }
                    _ => break,
                }
            }
        }

        s.parse::<f64>().unwrap_or_else(|_| panic!("Invalid number: {}", s))
    }
}
```
We accumulate the number's characters into a `String`, then use Rust's built-in `str::parse::<f64>()` to convert it. This avoids reimplementing float parsing from scratch.

`Some(c @ b'0'..=b'9')` is an `@` binding combined with a range pattern, it matches any digit byte and simultaneously binds it to `c` so we can push it onto the string. Without `@`, we'd match the digit but have no name for it.

The `if let Some(b'.') = self.current()` checks for a decimal point without consuming it first, if it's there, we push it and advance into the fractional digits loop.

### The Parser
The parser takes the `Vec<Token>` the tokenizer produced and turns it into a `JsonValue`. It works through the token list using the same cursor pattern as the lexer,  a current position that advances as tokens are consumed.

### The parser Struct
```rust
struct Parser {
    tokens: Vec<Token>,
    pos: usize,
}

impl Parser {
    fn new(tokens: Vec<Token>) -> Parser {
        Parser { tokens, pos: 0 }
    }

    fn current(&self) -> &Token {
        if self.pos < self.tokens.len() {
            &self.tokens[self.pos]
        } else {
            panic!("Unexpected end of token stream");
        }
    }

    fn advance(&mut self) {
        self.pos += 1;
    }

    fn expect(&mut self, description: &str) -> &Token {
        if self.pos < self.tokens.len() {
            let token = &self.tokens[self.pos];
            self.pos += 1;
            token
        } else {
            panic!("Expected {} but reached end of input", description);
        }
    }
}
```
`current` returns a reference to the token at the current position without advancing. Unlike the lexer's `current` which returned `Option<u8>`, this one panics on end-of-input, by the time we're parsing, a well-formed token stream always has a next token when the grammar says there should be one.

`expect` is a convenience method that returns the current token and advances past it in one step. We'll use it when we need to consume a token we know must be there like the `:` between a key and value in an object.

Notice `current` and `expect` both return `&Token` a reference into the parser's token vector. The parser owns the tokens, and we borrow them out. This means when we pattern match on `self.current()`, we're matching on a `&Token`. Keep that in mind we'll see it immediately.

### The Core `parse_value`
The parser is built around one central method: `parse_value`. It looks at the current token and dispatches to the appropriate parsing logic:
```rust
impl Parser {
    fn parse_value(&mut self) -> JsonValue {
        match self.current() {
            Token::LeftBrace    => self.parse_object(),
            Token::LeftBracket  => self.parse_array(),
            Token::True         => { self.advance(); JsonValue::Bool(true)  }
            Token::False        => { self.advance(); JsonValue::Bool(false) }
            Token::Null         => { self.advance(); JsonValue::Null        }
            Token::NumberToken(n) => {
                let value = *n;
                self.advance();
                JsonValue::Number(value)
            }
            Token::StringToken(s) => {
                let value = s.clone();
                self.advance();
                JsonValue::Str(value)
            }
            Token::RightBrace   => panic!("Unexpected '}'"),
            Token::RightBracket => panic!("Unexpected ']'"),
            Token::Colon        => panic!("Unexpected ':'"),
            Token::Comma        => panic!("Unexpected ','"),
        }
    }
}
```
This is the grammar of JSON encoded directly as Rust code. A value is one of six things and the first token tells us which one.

There are two important ownership details here that need explaining.

**Why `*n` for the number:** `self.current()` returns `&Token`. When we match `Token::NumberToken(n)` on a `&Token`, the binding `n` is `&f64`, a reference to the `f64` inside the token. We write `let value = *n` to dereference it and copy the `f64` out. `f64` is `Copy`, so this is a copy, not a move. We need `value` as an owned `f64` to put inside `JsonValue::Number(value)`.

**Why `s.clone()` for the string:** Same situation, `s` is `&String`, a reference to the string inside the token. We can't move out of it because we only have a reference. `String` is not `Copy`. So we call `.clone()` to produce an owned `String` we can put inside `JsonValue::Str(value)`. The token keeps its copy, our new `JsonValue` gets its own copy.

The `parse_object` and `parse_array` calls are where the recursive structure lives, we'll write those next.

### Parsing Objects
A JSON object looks like:
```json
{"key1": value1, "key2": value2}
```

The grammar is: `{`, then zero or more `string : value` pairs separated by `,`, then `}`.

```rust
impl Parser {
    fn parse_object(&mut self) -> JsonValue {
        self.advance(); // consume '{'

        let mut pairs: Vec<(String, JsonValue)> = Vec::new();

        // handle empty object
        if let Token::RightBrace = self.current() {
            self.advance();
            return JsonValue::Object(pairs);
        }

        loop {
            // parse the key, must be a string
            let key = match self.expect("object key") {
                Token::StringToken(s) => s.clone(),
                other => panic!("Expected string key, got something else"),
            };

            // consume the colon
            match self.expect("colon") {
                Token::Colon => {}
                _ => panic!("Expected ':' after object key"),
            }

            // parse the value, recursive call
            let value = self.parse_value();

            pairs.push((key, value));

            // after a pair, expect either ',' or '}'
            match self.current() {
                Token::Comma => {
                    self.advance(); // consume comma, loop for next pair
                }
                Token::RightBrace => {
                    self.advance(); // consume '}', we're done
                    break;
                }
                _ => panic!("Expected ',' or '}}' in object"),
            }
        }

        JsonValue::Object(pairs)
    }
}
```
Walk through the logic step by step:

We advance past the `{`. Then we immediately check for `}`, an empty object `{}` is valid and we return early with an empty `Vec`.

For non-empty objects we enter a loop. Each iteration parses one key-value pair. We call `self.expect("object key")` which gives us the current token and advances. We match it, if it's a `StringToken` we clone the string out. If it's anything else, we panic.

Then we expect a `Colon`. The match arm `Token::Colon => {}` matches and does nothing, we just needed to consume the token and verify it was a colon.

Then `self.parse_value()`, this is the recursive call. The value after the colon can itself be any JSON value, including a nested object or array. `parse_value` handles all of that. This recursion is what makes the parser work for arbitrarily deep JSON.

After parsing the pair, we look at the current token. A comma means there's another pair, consume it and loop. A `}` means we're done, consume it and break. Anything else is malformed JSON.

One thing to note: the `other` binding in `match self.expect("object key")`, we write it as `other` rather than `_` so we have a name if we wanted to include it in the panic message. With our current conceptual understanding we can't easily format arbitrary token types, so we just use a generic message. In later articles we'll learn to make error messages much richer

### Parsing Arrays
A JSON array looks like:
```json
[value1, value2, value3]
```

The grammar is: `[`, then zero or more values separated by `,`, then `]`. It's structurally identical to object parsing but simpler
```rust
impl Parser {
    fn parse_array(&mut self) -> JsonValue {
        self.advance(); // consume '['

        let mut elements: Vec<JsonValue> = Vec::new();

        // handle empty array
        if let Token::RightBracket = self.current() {
            self.advance();
            return JsonValue::Array(elements);
        }

        loop {
            let element = self.parse_value(); // recursive call
            elements.push(element);

            match self.current() {
                Token::Comma => {
                    self.advance(); // consume comma, loop for next element
                }
                Token::RightBracket => {
                    self.advance(); // consume ']', we're done
                    break;
                }
                _ => panic!("Expected ',' or ']' in array"),
            }
        }

        JsonValue::Array(elements)
    }
}
```

Same pattern as `parse_object`, advance past the opening bracket, handle the empty case, loop parsing values separated by commas, break on the closing bracket.

The `self.parse_value()` call inside `parse_array` is also recursive. An array element can be another array, or an object, or anything else. The mutual recursion between `parse_value`, `parse_object`, and `parse_array` is what handles arbitrary nesting depth correctly.

### The Top-Level `parse` Function
Now we wire everything together:
```rust
fn parse(tokens: Vec<Token>) -> JsonValue {
    let mut parser = Parser::new(tokens);
    let value = parser.parse_value();
    value
}
```

Note we changed the signature from `parse(tokens: &[Token])` to `parse(tokens: Vec<Token>)`, we're passing ownership into the parser, which is cleaner since the parser owns its token list.

### Displaying Results
We need a way to verify our parser works. Let's write a function that converts a `JsonValue` back into a JSON string. This is recursive too and it's a great demonstration of how naturally the recursive enum structure enables recursive processing:

```rust
fn display(value: &JsonValue) -> String {
    match value {
        JsonValue::Null        => String::from("null"),
        JsonValue::Bool(true)  => String::from("true"),
        JsonValue::Bool(false) => String::from("false"),
        JsonValue::Number(n)   => format!("{}", n),
        JsonValue::Str(s)      => format!("\"{}\"", s),

        JsonValue::Array(elements) => {
            let mut result = String::from("[");
            let mut first = true;
            for element in elements {
                if !first {
                    result.push_str(", ");
                }
                result.push_str(&display(element));
                first = false;
            }
            result.push(']');
            result
        }

        JsonValue::Object(pairs) => {
            let mut result = String::from("{");
            let mut first = true;
            for (key, value) in pairs {
                if !first {
                    result.push_str(", ");
                }
                result.push_str(&format!("\"{}\": {}", key, display(value)));
                first = false;
            }
            result.push('}');
            result
        }
    }
}
```
`display` takes `&JsonValue`,  a reference, so it doesn't consume the value. For the simple variants it produces strings directly. For `Array` and `Object` it loops over the children, recursively calling `display` on each one, building up the output string with proper separators.

The `first` boolean flag is how we handle comma separation without a trailing comma,  we skip the comma before the first element and add it before every subsequent one.

## Updating Main function
Lets update the main function to add some test json and check if our parser is working correctly or not.
```rust
fn main() {
    let tests = vec![
        r#"null"#,
        r#"true"#,
        r#"42"#,
        r#"-3.14"#,
        r#""hello world""#,
        r#"[]"#,
        r#"{}"#,
        r#"[1, 2, 3]"#,
        r#"{"name": "alice", "age": 30, "active": true}"#,
        r#"{"scores": [95, 87, 100], "info": {"city": "delhi", "zip": null}}"#,
        r#"["hello\nworld", "tab\there", "\u0041\u0042\u0043"]"#,
    ];

    for input in &tests {
        let tokens = tokenize(input);
        let value = parse(tokens);
        println!("Input:  {}", input);
        println!("Output: {}", display(&value));
        println!();
    }
}
```

Run it with `cargo run` and you should see:
```bash
Input:  null
Output: null

Input:  true
Output: true

Input:  42
Output: 42

Input:  -3.14
Output: -3.14

Input:  "hello world"
Output: "hello world"

Input:  []
Output: []

Input:  {}
Output: {}

Input:  [1, 2, 3]
Output: [1, 2, 3]

Input:  {"name": "alice", "age": 30, "active": true}
Output: {"name": "alice", "age": 30, "active": true}

Input:  {"scores": [95, 87, 100], "info": {"city": "delhi", "zip": null}}
Output: {"scores": [95, 87, 100], "info": {"city": "delhi", "zip": null}}

Input:  ["hello\nworld", "tab\there", "\u0041\u0042\u0043"]
Output: ["hello
world", "tab	here", "ABC"]
```

The last test shows escape sequences working,  `\n` becomes a real newline, `\t` becomes a real tab, and `\u0041\u0042\u0043` decodes to `ABC`.

## Conclusion
That's it. You've built a real, working JSON parser from scratch. It was a long one but I hope you learned a lot. In the next one we are going to build a TOML config parser and learn about error handling in detail, we will understand about `Result<T, E>` and stop using `unwrap` calls. See you soon.
