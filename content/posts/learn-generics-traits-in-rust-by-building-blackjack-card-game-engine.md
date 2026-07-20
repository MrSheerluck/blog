+++
title = "Learn Rust Generics and Traits By Building a Mini Blackjack Game"
description = "In this post, we are going to build a mini blackjack game in Rust and learn generics and traits in Rust"
date = 2026-05-09
transparent = true

[taxonomies]
tags = ["rust", "project"]
series = ["learning-rust"]

[extra]
hidden = true
+++


In this post, we are going to learn about generics and traits by building a blackjack card engine in Rust. I'm really excited for this project and I hope you are too. I won't go too deep in theory, just practical and we will build our knowledge of these concepts over time with more articles.

The only prerequisite is that you have read the previous articles in this series, as I will assume you know ownership, borrowing, structs, enums, pattern matching and error handling.

In this post, we will first learn what generics are, what traits are, how they work together, and then we will build a generic card engine that can work with any card type. We will also use proper error handling throughout, since we already learned about `Result`, the `?` operator, and custom error types in the previous article.

You can get the source code from [here](https://github.com/MrSheerluck/blackjack-card-engine)

Let's start. I can't wait.
## Generics
Let's say you want to write a function that returns the larger of two values. Without generics, you would need to write a separate function for every type you want to support:
```rust
fn max_i32(a: i32, b: i32) -> i32 {
    if a > b { a } else { b }
}
fn max_f64(a: f64, b: f64) -> f64 {
    if a > b { a } else { b }
}
```
These two functions have identical logic. The only difference is the type. If you also wanted to support `i64`, `u32`, `strings`, or your own custom types, you would need to duplicate this code forever. This is not maintainable at all.
To solve this issue, we have **generics**. Generics let you write logic once and use it with any type. You introduce a type parameter, which acts as a placeholder for a concrete type.
```rust
fn identity<T>(value: T) -> T {
    value
}
```
The `<T>` is the type parameter. It says "this function works for any type T". When you call `identity(5)`, Rust replaces `T` with `i32`. When you call `identity("hello")`, Rust replaces `T` with `&str`. The compiler figures this out automatically from the argument you pass.
Now let me explain what we just did. The `T` is just a name. You can use any identifier, but single capital letters like `T`, `U`, `K`, `V` are conventional. `T` stands for "type". The compiler generates separate machine code for each concrete type you use. This is called **monomorphization**. It means there is zero runtime cost compared to writing separate functions. The generated code is exactly as fast as if you have written `identity_i32` and `identity_str` by hand.
### Generics Structs
Generics are not limited to functions. Structs can be generic too.
```rust
struct Point<T> {
    x: T,
    y: T,
}
```
`Point<i32>` and `Point<f64>` are completely different types. The compiler treats them as separate. You cannot mix them.
```rust
let p1 = Point { x: 5, y: 10 }; // Point<i32>
let p2 = Point { x: 1.5, y: 2.5 }; // Point<f64>
```
If you try `let p = Point { x: 4, y: 3.14 };`, you will get a compile error because `x` and `y` must be the same type. If you want to be different, you need two type parameters, like this:
```rust
struct Point<T, U> {
    x: T,
    y: U,
}
```
Now `Point<i32, f64>` is valid. The convention is to use `T` and `U` when they are unrelated and `K` and `V` when they represent keys and values.
### The Limitation
Here is where generics hit a wall. If you try to write that `max` function using generics:
```rust
fn max<T>(a: T, b: T) -> T {
    if a > b {
        a
    } else {
        b
    }
}
```
You will get a compile error. The compiler will tell you that `T` does not support `>` operator. The problem is that `T` could be anything. It could be a struct you defined that has no concept of ordering. It could be a vector. It could be a file handle. The compiler cannot assume `>` is valid.
This is where traits come in. Traits let you constrain generics. They let you say "this generic function only works with types that can do X".
## Traits
A trait defines a set of methods that a type must implement. It is a contract. If a type implements a trait, it is promising that is can do certain things.
Think of it like this. In real world, a "vehicle" is a concept that promises certain behaviour. Any vehicle can start, stop and turn. A car implements vehicle. A motorcycle implements vehicle. They do it differently but they both fulfill the contract.
In Rust, a trait looks like this:
```rust
trait Card {
    fn value(&self) -> u8;
    fn display(&self) -> String;
}
```
Any type that wants to be a `Card` must provide two methods: `value` and `display`. The trait only defines signatures, not implementations. The actual code lives in the `impl` block for each type.
### Implementing a Trait
```rust
struct PokerCard {
    rank: Rank,
    suit: Suit,
}
impl Card for PokerCard {
    fn value(&self) -> u8 {
        // implementation
    }
    fn display(&self) -> String {
        // implementation
    }
}
```
The syntax is `impl TRAIT for TYPE`. This is different from inherent methods which are just `impl Type`. The trait implementation attaches the behavior to the type.
Now let me explain what we just did. `impl Card for PokerCard` says "PokerCard fulfills the Card contract." Inside the block, we provide the actual code for `value` and `display`. If we forget either method, the compiler will reject our code because the trait contract is incomplete.
### Default Implementations
Traits can provide default behaviour. The implementor can use it or override it.
```rust
trait Card {
    fn value(&self) -> u8;
    fn is_face(&self) -> bool {
        self.value() >= 10
    }
}
```
Here `is_face` has a default body. If you implement `Card` for `PokerCard` and only provide `value`, you get `is_face` for free. But you can override it if you want custom logic.
```rust
impl Card for PokerCard {
    fn value(&self) -> u8 {
        match self.rank {
            Rank::Two => 2,
            Rank::Three => 3,
            // ...
            Rank::Ace => 11,
        }
    }
    fn is_face(&self) -> bool {
        // custom override
        matches!(self.rank, Rank::Jack | Rank::Queen | Rank::King)
    }
}
```
### Trait Bounds
Remember the max function that would not compile? Traits fix it.
```rust
fn max<T: PartialOrd>(a: T, b: T) -> T {
    if a > b { a } else { b }
}
```
`T: PartialOrd` is a trait bound. It means "T must implement the PartialOrd trait." `PartialOrd` is a standard library trait that provides ordering operations like `<`, `>`, `<=`, `>=`. The compiler checks this at the call site. If you try to pass a type that does not implement PartialOrd, you get a clean compile error.
### Multiple Trait Bounds
Sometimes one bound is not enough.
```rust
fn process<T: Card + Clone + Debug>(card: T) {
    println!("{:?}", card.clone());
    println!("Value: {}", card.value());
}
```
This means `T` must implement `Card` and `Clone` and `Debug`. When you have many bounds, the where clause is cleaner:
```rust
fn process<T>(card: T)
where
    T: Card + Clone + Debug,
{
    println!("{:?}", card.clone());
    println!("Value: {}", card.value());
}
```
Both mean the same thing. Pick whichever reads better. I prefer `where` when there are more than two bounds because it keeps the function signature readable.
### Derive
Rust can auto implement some traits for you.
```rust
#[derive(Debug, Clone, Copy, PartialEq)]
struct PokerCard {
    rank: Rank,
    suit: Suit,
}
```
This generates `Debug`, `Clone`, `Copy`, and `PartialEq` implementations automatically. You cannot derive everything. `Display` and custom traits like `Card` must be written by hand because the compiler does not know how you want them formatted.
Here is a table of commonly derived traits:
| Trait        | What It Gives You                          |
| ------------ | ------------------------------------------ |
| `Debug`      | `{:?}` formatting for programmer output    |
| `Clone`      | `.clone()` method to duplicate             |
| `Copy`       | Bitwise copy on assignment instead of move |
| `PartialEq`  | `==` and `!=` operators                    |
| `Eq`         | Reflexive equality, used by HashMap        |
| `PartialOrd` | `<`, `>`, `<=`, `>=` operators             |
| `Ord`        | Total ordering, used by sorting            |
| `Hash`       | Used by HashMap                            |
| `Default`    | `Default::default()` constructor           |
### The Orphan Rule
You can implement a trait for a type if either the trait or the type is defined in your crate. You cannot implement a foreign trait for a foreign type.
For example, you cannot do this:
```rust
impl Display for Vec<u8> {
    // ERROR: both Display and Vec are from std
}
```
This prevents conflicting implementations from different crates. If crate A and crate B both implemented `Display` for `Vec<u8>`, and you used both crates, which implementation would win? Rust avoids this ambiguity entirely.
If you need to add behavior to a foreign type, wrap it in your own struct. This is called the newtype pattern.
```rust
struct ByteVec(Vec<u8>);
impl Display for ByteVec {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        write!(f, "{:?}", self.0)
    }
}
```
`ByteVec` is your type, so you can implement any trait for it.
### Traits on Generic Structs
This is where everything comes together. You can write impl blocks for generic structs with trait bounds.
```rust
struct Deck<T> {
    cards: Vec<T>,
}
impl<T: Card + Clone + Debug> Deck<T> {
    fn shuffle(&mut self) { ... }
    fn deal(&mut self) -> Result<T, GameError> { ... }
    fn len(&self) -> usize { ... }
}
```
`impl<T: Card + Clone + Debug> Deck<T>` means these methods only exist for `Deck<T>` when T implements all three traits. Inside the block, you can call `card.value()` because `T: Card`. You can `card.clone()` because `T: Clone`. Without the bounds, `T` is an unknown blob and the compiler will reject any method call.
But here is something important. A generic `Deck<T>` should not know how to create `T`. Creating 52 poker cards is specific to poker cards. A `Deck<UnoCard>` would need different cards entirely. So we keep the generic methods (shuffle, deal, len) on `impl<T> Deck<T>`, but we put the constructor on a separate, non-generic impl block:
```rust
impl Deck<PokerCard> {
    fn new() -> Self {
        let mut cards = Vec::new();
        for suit in [Suit::Hearts, Suit::Diamonds, Suit::Clubs, Suit::Spades] {
            for rank in [
                Rank::Two, Rank::Three, Rank::Four, Rank::Five,
                Rank::Six, Rank::Seven, Rank::Eight, Rank::Nine,
                Rank::Ten, Rank::Jack, Rank::Queen, Rank::King, Rank::Ace,
            ] {
                cards.push(PokerCard { rank, suit });
            }
        }
        Deck { cards }
    }
}
```
`impl Deck<PokerCard>` means these methods only exist for `Deck<PokerCard>`, not for any other `Deck<T>`. This is how we keep the engine generic while still having a concrete constructor for our specific card type.
## What We Are Skipping
We are not covering lifetimes in this article. We will cover them properly in a later article. We are also not covering trait objects. That comes later when we talk about smart pointers. We are also not covering associated types or generic associated types. Those are advanced topics for future articles.
## The Project
Now that you understand generics and traits, let's build the blackjack engine. We will use proper error handling throughout, since we already learned about `Result`, custom error types, and the `?` operator in the previous article.
We are going to build a command line blackjack game. We are going to build a generic card engine. The deck and the hand will work with any type of card that implements the `Card` trait.
### Project Setup
Open your terminal and run:
```bash
cargo new blackjack-card-engine
cd blackjack-card-engine
```
Now open the `Cargo.toml` file and add the dependencies:
```toml
[package]
name = "blackjack-card-engine"
version = "0.1.0"
edition = "2024"
[dependencies]
rand = "0.8"
thiserror = "2"
```
We added `thiserror` because we will define a custom error type for our game. We learned about `thiserror` in the previous article.
Now open `src/main.rs` and delete the generated code. We will start fresh.
### Defining Error Types
Since we are using proper error handling, let's define our error type first.
```rust
use thiserror::Error;
#[derive(Error, Debug)]
enum GameError {
    #[error("Deck is empty")]
    EmptyDeck,
    #[error("Invalid input: {0}")]
    InvalidInput(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}
```
Now, let me explain what we just did. `#[derive(Error)]` from `thiserror` automatically implements the `Error` and `Display` traits for us. `#[error("...")]` defines the display message for each variant. `#[from] std::io::Error` auto-implements `From<std::io::Error>` for our `GameError`, which means we can use the ? operator on `std::io` operations and they will automatically convert.
### Rank and Suit
```rust
#[derive(Debug, Clone, Copy, PartialEq)]
enum Rank {
    Two, Three, Four, Five, Six, Seven,
    Eight, Nine, Ten, Jack, Queen, King, Ace,
}
#[derive(Debug, Clone, Copy, PartialEq)]
enum Suit {
    Hearts, Diamonds, Clubs, Spades,
}
```
We derive `Debug`, `Clone`, `Copy`, and `PartialEq`. These are simple value types, so deriving all four makes sense. `Copy` means they are bitwise copied when assigned, not moved. This is important because we will be passing them around a lot.
### The Card Trait
```rust
trait Card {
    fn value(&self) -> u8;
    fn display(&self) -> String;
}
```
Any type that implements `Card` must provide a numeric value and a display string.
### The PokerCard Struct
```rust
#[derive(Debug, Clone, Copy, PartialEq)]
struct PokerCard {
    rank: Rank,
    suit: Suit,
}
```
### Display Implementation
We cannot derive `Display`, so we implement it manually.
```rust
use std::fmt;
impl fmt::Display for Rank {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = match self {
            Rank::Two => "2",
            Rank::Three => "3",
            Rank::Four => "4",
            Rank::Five => "5",
            Rank::Six => "6",
            Rank::Seven => "7",
            Rank::Eight => "8",
            Rank::Nine => "9",
            Rank::Ten => "10",
            Rank::Jack => "J",
            Rank::Queen => "Q",
            Rank::King => "K",
            Rank::Ace => "A",
        };
        write!(f, "{}", s)
    }
}
impl fmt::Display for Suit {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let symbol = match self {
            Suit::Hearts => "♥",
            Suit::Diamonds => "♦",
            Suit::Clubs => "♣",
            Suit::Spades => "♠",
        };
        write!(f, "{}", symbol)
    }
}
impl fmt::Display for PokerCard {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} of {}", self.rank, self.suit)
    }
}
```
Now, let me explain what we just did. `fmt::Display` is the trait for user-facing string formatting. It is what `println!("{}", value)` uses. The `Formatter<'_>` is the output target. 

> You might notice the `'_` inside `Formatter<'_>`. This is a lifetime annotation. Every reference in Rust has a lifetime, which is how long the reference stays valid. The Formatter struct borrows an output buffer, and Rust needs to track how long that borrow lasts. Writing `'_` tells the compiler 'I don't want to name this lifetime, just figure it out automatically.`'` This is called lifetime elision. The compiler looks at the function signature and infers the correct lifetime for you. We will cover lifetimes properly in a later article, but for now just understand that `'_` means 'the compiler will handle this borrow check for us.'

### Implement Card for PokerCard
```rust
impl Card for PokerCard {
    fn value(&self) -> u8 {
        match self.rank {
            Rank::Two => 2,
            Rank::Three => 3,
            Rank::Four => 4,
            Rank::Five => 5,
            Rank::Six => 6,
            Rank::Seven => 7,
            Rank::Eight => 8,
            Rank::Nine => 9,
            Rank::Ten | Rank::Jack | Rank::Queen | Rank::King => 10,
            Rank::Ace => 11,
        }
    }
    fn display(&self) -> String {
        format!("{}", self)
    }
}
```
The Ace returns 11. The hand scoring logic will handle the soft Ace calculation.
### The Generic Deck
We need the `Debug` trait in scope for our generic bounds, so we import it:
```rust
use std::fmt::Debug;
use rand::seq::SliceRandom;
struct Deck<T> {
    cards: Vec<T>,
}
```
Now for the generic methods. These work with any `T` that implements `Card`, `Clone`, and `Debug`:
```rust
impl<T: Card + Clone + Debug> Deck<T> {
    fn shuffle(&mut self) {
        self.cards.shuffle(&mut rand::thread_rng());
    }
    fn deal(&mut self) -> Result<T, GameError> {
        self.cards.pop().ok_or(GameError::EmptyDeck)
    }
    fn len(&self) -> usize {
        self.cards.len()
    }
}
```
Now, let me explain what we just did. `impl<T: Card + Clone + Debug> Deck<T>` means these methods only exist when `T` implements all three traits. Inside this block, we can call `card.value()` because `T: Card`. We can `card.clone()` because `T: Clone`.
Notice that `deal` now returns `Result<T, GameError>` instead of `Option<T>`. We use `ok_or` to convert `None` into our custom error. This is proper error handling. In the previous article, we might have used `expect` or `unwrap`. Now we use `Result`.
But wait. Where is `new`? We cannot put `new` in the generic impl because a generic `Deck<T>` does not know how to create `T`. Creating 52 poker cards is specific to `PokerCard`. So we put it on a separate impl block that is only for `Deck<PokerCard>`:
```rust
impl Deck<PokerCard> {
    fn new() -> Self {
        let mut cards = Vec::new();
        for suit in [Suit::Hearts, Suit::Diamonds, Suit::Clubs, Suit::Spades] {
            for rank in [
                Rank::Two, Rank::Three, Rank::Four, Rank::Five,
                Rank::Six, Rank::Seven, Rank::Eight, Rank::Nine,
                Rank::Ten, Rank::Jack, Rank::Queen, Rank::King, Rank::Ace,
            ] {
                cards.push(PokerCard { rank, suit });
            }
        }
        Deck { cards }
    }
}
```
`impl Deck<PokerCard>` means `new()` only exists for `Deck<PokerCard>`. If you tried to write `Deck::<UnoCard>::new()`, you would get a compile error because there is no `new` for that type. This is the correct way to handle it: keep the engine generic, but put concrete constructors on concrete types.
### The Generic Hand
```rust
struct Hand<T> {
    cards: Vec<T>,
}
impl<T: Card> Hand<T> {
    fn new() -> Self {
        Hand { cards: Vec::new() }
    }
    fn add(&mut self, card: T) {
        self.cards.push(card);
    }
    fn score(&self) -> u8 {
        let mut total = 0;
        let mut aces = 0;
        for card in &self.cards {
            let value = card.value();
            total += value;
            if value == 11 {
                aces += 1;
            }
        }
        while total > 21 && aces > 0 {
            total -= 10;
            aces -= 1;
        }
        total
    }
    fn display(&self) -> String {
        self.cards.iter()
            .map(|c| c.display())
            .collect::<Vec<_>>()
            .join(", ")
    }
}
```
Now, let me explain the scoring. We iterate through every card and add up the values. We also count how many Aces we saw. After the loop, if the total is over 21 and we have Aces, we convert each Ace from 11 to 1 by subtracting 10. We keep doing this until the total is 21 or below, or we run out of Aces. This is the standard blackjack soft hand rule.
### The Run Pattern
Just like in the previous article, we keep `main` simple and put our game logic in a `run` function that returns `Result`.
```rust
fn run() -> Result<(), GameError> {
    let mut deck = Deck::new();
    deck.shuffle();
    let mut player = Hand::new();
    let mut dealer = Hand::new();
    // Deal initial cards
    player.add(deck.deal()?);
    dealer.add(deck.deal()?);
    player.add(deck.deal()?);
    dealer.add(deck.deal()?);
    println!("Your hand: {} (score: {})", player.display(), player.score());
    println!("Dealer shows: {}", dealer.cards[0].display());
    // Player turn
    loop {
        println!("Hit or stand? (h/s)");
        let mut input = String::new();
        std::io::stdin().read_line(&mut input)?;
        match input.trim() {
            "h" | "hit" => {
                let card = deck.deal()?;
                println!("You drew: {}", card.display());
                player.add(card);
                println!("Your hand: {} (score: {})", player.display(), player.score());
                if player.score() > 21 {
                    println!("Bust! You lose.");
                    return Ok(());
                }
            }
            "s" | "stand" => break,
            _ => {
                return Err(GameError::InvalidInput(input.trim().to_string()));
            }
        }
    }
    // Dealer turn
    println!("Dealer hand: {} (score: {})", dealer.display(), dealer.score());
    while dealer.score() < 17 {
        let card = deck.deal()?;
        println!("Dealer drew: {}", card.display());
        dealer.add(card);
        println!("Dealer hand: {} (score: {})", dealer.display(), dealer.score());
    }
    if dealer.score() > 21 {
        println!("Dealer busts! You win.");
        return Ok(());
    }
    // Determine winner
    let player_score = player.score();
    let dealer_score = dealer.score();
    println!("Final - You: {}, Dealer: {}", player_score, dealer_score);
    if player_score > dealer_score {
        println!("You win!");
    } else if dealer_score > player_score {
        println!("Dealer wins!");
    } else {
        println!("Push! It's a tie.");
    }
    Ok(())
}
fn main() {
    if let Err(e) = run() {
        eprintln!("Error: {}", e);
        std::process::exit(1);
    }
}
```
Now, let me explain what we just did. `run` returns `Result<(), GameError>`. We use `?` everywhere an operation can fail. `deck.deal()?` propagates the `EmptyDeck` error. `std::io::stdin().read_line(&mut input)?` propagates IO errors, and thanks to `#[from] std::io::Error` on our error type, the `?` operator automatically converts it.
`main` calls `run` and handles the error. If there is an error, it prints to stderr and exits with code 1. This is the exact pattern we used in the TOML parser article.
### Running the Project
Type this in your terminal:
```bash
cargo run
```
You should see output like this:
```
Your hand: A of ♠, 10 of ♥ (score: 21)
Dealer shows: 7 of ♦
Hit or stand? (h/s)
```
Try playing a few hands. The generic engine is working.
## Conclusion
In this post, you learned about generics and traits. You learned that generics let you write code once and use it with any type, and that traits define contracts that constrain those generics. 

You learned about trait bounds, default implementations, the orphan rule, and the derive macro. You also learned how to combine generics and traits to build truly reusable code.

You built a generic blackjack card engine with proper error handling using `Result`, custom error types with `thiserror`, and the `?` operator. The engine works with any card type that implements the `Card` trait.

In the next article, we will learn about HashMap and build an inverted index search engine. I hope to see you soon. Till then, goodbye.
