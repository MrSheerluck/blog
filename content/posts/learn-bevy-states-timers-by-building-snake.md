+++
title = "Learn Bevy States, Timers, and Grid Movement by Building Snake"
description = "Build Snake from scratch using the Bevy game engine in Rust. Learn states, timers, grid movement and particle effects. Then deploy a playable web version to Itch.io."
date = 2026-05-30
transparent = true

[taxonomies]
tags = ["bevy", "gamedev", "rust"]
series = ["learning-bevy-by-building-projects"]

[extra]
hidden = true
+++





In this post, we are going to build **Snake**, the classic arcade game where you guide a growing snake to eat food while avoiding walls and yourself. If you read the Bevy Pong article, you already know the basics of ECS, queries, and resources. Now we level up.

We'll learn about **timers** for tick-based movement, **game states** to manage playing and game-over screens, **grid-based movement** that constrains objects to discrete positions, **movement queuing** so the snake doesn't accidentally reverse into itself, and **score tracking** with state transitions.

Get the full source code from [here](https://github.com/MrSheerluck/bevy-snake). Published game link is [here](https://mrsheerluck.itch.io/snake-with-bevy-engine).

### New Concepts

Before writing any code, let's understand the new ideas we haven't seen yet.

**Timers.** In Pong, the ball moved continuously every frame by adding `velocity * delta`. Snake is different. The snake moves one cell at a time at a fixed rate. It doesn't slide smoothly,  it teleports to the next cell every N milliseconds. This is called **tick-based** movement. Bevy provides a `Timer` type. You create it with a duration, call `tick(delta)` every frame, and when `just_finished()` returns true, it's time to move the snake. Reset and repeat.

**Game states.** Snake has two distinct modes: **playing** (the game is active) and **game over** (the player lost). In each mode, different systems should run. During game over, the snake shouldn't move and input should be different. Bevy's **state system** lets us define states and attach systems to specific ones. Only systems whose state matches the current state run.

**Grid coordinates.** Pong used continuous positions, the ball could be at x = 173.42 pixels. Snake uses a discrete grid. Every object sits on a `(col, row)` cell. We convert grid positions to world positions using a simple formula.

**Movement queuing.** Here is a classic Snake bug: the player presses Right then Down very quickly within one tick. If you change direction immediately, the snake goes right, then the same tick processes Down and the snake turns down. But what if the player pressed Left then Right? The snake reverses into itself and dies. We need to have a fix for this: a **queue** of directions. Each tick, pop one direction off the queue.

### Project Setup

Open your terminal and create a new Rust project:

```
cargo new bevy_snake
cd bevy_snake
```

Now open `Cargo.toml` and replace its contents with:

```toml
[package]
name = "bevy_snake"
version = "0.1.0"
edition = "2024"

[dependencies]
bevy = { version = "0.18", features = ["wav"] }
rand = "0.8"
```

We add `rand` because we need random positions for food. We enable the `wav` feature for Bevy audio support. We pin `rand` to `0.8` deliberately. Bevy 0.18's internal rand dependency was upgraded in 0.17 with breaking API changes, and `0.8` keeps our usage stable.

Now run:
```
cargo build
```

This will take a few minutes. Bevy is a large engine.
### The Skeleton: Constants and Window

Open `src/main.rs` and start with this:
```rust
use bevy::prelude::*;
use std::collections::VecDeque;

const GRID_WIDTH: i32 = 20;
const GRID_HEIGHT: i32 = 20;
const CELL_SIZE: f32 = 30.0;
const SNAKE_MOVE_INTERVAL: f32 = 0.15;

fn main() {
    App::new()
        .add_plugins(DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window {
                title: "Snake".into(),
                resolution: bevy::window::WindowResolution::new(600, 680),
                resizable: false,
                ..default()
            }),
            ..default()
        }))
        .add_systems(Startup, setup)
        .run();
}

fn setup(mut commands: Commands, asset_server: Res<AssetServer>) {
    commands.spawn(Camera2d);
}
```

Let me explain the constants.

`GRID_WIDTH` and `GRID_HEIGHT` are both 20, a 20x20 grid. `CELL_SIZE` is 30 pixels per cell. The play area is 20 * 30 = 600 pixels square. `SNAKE_MOVE_INTERVAL` is 0.15 seconds between each snake movement.

Note that `setup` takes `asset_server: Res<AssetServer>` from the start. We need it to load sound files, and Bevy injects it automatically as a system parameter.

Run `cargo run`. You should see a dark grey window.
### Grid Position Component

Every object in Snake lives on a discrete grid cell. Let's define a component for that:

```rust
#[derive(Component, Clone, Copy, PartialEq, Eq, Debug)]
struct GridPosition {
    col: i32,
    row: i32,
}
```

`#[derive(Component)]` registers it as a Bevy component. `Clone` and `Copy` let us pass it around easily. `PartialEq` lets us compare positions, we use that for collision detection.
### Direction and Helpers

Snake has four directions:

```rust
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Direction {
    Up,
    Down,
    Left,
    Right,
}
```

We also need a function to convert grid positions to world positions (pixels on screen):

```rust
fn grid_to_world(pos: GridPosition) -> Vec3 {
    let half_w = GRID_WIDTH as f32 * CELL_SIZE / 2.0;
    let half_h = GRID_HEIGHT as f32 * CELL_SIZE / 2.0;
    Vec3::new(
        pos.col as f32 * CELL_SIZE + CELL_SIZE / 2.0 - half_w,
        pos.row as f32 * CELL_SIZE + CELL_SIZE / 2.0 - half_h,
        0.0,
    )
}
```

The math: `col * CELL_SIZE` gives the left edge of the cell. Adding `CELL_SIZE / 2` centers us in the cell. Subtracting `half_w` shifts the whole grid so the center of the screen is the center of the grid. Cell `(10, 10)` is right in the middle.
### Marker Components

Add these marker components to tag entities so we can find them in queries:

```rust
#[derive(Component)]
struct SnakeSegment;

#[derive(Component)]
struct FoodSprite;

#[derive(Component)]
struct ScoreText;

#[derive(Component)]
struct GameOverText;

#[derive(Component)]
struct ScorePop(Timer);

#[derive(Component)]
struct Particle {
    velocity: Vec2,
    lifetime: Timer,
}
```

These are the same pattern as `ScoreText` in Pong, empty structs (or small structs) that act as labels or lightweight state on entities. `ScorePop` and `Particle` carry per-entity timer and physics data rather than living in a global resource, because multiple of them can exist simultaneously.
### Resources

The game data lives in resources. In Pong we had a `Score` resource. Snake needs more:

```rust
#[derive(Resource)]
struct Snake {
    segments: Vec<GridPosition>,
    direction: Direction,
}

#[derive(Resource)]
struct Food(GridPosition);

#[derive(Resource)]
struct MoveTimer(Timer);

#[derive(Resource)]
struct DirectionQueue(VecDeque<Direction>);

#[derive(Resource)]
struct Score(u32);

#[derive(Resource)]
struct ScreenShake(Timer);

#[derive(Resource)]
struct EatSound(Handle<AudioSource>);

#[derive(Resource)]
struct DieSound(Handle<AudioSource>);
```

Let me explain each one.

**`Snake`** holds the logical state of the snake. `segments` is a `Vec<GridPosition>` where index 0 is the head. `direction` is which way the snake is currently moving.

**`Food`** is a newtype around a single `GridPosition`. Where the food sits on the grid.

**`MoveTimer`** wraps a Bevy `Timer`. We tick it every frame. When it finishes, the snake moves one cell.

**`DirectionQueue`** wraps a `VecDeque<Direction>`. When the player presses a key, we push onto this queue. Each tick, we pop one direction off.

**`Score`** is the player's score. Starts at 0.

**`ScreenShake`** wraps a `Timer`. When the player dies, we reset it. While it runs, `apply_screenshake` offsets the camera randomly each frame.

**`EatSound`** and **`DieSound`** hold handles to loaded audio assets. We load them once in `setup` and clone the handle whenever we want to play them.
### Game State

Add this to define our two game modes:

```rust
#[derive(States, Default, Clone, Eq, PartialEq, Hash, Debug)]
enum GameState {
    #[default]
    Playing,
    GameOver,
}
```

`#[derive(States)]` tells Bevy this enum defines game states. `#[default]` on `Playing` means the game starts in Playing mode.

Register it in `main()`:

```rust
fn main() {
    App::new()
        .add_plugins(DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window {
                title: "Snake".into(),
                resolution: bevy::window::WindowResolution::new(600, 680),
                resizable: false,
                ..default()
            }),
            ..default()
        }))
        .init_state::<GameState>()
        .add_systems(Startup, setup)
        .run();
}
```

### Random Position for Food

We need a way to generate random grid positions for food. We'll also need to avoid spawning food on top of the snake:

```rust
fn random_grid_position() -> GridPosition {
    GridPosition {
        col: rand::random::<i32>().rem_euclid(GRID_WIDTH),
        row: rand::random::<i32>().rem_euclid(GRID_HEIGHT),
    }
}

fn spawn_food_on_empty(snake: &Snake) -> GridPosition {
    loop {
        let pos = random_grid_position();
        if !snake.segments.contains(&pos) {
            return pos;
        }
    }
}
```

`rand::random::<i32>()` generates a random i32. `rem_euclid(GRID_WIDTH)` wraps it into (0, 20). The loop retries until it finds an empty cell that the snake does not occupy.
### The Setup System

Now the full `setup` function that spawns everything:

```rust
fn setup(mut commands: Commands, asset_server: Res<AssetServer>) {
    // Load sounds
    commands.insert_resource(EatSound(asset_server.load("audio/eat.wav")));
    commands.insert_resource(DieSound(asset_server.load("audio/die.wav")));

    // Initialize the screenshake timer as already finished so it doesn't
    // fire on startup. We reset it manually when the player dies.
    commands.insert_resource(ScreenShake({
        let mut t = Timer::from_seconds(0.3, TimerMode::Once);
        t.finish();
        t
    }));

    commands.spawn(Camera2d);

    // Initial snake: 3 segments in the center
    let start_col = GRID_WIDTH / 2;
    let start_row = GRID_HEIGHT / 2;

    let snake = Snake {
        segments: vec![
            GridPosition { col: start_col, row: start_row },
            GridPosition { col: start_col - 1, row: start_row },
            GridPosition { col: start_col - 2, row: start_row },
        ],
        direction: Direction::Right,
    };

    // Spawn one sprite per segment
    for &pos in &snake.segments {
        commands.spawn((
            SnakeSegment,
            Sprite::from_color(Color::srgb(0.2, 0.8, 0.2), Vec2::splat(CELL_SIZE - 2.0)),
            Transform::from_translation(grid_to_world(pos)),
        ));
    }
    commands.insert_resource(snake);

    // Food
    let food_pos = GridPosition { col: 15, row: 10 };
    commands.spawn((
        FoodSprite,
        Sprite::from_color(Color::srgb(0.8, 0.2, 0.2), Vec2::splat(CELL_SIZE - 2.0)),
        Transform::from_translation(grid_to_world(food_pos)),
    ));
    commands.insert_resource(Food(food_pos));

    // Timer, queue, score
    commands.insert_resource(MoveTimer(
        Timer::from_seconds(SNAKE_MOVE_INTERVAL, TimerMode::Repeating),
    ));
    commands.insert_resource(DirectionQueue(VecDeque::new()));
    commands.insert_resource(Score(0));

    // Score text at top of screen
    commands.spawn((
        ScoreText,
        Text2d::new("Score: 0"),
        TextFont {
            font_size: 30.0,
            ..default()
        },
        TextColor(Color::WHITE),
        Transform::from_xyz(0.0, 290.0, 0.0),
    ));
}
```

Let me walk through the key parts.

The snake starts at the center with 3 segments: `(10, 10)`, `(9, 10)`, `(8, 10)` heading right. We spawn a green `Sprite::from_color` for each segment. `Vec2::splat(CELL_SIZE - 2.0)` makes each segment 28x28 pixels, with a 1 pixel gap on each side so segments don't bleed into each other.

Food is placed at `(15, 10)` on the right side of the grid. Red sprite.

The timer is `Timer::from_seconds(0.15, TimerMode::Repeating)`. It loops every 0.15 seconds. Each time it completes, the snake moves.

The `ScreenShake` timer is initialized with `t.finish()` called immediately after creation. This puts it in a completed state from the start. If we didn't do this, `apply_screenshake` would see a freshly-started timer on frame one and shake the camera for 0.3 seconds before any death has occurred. The timer only matters after we call `shake.0.reset()` on death.

The score text uses `Text2d`, `TextFont`, `TextColor`, same pattern as Pong. Positioned at `y = 320`, near the top of the grid.

Run `cargo run`. You should see a 3-segment green snake in the center, a red food square on the right, and "Score: 0" at the top. Nothing moves yet.

### Snake Input

Now we add movement. First, the input system. Arrow keys queue direction changes:

```rust
fn snake_input(
    keyboard: Res<ButtonInput<KeyCode>>,
    mut queue: ResMut<DirectionQueue>,
) {
    if keyboard.just_pressed(KeyCode::ArrowUp) {
        queue.0.push_back(Direction::Up);
    } else if keyboard.just_pressed(KeyCode::ArrowDown) {
        queue.0.push_back(Direction::Down);
    } else if keyboard.just_pressed(KeyCode::ArrowLeft) {
        queue.0.push_back(Direction::Left);
    } else if keyboard.just_pressed(KeyCode::ArrowRight) {
        queue.0.push_back(Direction::Right);
    }
}
```

We use `just_pressed` (not `pressed`) so each key press adds exactly one entry to the queue. Holding a key down does not spam the queue.
### Opposite Direction Check

The snake should not reverse into itself:

```rust
fn is_opposite(a: Direction, b: Direction) -> bool {
    matches!(
        (a, b),
        (Direction::Up, Direction::Down)
            | (Direction::Down, Direction::Up)
            | (Direction::Left, Direction::Right)
            | (Direction::Right, Direction::Left)
    )
}
```

`matches!` is a Rust macro that checks if a value matches a pattern.
### Snake Movement

This is the core logic that runs on each timer tick:

```rust
fn snake_move(
    mut commands: Commands,
    time: Res<Time>,
    mut timer: ResMut<MoveTimer>,
    mut snake: ResMut<Snake>,
    mut queue: ResMut<DirectionQueue>,
    mut food: ResMut<Food>,
    mut score: ResMut<Score>,
    mut next_state: ResMut<NextState<GameState>>,
    eat_sound: Res<EatSound>,
) {
    // Advance the timer. Exit if it hasn't finished yet.
    if !timer.0.tick(time.delta()).just_finished() {
        return;
    }

    // Pop the next direction from the queue, if any
    while let Some(next_dir) = queue.0.pop_front() {
        if !is_opposite(next_dir, snake.direction) {
            snake.direction = next_dir;
            break;
        }
    }

    // Calculate the new head position
    let head = snake.segments[0];
    let new_head = match snake.direction {
        Direction::Up => GridPosition {
            col: head.col,
            row: head.row + 1,
        },
        Direction::Down => GridPosition {
            col: head.col,
            row: head.row - 1,
        },
        Direction::Left => GridPosition {
            col: head.col - 1,
            row: head.row,
        },
        Direction::Right => GridPosition {
            col: head.col + 1,
            row: head.row,
        },
    };

    // Wall collision
    if new_head.col < 0
        || new_head.col >= GRID_WIDTH
        || new_head.row < 0
        || new_head.row >= GRID_HEIGHT
    {
        next_state.set(GameState::GameOver);
        return;
    }

    // Self collision
    if snake.segments.contains(&new_head) {
        next_state.set(GameState::GameOver);
        return;
    }

    // Move: insert new head at the front
    snake.segments.insert(0, new_head);

    // Check if the snake ate the food
    if new_head == food.0 {
        score.0 += 1;
        commands.spawn(AudioPlayer(eat_sound.0.clone()));
        spawn_eat_particles(&mut commands, grid_to_world(new_head));
        food.0 = spawn_food_on_empty(&snake);
        // Don't remove the tail, snake grows
    } else {
        snake.segments.pop(); // Remove tail
    }
}
```

Let me explain the most important parts.

**System parameters.** `snake_move` takes `mut commands: Commands` and `eat_sound: Res<EatSound>` because eating food both plays a sound and spawns particles, both require `commands`. Bevy injects all system parameters automatically; you just declare what you need.

**Timer tick.** `timer.0.tick(time.delta())` advances the timer by the frame's delta time. `.just_finished()` returns true exactly once when the timer reaches its duration. On that frame, the snake moves. The timer is `Repeating`, so it resets automatically.

**Queue processing.** The `while` loop pops directions from the front of the queue until it finds one that is not opposite to the current direction. The `break` after a valid direction means only one turn per tick. The check is against `snake.direction`, the direction the snake is _currently moving_, not the last queued direction.

**New head position.** The head moves one cell in the current direction. `Up` increases `row`, `Down` decreases it. `Left` and `Right` change `col`.

**Wall collision.** If the new head is outside the 20x20 grid, game over.

**Self collision.** `.contains(&new_head)` checks if the new head overlaps any existing segment. If yes, game over.

**Food check.** If the head landed on the food cell, the score increases, a sound plays, particles burst, the food respawns, and the tail is NOT removed, the snake grows by one. Otherwise, the tail is popped off.
### Sync Sprites

The `snake_move` system updates the logical positions. Now we need to update the visual sprites to match. The simplest approach: despawn all old sprites and spawn new ones at the current positions:

```rust
fn sync_sprites(
    mut commands: Commands,
    snake: Res<Snake>,
    food: Res<Food>,
    segments: Query<Entity, With<SnakeSegment>>,
    food_sprites: Query<Entity, With<FoodSprite>>,
) {
    // Despawn old segment sprites
    for entity in &segments {
        commands.entity(entity).despawn();
    }
    // Despawn old food sprite
    for entity in &food_sprites {
        commands.entity(entity).despawn();
    }

    // Spawn new segment sprites
    for (i, &pos) in snake.segments.iter().enumerate() {
        let color = if i == 0 {
            Color::srgb(0.0, 0.95, 0.0) // Head: bright green
        } else {
            Color::srgb(0.2, 0.7, 0.2) // Body: darker green
        };
        commands.spawn((
            SnakeSegment,
            Sprite::from_color(color, Vec2::splat(CELL_SIZE - 2.0)),
            Transform::from_translation(grid_to_world(pos)),
        ));
    }

    // Spawn new food sprite
    commands.spawn((
        FoodSprite,
        Sprite::from_color(Color::srgb(0.9, 0.2, 0.2), Vec2::splat(CELL_SIZE - 2.0)),
        Transform::from_translation(grid_to_world(food.0)),
    ));
}
```

We despawn entities by querying for their marker components and calling `commands.entity(entity).despawn()`. We make the head bright green and the body darker green so the player can see which end is which. This despawn-and-respawn approach is simple and correct for a game this size.
### Score Text Update

```rust
fn update_score_text(
    score: Res<Score>,
    mut query: Query<&mut Text2d, With<ScoreText>>,
    mut commands: Commands,
) {
    for mut text in &mut query {
        let old = text.0.clone();
        text.0 = format!("Score: {}", score.0);
        if old != text.0 {
            commands.spawn((
                ScorePop(Timer::from_seconds(0.3, TimerMode::Once)),
                Text2d::new(text.0.clone()),
                TextFont {
                    font_size: 44.0,
                    ..default()
                },
                TextColor(Color::srgb(1.0, 1.0, 0.3)),
                Transform::from_xyz(0.0, 290.0, 2.0),
            ));
        }
    }
}
```

`text.0` accesses the inner `String` of `Text2d`. We compare the old value to the new value. If they differ, the score just changed and we spawn a `ScorePop` entity, a larger yellow version of the score text that floats upward and fades. The `commands` parameter is needed here for that spawn.
### Score Pop Animation

```rust
fn update_score_pop(
    mut commands: Commands,
    time: Res<Time>,
    mut pops: Query<(Entity, &mut ScorePop, &mut Transform, &mut TextColor)>,
) {
    for (entity, mut pop, mut transform, mut color) in &mut pops {
        pop.0.tick(time.delta());
        if pop.0.is_finished() {
            commands.entity(entity).despawn();
            continue;
        }
        let t = pop.0.fraction_remaining();
        transform.translation.y = 290.0 + (1.0 - t) * 30.0;
        color.0.set_alpha(t);
    }
}
```

`fraction_remaining()` goes from 1.0 at the start of the timer down to 0.0 at the end. We use it for both alpha (fades out) and to drive the upward float. When `t = 1.0` (just spawned), `y = 290.0 + 0.0 * 30.0 = 290.0`. When `t = 0.0` (about to despawn), `y = 290.0 + 1.0 * 30.0 = 320.0`. So the text floats 30 pixels upward while fading.

### Game Over and Restart

When the game is over, we show a message and wait for Enter:

```rust
fn game_over_restart(
    keyboard: Res<ButtonInput<KeyCode>>,
    mut next_state: ResMut<NextState<GameState>>,
    mut snake: ResMut<Snake>,
    mut food: ResMut<Food>,
    mut score: ResMut<Score>,
    mut timer: ResMut<MoveTimer>,
    mut queue: ResMut<DirectionQueue>,
) {
    if !keyboard.just_pressed(KeyCode::Enter) {
        return;
    }

    // Reset everything
    let start_col = GRID_WIDTH / 2;
    let start_row = GRID_HEIGHT / 2;
    snake.segments = vec![
        GridPosition { col: start_col, row: start_row },
        GridPosition { col: start_col - 1, row: start_row },
        GridPosition { col: start_col - 2, row: start_row },
    ];
    snake.direction = Direction::Right;
    food.0 = GridPosition { col: 15, row: 10 };
    score.0 = 0;
    timer.0.reset();
    queue.0.clear();

    next_state.set(GameState::Playing);
}
```

The game over screen is shown and hidden via `OnEnter` and `OnExit`:

```rust
fn show_game_over(
    mut commands: Commands,
    die_sound: Res<DieSound>,
    mut shake: ResMut<ScreenShake>,
) {
    commands.spawn(AudioPlayer(die_sound.0.clone()));
    shake.0.reset();
    commands.spawn((
        GameOverText,
        Text2d::new("Game Over\nPress Enter to Restart"),
        TextFont {
            font_size: 40.0,
            ..default()
        },
        TextColor(Color::srgb(1.0, 0.2, 0.2)),
        Transform::from_xyz(0.0, 0.0, 1.0),
    ));
}

fn hide_game_over(mut commands: Commands, query: Query<Entity, With<GameOverText>>) {
    for entity in &query {
        commands.entity(entity).despawn();
    }
}
```

`show_game_over` does three things: plays the death sound, resets the screenshake timer (which triggers the camera shake), and spawns the game over text. `hide_game_over` despawns it when the player restarts.
### Polish: Particle Burst on Eat

When the snake eats, we spawn 10 small yellow particles that fly outward and fade:

```rust
fn spawn_eat_particles(commands: &mut Commands, position: Vec3) {
    for _ in 0..10 {
        let angle = rand::random::<f32>() * std::f32::consts::TAU;
        let speed = 60.0 + rand::random::<f32>() * 80.0;
        commands.spawn((
            Particle {
                velocity: Vec2::new(angle.cos() * speed, angle.sin() * speed),
                lifetime: Timer::from_seconds(0.6, TimerMode::Once),
            },
            Sprite::from_color(Color::srgb(1.0, 0.9, 0.2), Vec2::splat(5.0)),
            Transform::from_translation(position),
        ));
    }
}
```

`TAU` is 2π, a full circle in radians. Multiplying a random float by `TAU` gives a random angle. `angle.cos()` and `angle.sin()` give the x and y components of a unit vector in that direction, scaled by `speed`. Each particle gets its own `lifetime` timer. This is why `Particle` is a component rather than a resource, many particles can exist simultaneously, each with independent state.

A separate system updates particles each frame:

```rust
fn update_particles(
    mut commands: Commands,
    time: Res<Time>,
    mut particles: Query<(Entity, &mut Particle, &mut Transform, &mut Sprite)>,
) {
    for (entity, mut particle, mut transform, mut sprite) in &mut particles {
        particle.lifetime.tick(time.delta());
        if particle.lifetime.is_finished() {
            commands.entity(entity).despawn();
            continue;
        }
        let t = particle.lifetime.fraction_remaining();
        transform.translation.x += particle.velocity.x * time.delta_secs();
        transform.translation.y += particle.velocity.y * time.delta_secs();
        sprite.color.set_alpha(t);
        transform.scale = Vec3::splat(0.5 + t * 0.5);
    }
}
```

`t` goes from 1.0 to 0.0 as the particle ages. Alpha fades from 1.0 to 0.0. Scale goes from `0.5 + 1.0 * 0.5 = 1.0` down to `0.5 + 0.0 * 0.5 = 0.5`, so particles shrink slightly as they die.
### Polish: Screen Shake on Death

When the player dies, the camera shakes briefly:

```rust
fn apply_screenshake(
    mut shake: ResMut<ScreenShake>,
    mut camera: Query<&mut Transform, With<Camera2d>>,
    time: Res<Time>,
) {
    shake.0.tick(time.delta());
    for mut transform in &mut camera {
        if shake.0.is_finished() {
            if transform.translation != Vec3::ZERO {
                transform.translation = Vec3::ZERO;
            }
        } else {
            let intensity = 10.0 * (1.0 - shake.0.fraction());
            transform.translation = Vec3::new(
                rand::random::<f32>() * 2.0 * intensity - intensity,
                rand::random::<f32>() * 2.0 * intensity - intensity,
                0.0,
            );
        }
    }
}
```

`shake.0.fraction()` goes from 0.0 to 1.0 as time passes, so `1.0 - fraction()` starts at 1.0 and decays to 0.0. Multiplying by 10.0 gives a starting intensity of 10 pixels that eases to zero. When finished, the camera is snapped back to `Vec3::ZERO`. Because the timer starts pre-finished (we called `t.finish()` in setup), this system runs every frame doing nothing until a death occurs and `shake.0.reset()` is called.
### Register Everything

The final `main` function ties it all together:

```rust
fn main() {
    App::new()
        .add_plugins(DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window {
                title: "Snake".into(),
                resolution: bevy::window::WindowResolution::new(600, 680),
                resizable: false,
                ..default()
            }),
            ..default()
        }))
        .init_state::<GameState>()
        .add_systems(Startup, setup)
        .add_systems(OnEnter(GameState::GameOver), show_game_over)
        .add_systems(OnExit(GameState::GameOver), hide_game_over)
        .add_systems(
            Update,
            (
                snake_input,
                snake_move.run_if(in_state(GameState::Playing)),
                sync_sprites,
                update_score_text,
                update_score_pop,
                update_particles,
                apply_screenshake,
                game_over_restart.run_if(in_state(GameState::GameOver)),
            ),
        )
        .run();
}
```

Run `cargo run`. You should now have a fully polished Snake game:

- Steer with arrow keys. Eat food to grow and score points.
- Eat food -> hear a rising beep, yellow particles burst, score pops up bigger.
- Hit a wall or yourself -> hear a low tone, screen shakes, "Game Over" appears.
- Press Enter to restart.
### Deploying to Itch.io

Let's build a web version and publish it to itch.io.

Before building for the web, add this to your `Cargo.toml` after the `[dependencies]` block:

```toml
[target.'cfg(all(target_family = "wasm", any(target_os = "unknown", target_os = "none")))'.dependencies]
getrandom_02 = { version = "^0.2", features = ["js"], package = "getrandom" }
getrandom_03 = { version = "^0.3", features = ["wasm_js"], package = "getrandom" }
```

`rand` uses `getrandom` internally to access the system's entropy source. On native, this is straightforward. On `wasm32-unknown-unknown`, there is no OS, so `getrandom` needs to be told to use the browser's `crypto.getRandomValues()` API instead. Without this, `rand::random()` panics at runtime in the browser. The `cfg` target triple ensures these entries only apply to WASM builds and have no effect on native.

First, install the wasm target:

```
rustup target add wasm32-unknown-unknown
```

Install the Bevy CLI. It is not yet published to crates.io so install it from git:

```
cargo install --git https://github.com/TheBevyFlock/bevy_cli --locked bevy_cli
```

Build and bundle the web release:

```
bevy build --release web --bundle
```

The `--bundle` flag collects the wasm binary, JS bindings, and assets into a single folder at:

```
target/bevy_web/
```

That folder is self-contained. Create a zip from it:

```
cd target/bevy_web
zip -r ../../bevy_snake.zip .
```

Upload `bevy_snake.zip` to [itch.io](https://itch.io/) and enable "This file will be played in the browser".
### Things We Could Improve

- The food always spawns in random positions. It could prefer the area ahead of the snake for more interesting gameplay.
- We could add difficulty progression: the snake moves faster as the score increases.
- High score persistence with local storage.
- A proper title screen with settings (volume sliders, fullscreen toggle).
### Conclusion

You now understand how game states work in Bevy, how timers drive tick-based movement, how grid coordinates power tile-based games, and how to queue inputs to prevent unfair deaths. You also learned how to bake polish into every system like particles, screenshake, audio, and animations.

In the next post, we will build Breakout and learn about collision groups, sprite sheet animations, power-up drops, and tween-style animations. See you soon!
