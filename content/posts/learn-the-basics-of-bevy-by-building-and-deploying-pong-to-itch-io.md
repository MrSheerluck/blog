+++
title = "Learn the Basics of Bevy by Building and Deploying Pong to Itch.io"
description = "Build Pong from scratch using the Bevy game engine in Rust. Learn ECS, the game loop, collision detection, player input, and scoring. Then deploy a playable web version to Itch.io."
date = 2026-05-23
transparent = true

[taxonomies]
tags = ["bevy", "gamedev", "rust"]
series = ["learning-bevy-by-building-projects"]
+++


I'm starting a new series on learning game dev and Bevy game engine. I'll structure the articles so that in each article, we will build one game and learn different game dev and Bevy concepts. All the projects are coming from the [20 challenges list](https://20_games_challenge.gitlab.io/challenge/). 

This is a learning series for me as well. I'm familiar with game dev but not with Bevy, this is why I'm writing these primarily for learning and sharing my knowledge with you. If there is any incorrect information, then please inform me, I'll rectify that asap.

The only prerequisite is that you should know Rust or should be able to learn Rust concepts on the go. I have a [Rust learning series](https://blog.sheerluck.dev/series/learning-rust/) that follows the similar project building method. In every article we build a interesting project and learn Rust concepts. You can check that out or you can follow any other resource as well.

In this post, we are going to build **Pong** and publish our game on [Itch.io](https://itch.io), the classic arcade game where two players bounce a ball past each other's paddles. If you know Rust but have never built a game before, this is the perfect place to start. I'm really excited for this project and I hope you are too.

We'll use **Bevy**, a Rust game engine. We'll learn the fundamentals of game development along the way: what a game loop is, how entities and components work, how collision detection works, how to handle player input, and how to display a score.

Get the full source code from [here](https://github.com/MrSheerluck/bevy-pong)
Published game link is [here](https://mrsheerluck.itch.io/pong-with-bevy-engine)

> This series will be updated for future stable Bevy versions and if anything is incorrect, then please let me know I'll fix that ASAP.

> We might not follow standard patterns or best practices in our learning series as the goal is to build games incrementally. For example, in this article, we are not using any third party physics crate, instead we are implementing a manual AABB algorithm, which we won't do in future articles. 

> I won't add game GIFs or images for any sections as that's really not required. You can just copy and run the section one by one and you'll get the game on your system without any issues.
## What Is a Game Engine?
Before writing any code, let's understand what a game engine actually does.

At its core, a video game is just a loop. Every frame (usually 60 times per second), the game:

1. **Reads input** - what keys are the players pressing?
2. **Updates the world** - move the paddles, move the ball, check for collisions.
3. **Renders** - draw everything on the screen.

This is called the **game loop**. Without an engine, you'd write this loop yourself, read input, update state, draw pixels. A game engine like Bevy handles the hard parts (rendering graphics, playing audio, handling window events) so you can focus on what makes your game unique.

Bevy organizes game code using a pattern called **ECS**: Entity-Component-System. Let's understand each part:

- **Entity**: A unique ID that represents something in your game. A paddle, a ball, the camera and so on.
- **Component**: Data attached to an entity. Position, velocity, health, color and so on. Plain Rust structs with no methods.
- **System**: A function that runs every frame and operates on entities that have specific components. A "movement" system finds all entities with a `Position` and `Velocity` and updates their positions.

**Data and logic are separate**. Components just sit there holding data. Systems read and modify components. This is different from object-oriented programming where objects contain both data and methods.
## Project Setup
Open your terminal and create a new Rust project:
```
cargo new bevy_pong
cd bevy_pong
```

Now open `Cargo.toml` and replace its contents with:
```toml
[package]
name = "bevy_pong"
version = "0.1.0"
edition = "2024"

[dependencies]
bevy = "0.18"
```

The `[dependencies]` section tells Cargo what external libraries to download. We add `bevy = "0.18"` which pulls in the Bevy engine at version 0.18.

Now run:
```
cargo build
```

This will take a few minutes. Bevy is a large engine, it compiles the renderer (OpenGL/Metal/Vulkan), audio system, asset loader, input handler, and more. Subsequent builds will be fast because only your code changes need recompilation.
## The Skeleton: Opening a Window
Let's write the smallest possible Bevy program. Open `src/main.rs` and type this:
```rust
use bevy::prelude::*;

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_systems(Startup, setup)
        .run();
}

fn setup(mut commands: Commands) {
    commands.spawn(Camera2d);
}
```


`use bevy::prelude::*;` imports the most common Bevy types. Without this, you'd write `bevy::ecs::system::Commands` instead of just `Commands`.

### The `main` function
`App::new()` creates a new, empty Bevy application. Think of `App` as your game's headquarters, it holds everything: the world (all entities and their components), the schedule (which systems run and when), and the plugins (bundled features).

`.add_plugins(DefaultPlugins)` is the most important line in any Bevy project. `DefaultPlugins` is a bundle of everything Bevy needs to function. It includes:

- **WindowPlugin**: Creates a window on your screen.
- **RenderPlugin**: Renders graphics using your GPU.
- **AssetPlugin**: Loads files like images and sounds.
- **InputPlugin**: Handles keyboard, mouse, and gamepad input.
- **AudioPlugin**: Plays sounds.

`.add_systems(Startup, setup)` registers our `setup` function as a system that runs during the `Startup` schedule. A **schedule** determines *when* a system runs. Bevy has several schedules:
- **Startup**: Runs once when the app starts. Use this for creating entities, loading assets, setting up initial state.
- **Update**: Runs every frame. Use this for gameplay logic like movement, collision, input handling.
- **FixedUpdate**: Runs at a fixed rate (independent of frame rate). Good for physics.

`.run()` starts the game loop. This function never returns, it runs until the player closes the window.
### The `setup` function
```rust
fn setup(mut commands: Commands) {
    commands.spawn(Camera2d);
}
```

`commands: Commands` is a queue of changes to make to the game world. When you call `commands.spawn(...)`, the entity is queued and created at a safe point during the frame. 

`commands.spawn(Camera2d)` creates a new entity with a `Camera2d` component. In Bevy, **components can require other components**. `Camera2d` automatically brings along `Camera` (the camera settings), `Projection` (the math that converts 3D world coordinates to 2D screen pixels), and `Frustum` (for culling objects that are off-screen).

Without a camera, there's nothing to render through.

Run `cargo run`. You should see a window with a black background. That's your first running game.
## Understanding Coordinates
Before we place objects, let's understand how positions work in a 2D game.

Your window is a flat rectangle. Every position on it is described by an **(x, y)** coordinate:
- **x**: Horizontal position. 0 is the center. Negative is left. Positive is right.
- **y**: Vertical position. 0 is the center. Negative is down. Positive is up.

Coordinates are measured in **pixels**. If your window is 800 pixels wide, the left edge is at x = -400, the right edge is at x = 400, and the center is at x = 0.

Each entity has a `Transform` component that stores its position, rotation, and scale. When you set `Transform::from_xyz(-350.0, 0.0, 0.0)`, you're moving that entity 350 pixels to the left of center.

There's also a z component in the 3D vector. In a 2D game, z controls which objects appear on top of others. Higher z means closer to the camera. We leave it at 0 for everything.
## Setting the Window Size and Background

By default, Bevy creates a 1280x720 window with a dark grey background. Let's fix that to 800x600 with a black background, so our coordinate math is predictable:

```rust
fn main() {
    App::new()
        .add_plugins(DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window {
                resolution: WindowResolution::new(800, 600),
                title: "Pong".into(),
                ..default()
            }),
            ..default()
        }))
        .insert_resource(ClearColor(Color::srgb(0.0, 0.0, 0.0)))
        .add_systems(Startup, setup)
        .run();
}
```

Let me explain the new stuff.

`DefaultPlugins.set(WindowPlugin { ... })` - `DefaultPlugins` is configurable. The `.set()` method replaces its default `WindowPlugin` with our custom one.

`Window { resolution: ..., title: ..., ..default() }` - a `Window` struct with multiple settings. We only set two: `resolution` (800x600 pixels) and `title` ("Pong"). `..default()` fills in the rest: vsync enabled, resizable, decorated window frame, and so on.

`resolution: WindowResolution::new(800, 600)` - `WindowResolution::new` takes a width and height in logical pixels. On high-DPI displays, the actual physical pixels might be different, but Bevy handles that conversion.

`.insert_resource(ClearColor(Color::srgb(0.0, 0.0, 0.0)))` - `ClearColor` is a **resource**, which means there's exactly one instance of it in the world. It controls the background color rendered between frames. `Color::srgb(0.0, 0.0, 0.0)` is pure black (no red, no green, no blue).

The reason we call it `insert_resource` instead of `spawn` is that resources are not entities. They're singletons (global data that any system can access). Entities are for things that exist in the game world (paddles, balls, walls). Resources are for game-wide state (score, settings, input state).
## Creating Our Game Objects
Let's define the data that describes our paddles and ball. In ECS, data lives in components:
```rust
#[derive(Component)]
struct Paddle {
    speed: f32,
    side: Side,
}

#[derive(Component)]
enum Side {
    Left,
    Right,
}

#[derive(Component)]
struct Ball {
    velocity: Vec3,
}
```

`#[derive(Component)]` is a derive macro that tells Bevy "this struct can be used as a component on an entity." It implements the `Component` trait, which provides metadata about the component.

`Paddle { speed: f32, side: Side }` - each paddle has a movement speed (pixels per second) and a side identifier (which player controls it).

`enum Side { Left, Right }` - yes, enums can be components too. We'll use this to determine which keyboard keys move which paddle.

`Ball { velocity: Vec3 }` - the ball's velocity is a 3D vector. Even in a 2D game, we use `Vec3` because `Transform` positions also use `Vec3`. The z component stays 0. The velocity determines how fast and in what direction the ball travels each frame.

Now let's place these objects in the world. Update your `setup` function:
```rust
fn setup(mut commands: Commands) {
    commands.spawn(Camera2d);

    // Left paddle
    commands.spawn((
        Paddle { speed: 500.0, side: Side::Left },
        Sprite::from_color(Color::WHITE, Vec2::new(10.0, 100.0)),
        Transform::from_xyz(-350.0, 0.0, 0.0),
    ));

    // Right paddle
    commands.spawn((
        Paddle { speed: 500.0, side: Side::Right },
        Sprite::from_color(Color::WHITE, Vec2::new(10.0, 100.0)),
        Transform::from_xyz(350.0, 0.0, 0.0),
    ));

    // Ball
    commands.spawn((
        Ball { velocity: Vec3::new(300.0, 150.0, 0.0) },
        Sprite::from_color(Color::WHITE, Vec2::new(10.0, 10.0)),
        Transform::from_xyz(0.0, 0.0, 0.0),
    ));
}
```

Each `commands.spawn((...))` call creates an entity with multiple components at once. The components are passed as a tuple. Bevy treats each element as a separate component and attaches all of them to the same entity.

`Sprite::from_color(Color::WHITE, Vec2::new(10.0, 100.0))` creates a visual rectangle without loading any image files. The first argument is the fill color, the second is the size in pixels. Left and right paddles are 10 pixels wide by 100 pixels tall. The ball is a 10x10 square.

`Transform::from_xyz(-350.0, 0.0, 0.0)` positions the left paddle 350 pixels to the left of center. Since our window is 800 pixels wide, the left edge is at -400, so the paddle sits 50 pixels from the left edge. The right paddle is at the mirror position. The ball starts at the exact center.

The ball's velocity is `(300, 150, 0)` it moves 300 pixels per second to the right and 150 pixels per second upward. This diagonal path gives it an interesting angle.

Run `cargo run`. You should see two white rectangles near the edges and a small white square in the center. Nothing moves yet, we need to write systems for that.
## Making the Paddles Move
Now we write our first real gameplay system.

```rust
fn move_paddle(
    keyboard: Res<ButtonInput<KeyCode>>,
    mut paddle_query: Query<(&mut Transform, &Paddle)>,
    time: Res<Time>,
) {
    for (mut transform, paddle) in &mut paddle_query {
        let mut direction = 0.0;
        match paddle.side {
            Side::Left => {
                if keyboard.pressed(KeyCode::KeyW) { direction = 1.0; }
                if keyboard.pressed(KeyCode::KeyS) { direction = -1.0; }
            }
            Side::Right => {
                if keyboard.pressed(KeyCode::ArrowUp) { direction = 1.0; }
                if keyboard.pressed(KeyCode::ArrowDown) { direction = -1.0; }
            }
        }
        transform.translation.y += direction * paddle.speed * time.delta_secs();
    }
}
```

Let me explain every piece.

### System Parameters

A Bevy system is just a Rust function. What makes it special is the **parameters**. Bevy automatically injects the right data based on the types in the function signature.

`keyboard: Res<ButtonInput<KeyCode>>` - `Res<T>` gives read-only access to a resource. `ButtonInput<KeyCode>` is Bevy's keyboard input resource. It tracks which keys are currently held down, which were just pressed this frame, and which were just released. We use `pressed(KeyCode::KeyW)` to check if a specific key is being held down right now.

`mut paddle_query: Query<(&mut Transform, &Paddle)>` - `Query` is how you find entities in the world. The type parameter `(&mut Transform, &Paddle)` means "give me mutable access to Transform and read-only access to Paddle, but only for entities that have BOTH of these components." Since both paddles have Transform and Paddle, this system processes both of them.

The `mut` before `paddle_query` is required because we asked for mutable access to component data. The `mut` inside `&mut Transform` means we can modify the position.

`time: Res<Time>` - the Time resource provides timing information. We use `delta_secs()`, the time in seconds since the last frame. This is crucial for smooth movement.
### Why Delta Time Matters
Here's the problem every new game developer encounters. On a 60 Hz monitor, your game runs 60 times per second. On a 144 Hz monitor, it runs 144 times per second. If you moved the paddle 10 pixels every frame:

- At 60 FPS: 600 pixels per second
- At 144 FPS: 1440 pixels per second

The game runs at a completely different speed on different monitors. This is called a **frame rate dependency bug**.

The fix is to multiply your movement by `delta_secs()`:
- At 60 FPS: delta = 0.0167 seconds. 500 * 0.0167 = 8.35 pixels per frame.
- At 144 FPS: delta = 0.0069 seconds. 500 * 0.0069 = 3.47 pixels per frame.

The per-frame movement is different, but over one second: 500 pixels in both cases. The game runs at the same speed regardless of monitor refresh rate. 
### Direction Logic
```rust
let mut direction = 0.0;
match paddle.side {
    Side::Left => {
        if keyboard.pressed(KeyCode::KeyW) { direction = 1.0; }
        if keyboard.pressed(KeyCode::KeyS) { direction = -1.0; }
    }
    Side::Right => {
        if keyboard.pressed(KeyCode::ArrowUp) { direction = 1.0; }
        if keyboard.pressed(KeyCode::ArrowDown) { direction = -1.0; }
    }
}
```

We check which side this paddle is on and which keys are held. `direction` is 1.0 for up (positive y), -1.0 for down (negative y), and 0.0 if no keys are pressed.

We use two separate `if` statements (not `if-else`) because both keys could be pressed simultaneously. If W and S are both held, `direction` gets set to 1.0 then immediately to -1.0. The last key check wins, in this case S takes priority. Not ideal (pressing both should cancel to zero), but functional enough for our first game.
### The Movement Formula

```rust
transform.translation.y += direction * paddle.speed * time.delta_secs();
```

We add to the y component of the transform's translation. Translation is the position. `direction * speed * delta` gives us pixels to move this frame.

### Registering the System

Add this to your `main` function:

```rust
.add_systems(Update, move_paddle)
```

`Update` means this system runs every frame, 60+ times per second.

Run it. You can now move the left paddle with W/S and the right paddle with Arrow Up/Down.
## Making the Ball Move

The ball movement system follows the exact same pattern:

```rust
fn move_ball(
    mut ball_query: Query<(&mut Transform, &Ball)>,
    time: Res<Time>,
) {
    for (mut transform, ball) in &mut ball_query {
        transform.translation += ball.velocity * time.delta_secs();
    }
}
```

The difference from the paddle system: instead of checking input and setting a direction, we just add the ball's velocity to its position every frame. Since the ball's velocity is `Vec3::new(300.0, 150.0, 0.0)`, it moves 300 pixels right and 150 pixels up per second.

Registration:

```rust
.add_systems(Update, (move_paddle, move_ball))
```

Using a tuple registers multiple systems in the same schedule.

Run it. The ball flies diagonally off-screen. We need walls.
## Bouncing Off Walls

The ball should bounce off the top and bottom of the window. Let's add collision detection:

```rust
fn bounce_ball(
    mut ball_query: Query<(&mut Transform, &mut Ball)>,
    window: Single<&Window, With<bevy::window::PrimaryWindow>>,
) {
    let half_height = window.height() / 2.0;
    let ball_radius = 5.0;

    for (mut transform, mut ball) in &mut ball_query {
        // Top wall
        if transform.translation.y + ball_radius >= half_height {
            transform.translation.y = half_height - ball_radius;
            ball.velocity.y = -ball.velocity.y;
        }
        // Bottom wall
        if transform.translation.y - ball_radius <= -half_height {
            transform.translation.y = -half_height + ball_radius;
            ball.velocity.y = -ball.velocity.y;
        }
    }
}
```

### Getting the Window

`window: Single<&Window, With<bevy::window::PrimaryWindow>>` this is a special system parameter that says "I need exactly one entity that matches these criteria." `Single<T, F>` is like `Query<T, F>` but it gives you the item directly instead of making you iterate. If zero or more than one entities match, the system panics. For the primary window, there's always exactly one.

`window.height()` returns the logical height of the window in pixels (600). Dividing by 2 gives us the distance from the center to the top edge (300).

`ball_radius = 5.0` our ball is 10x10 pixels, so its half-size (or "radius" for a square) is 5 pixels.

### The Collision Check

```rust
if transform.translation.y + ball_radius >= half_height {
```

This checks if the ball's top edge (center y + half its height) has reached or passed the top of the window. If the ball center is at y = 297 and we add the radius of 5, we get 302, which is >= 300. Collision detected.

When a collision happens, we do two things:

```rust
transform.translation.y = half_height - ball_radius;
ball.velocity.y = -ball.velocity.y;
```

First, we **snap the ball back inside** the play area. We set its y position to `half_height - ball_radius` = 300 - 5 = 295. This prevents the ball from getting stuck outside the wall.

You might ask: **why would it get stuck?** Imagine the ball is fast (say 600 pixels per second) and the frame rate drops to 30 FPS. The ball moves 20 pixels in one frame. If it was at y = 290 and moved 20 pixels up, it'd be at y = 310. Next frame, it's still past the wall, so it bounces again, reversing direction again. But it's still past the wall because it bounced back only 10 pixels. It vibrates in place. Snapping ensures this never happens.

Second, we reverse the Y velocity. If the ball was moving upward (+150), it now moves downward (-150).

The bottom wall check is the mirror: `transform.translation.y - ball_radius <= -half_height`.

Registration:

```rust
.add_systems(Update, (move_paddle, move_ball, bounce_ball))
```

Run it. The ball bounces off the top and bottom walls endlessly.

## Bouncing Off Paddles

Now the interesting part, making the ball bounce off the paddles. We'll use **AABB collision detection** (Axis-Aligned Bounding Box). This detects if two rectangles overlap.

```rust
fn check_paddle_collision(
    mut ball_query: Query<(&mut Transform, &mut Ball), Without<Paddle>>,
    paddle_query: Query<(&Transform, &Paddle), Without<Ball>>,
) {
    for (mut ball_transform, mut ball) in &mut ball_query {
        let ball_pos = ball_transform.translation.truncate();
        let ball_size = Vec2::new(10.0, 10.0);

        for (paddle_transform, _paddle) in &paddle_query {
            let paddle_pos = paddle_transform.translation.truncate();
            let paddle_size = Vec2::new(10.0, 100.0);

            // AABB collision check
            let overlap = !(
                ball_pos.x + ball_size.x / 2.0 < paddle_pos.x - paddle_size.x / 2.0
                || ball_pos.x - ball_size.x / 2.0 > paddle_pos.x + paddle_size.x / 2.0
                || ball_pos.y + ball_size.y / 2.0 < paddle_pos.y - paddle_size.y / 2.0
                || ball_pos.y - ball_size.y / 2.0 > paddle_pos.y + paddle_size.y / 2.0
            );

            if overlap {
                ball.velocity.x = -ball.velocity.x;
                if ball.velocity.x > 0.0 {
                    ball_transform.translation.x = paddle_pos.x + paddle_size.x / 2.0 + ball_size.x / 2.0;
                } else {
                    ball_transform.translation.x = paddle_pos.x - paddle_size.x / 2.0 - ball_size.x / 2.0;
                }
            }
        }
    }
}
```

### Disjoint Queries

```rust
mut ball_query: Query<(&mut Transform, &mut Ball), Without<Paddle>>,
paddle_query: Query<(&Transform, &Paddle), Without<Ball>>,
```

Both queries use `Without<T>` filters. `Without<Paddle>` on the ball query means "only match entities that don't have a Paddle component." `Without<Ball>` on the paddle query means the opposite.

Why? Because Bevy needs to prove that these two queries never access the same entity. If they could, we'd have a data race, one query mutably accessing Transform while another query also accesses it. The `Without` filters tell Bevy "these are completely separate groups of entities," so it can run them safely.

### How AABB Collision Works

Imagine two rectangles on screen. They overlap if they are **not separated along any axis**. A rectangle is separated from another if:

1. Its right edge is to the left of the other's left edge.
2. Its left edge is to the right of the other's right edge.
3. Its top edge is below the other's bottom edge.
4. Its bottom edge is above the other's top edge.

If any one of these is true, they don't overlap. If all four are false, they overlap.

Our check:

```rust
let overlap = !(
    ball_pos.x + ball_size.x / 2.0 < paddle_pos.x - paddle_size.x / 2.0
    || ball_pos.x - ball_size.x / 2.0 > paddle_pos.x + paddle_size.x / 2.0
    || ball_pos.y + ball_size.y / 2.0 < paddle_pos.y - paddle_size.y / 2.0
    || ball_pos.y - ball_size.y / 2.0 > paddle_pos.y + paddle_size.y / 2.0
);
```

`ball_pos.x + ball_size.x / 2.0` is the ball's right edge. `paddle_pos.x - paddle_size.x / 2.0` is the paddle's left edge. If the ball's right edge is to the left of the paddle's left edge, they're separated horizontally. We OR all four checks together and NOT the result.

### Collision Response

```rust
if overlap {
    ball.velocity.x = -ball.velocity.x;
    if ball.velocity.x > 0.0 {
        ball_transform.translation.x = paddle_pos.x + paddle_size.x / 2.0 + ball_size.x / 2.0;
    } else {
        ball_transform.translation.x = paddle_pos.x - paddle_size.x / 2.0 - ball_size.x / 2.0;
    }
}
```

When a collision happens, we reverse the ball's X direction. Then we snap the ball to the outside of the paddle. If the ball is moving right (velocity.x > 0), it hit the left side of the paddle, so we place it just to the right of the paddle's left edge. If moving left, we place it just to the left of the paddle's right edge.

The snap prevents the same problem as wall bouncing. Without it, the ball can get stuck inside the paddle, bouncing back and forth every frame until it wiggles through.

Registration:

```rust
.add_systems(Update, (move_paddle, move_ball, bounce_ball, check_paddle_collision))
```

Run it. You can now play Pong, the ball bounces off both paddles and the top/bottom walls.
## Adding a Score

A game of Pong is meaningless without keeping score. Let's add scoring and a display.
### Score Resource and Text Marker

Add these near your component definitions:

```rust
#[derive(Resource, Default)]
struct Score {
    left: u32,
    right: u32,
}

#[derive(Component)]
struct ScoreText;
```

`Score` is a **resource**, a singleton piece of data. Unlike components that belong to entities, resources are global. There's only one score in the game. `#[derive(Default)]` initializes both fields to 0.

`ScoreText` is an empty **marker component**. We'll attach it to the text entity so we can find it later with a query. Without this, we'd have no way to distinguish the score text from other text entities.

### Spawning the Score Display

Add this to your `setup` function:

```rust
commands.spawn((
    Text2d::new("0 - 0"),
    TextFont {
        font_size: 40.0,
        ..default()
    },
    TextColor(Color::WHITE),
    Transform::from_xyz(0.0, 250.0, 0.0),
    ScoreText,
));

commands.insert_resource(Score::default());
```

`Text2d::new("0 - 0")` in Bevy 0.18, text display uses the `Text2d` component (for text positioned in the 2D world). It wraps a `String`. The initial text shows "0 - 0".

`TextFont { font_size: 40.0, ..default() }` controls the font style. We set the size to 40 pixels and use the default font (Fira Mono, bundled with Bevy).

`TextColor(Color::WHITE)` makes the text white.

`Transform::from_xyz(0.0, 250.0, 0.0)` positions the text near the top of the screen. Our window is 600 pixels tall, so y = 300 is the top edge. We place it at y = 250 so it's near the top but not at the very edge.

`commands.insert_resource(Score::default())` inserts the Score resource into the world with both counters at 0.

### The Scoring System

```rust
fn score_goal(
    mut ball_query: Query<&mut Transform, With<Ball>>,
    mut score: ResMut<Score>,
    window: Single<&Window, With<bevy::window::PrimaryWindow>>,
    mut score_text: Query<&mut Text2d, With<ScoreText>>,
) {
    let width = window.width();
    let half_width = width / 2.0;

    for mut transform in &mut ball_query {
        if transform.translation.x > half_width + 10.0 {
            score.left += 1;
            transform.translation = Vec3::new(0.0, 0.0, 0.0);
        } else if transform.translation.x < -half_width - 10.0 {
            score.right += 1;
            transform.translation = Vec3::new(0.0, 0.0, 0.0);
        } else {
            continue;
        }

        for mut text in &mut score_text {
            text.0 = format!("{} - {}", score.left, score.right);
        }
    }
}
```

`ResMut<Score>`  `ResMut` gives mutable access to a resource. We need to modify the score counters.

`With<Ball>` we only want the ball entity, so we filter for entities that have a `Ball` component.

`Query<&mut Text2d, With<ScoreText>>` finds the text entity by its marker component.

The scoring logic:

```rust
if transform.translation.x > half_width + 10.0 {
    score.left += 1;
    ...
} else if transform.translation.x < -half_width - 10.0 {
    score.right += 1;
    ...
}
```

If the ball goes past the right edge (plus a 10-pixel buffer so it fully disappears), the **left** player scores the right player failed to return it. If it goes past the left edge, the **right** player scores.

After scoring, we reset the ball to the center. The ball keeps its current velocity, it doesn't restart from zero speed. In a later version, we'll randomize the restart direction.

```rust
text.0 = format!("{} - {}", score.left, score.right);
```

`text.0` accesses the inner `String` of the `Text2d` tuple struct. We update it with the current score.

Registration:

```rust
.add_systems(Update, (move_paddle, move_ball, bounce_ball, check_paddle_collision, score_goal))
```

Run it. Play a game. The score updates at the top of the screen whenever a player misses the ball.
## Deploying the Game to itch.io

Now let's build a web version of the game and upload it to itch.io so anyone can play it in their browser.

We'll use the [bevy_cli](https://github.com/TheBevyFlock/bevy_cli?utm_source=chatgpt.com) tool to build a WebAssembly version of the game.

First, install the wasm target:
```bash
rustup target add wasm32-unknown-unknown
```

Then install the Bevy CLI:
```bash
cargo install bevy_cli
```

Now build the web release:
```bash
bevy build --release web
```

This compiles the game into WebAssembly and generates the web runtime files.

After the build finishes, you'll find the generated files in:
```text
target/wasm32-unknown-unknown/web-release/
```

Inside that directory, you should see files similar to:
```text
bevy_pong.js
bevy_pong.wasm
bevy_pong_bg.wasm
```

However, this is not yet a complete website. We still need an `index.html` file that loads the game.

Create a file named `index.html` in the `web-release` directory:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <title>Bevy Pong</title>

  <style>
    body {
      margin: 0;
      overflow: hidden;
      background: black;
    }

    canvas {
      width: 100vw;
      height: 100vh;
      display: block;
    }
  </style>
</head>

<body>
  <script type="module">
    import init from "./bevy_pong.js";

    init();
  </script>
</body>
</html>
```

Your final directory should look like this:
```text
web-release/
├── index.html
├── bevy_pong.js
├── bevy_pong.wasm
├── bevy_pong_bg.wasm
└── assets/
```


One important thing: do **not** zip the entire `web-release` directory directly. It contains extra build artifacts like `deps`, `incremental`, and `build` folders that itch.io does not need.

Instead, create a clean deployment folder:
```bash
mkdir itch_build
```

Copy only the required runtime files:
```bash
cp target/wasm32-unknown-unknown/web-release/bevy_pong.js itch_build/

cp target/wasm32-unknown-unknown/web-release/bevy_pong.wasm itch_build/

cp target/wasm32-unknown-unknown/web-release/bevy_pong_bg.wasm itch_build/

cp target/wasm32-unknown-unknown/web-release/index.html itch_build/
```


Now create the zip:
```bash
cd itch_build
zip -r bevy_pong.zip .
```

The zip contents should look like this:
```text
bevy_pong.zip
├── index.html
├── bevy_pong.js
├── bevy_pong.wasm
├── bevy_pong_bg.wasm
└── assets/
```

Upload `bevy_pong.zip` to [itch.io](https://itch.io/?utm_source=chatgpt.com) and enable:
- "This file will be played in the browser"

Once uploaded, your game can run directly in the browser without players installing anything.

## Things We Could Improve
- Both the player paddles can be moved out of the viewport, you can take this as a mini challenge and fix this.
- Adding a simple sound whenever ball touches either paddle or walls

## Conclusion
This was a long one. I can go on and add other concepts as well but its already too long for our first article in this series. We have tons of chances to learn and reinforce our knowledge in future projects, so lets not worry about it. I hope you understood the overall basic concepts of Bevy and don't worry all these concepts will solidify in future with more and more projects.

In the next post, we'll work on building a flappy bird clone by using external free assets, add sounds and particle effects and some physics concepts too.

See you in the next one.
