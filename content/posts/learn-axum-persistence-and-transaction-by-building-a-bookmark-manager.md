+++
title = "Learn Axum Persistence and Transactions with SQLx by Building a Bookmark Manager"
description = "In this post, we are going to build a Bookmark manager API with PostgreSQL"
date = 2026-07-15
transparent = true

[taxonomies]
tags = ["rust", "backend", "axum"]
series = ["backend-engineering-with-axum"]
+++


In Part 1 and Part 2, we built a URL shortener and a Pastebin API. Both had the same limitation: data lived in a `HashMap` wrapped in `Arc<RwLock<...>>`. Restart the server, everything disappears. That was intentional. We were learning routing, extractors, and error handling, persistence would have been a distraction.

![Axum Bookmark Manager](/images/axum-bookmark-manager.png)

In this post, we are going to fix that. We will replace the `HashMap` with PostgreSQL and SQLx. Adding a real database introduces connection pooling, schema design, migrations, compile-time-checked queries, joins, pagination, the N+1 query trap, explicit transactions, and isolation levels. Every one of these concepts matters in production, and every one of them is easier to learn in a single-service project than under the pressure of a distributed system.

Let's start, I can't wait.

Get the source code from [here](https://github.com/MrSheerluck/rust-bookmark-manager-api)

## The Problem with In-Memory Storage

The `HashMap` we used in Parts 1 and 2 has three problems. First, data is lost on restart. Second, capacity is bounded by available RAM. Third, and most subtly, there is no transactional safety. In Part 2, we created a paste by inserting it into a map. That operation is atomic only because `HashMap::insert` is a single method call. The moment you have a multi-step operation like "create a bookmark and attach three tags" and the third tag insertion fails, you have a bookmark in the map with two orphaned tags and no way to undo the first two inserts.

Real persistence solves all three: durability (survives restarts), scalability (data lives on disk, not in RAM), and atomicity (all-or-nothing multi-step operations via transactions).

## What is SQLx?

SQLx is a Rust crate for talking to SQL databases. It is async-native (built on Tokio), supports PostgreSQL, MySQL, and SQLite, and provides connection pooling. But its defining feature, the one that matters to this article is **compile-time checking of SQL queries**.

In most ORMs and query builders, a typo in a column name or a type mismatch between a Rust struct and a SQL column is a runtime error. You write `SELECT tite FROM bookmarks`, deploy to production, and find out when the first request hits that endpoint and panics. SQLx validates those queries during compilation. It parses every SQL string in `query!` and `query_as!` and verifies it against either a live database schema or the cached metadata in the `.sqlx/` directory. If a column is missing, the types don't match, or the SQL is invalid, compilation fails before the application ever runs.

`cargo sqlx prepare` connects to your database and generates query metadata in the `.sqlx/` directory. During offline compilation, the macros read this metadata instead of connecting to a live database. This allows SQL queries to remain compile-time checked even in CI environments without database access. If a column is missing, `cargo build` fails with a clear message pointing to the exact query and the exact mismatch. For queries written with SQLx's checked macros, typos and schema mismatches are caught before the application is built.

> **Why not an ORM like Diesel?** SQLx is deliberately *not* an ORM. It does not generate SQL from Rust structs. You write raw SQL in macros, and SQLx checks it for you. This gives you full control over the SQL joins, window functions, CTEs while still catching mistakes at compile time. If you prefer ORMs, Diesel is the go-to in Rust. This series uses SQLx because the goal is to learn backend engineering, and I want you to understand the SQL that your application is actually running.

## Connection Pooling

A connection pool is a cache of open database connections. Creating a new TCP connection to Postgres for every request is slow, TLS handshakes, authentication, and session setup take milliseconds. A pool keeps a set of connections open and ready, handing one to each request that needs it and returning it when the request is done.

SQLx provides `PgPool` for this:

```rust
let pool = PgPoolOptions::new()
    .max_connections(10)
    .connect(&database_url)
    .await?;
```

`max_connections(10)` limits the pool to 10 simultaneous connections. Every request handler can call `pool.acquire()` to get a connection from the pool. If all 10 are in use, the 11th request waits until one is returned. Acquiring a connection from the pool is much cheaper than establishing a new database connection because the TCP connection, authentication, and session setup have already been completed.

The pool itself is cheap to clone. `PgPool` wraps an `Arc<PoolInner>`, so cloning it just increments a reference count exactly like cloning an `Arc`. This means you can put the pool directly in your `AppState` and use `#[derive(Clone)]` on the state struct without wrapping the pool in an extra `Arc`:

```rust
#[derive(Clone)]
struct AppState {
    pool: PgPool,  // no Arc needed, PgPool is already Arc inside
}
```

## Database Migrations

A schema changes over time. You add a `description` column to `bookmarks`, or an index on `created_at`. These changes are called migrations. SQLx provides a CLI for managing them:

```
cargo install sqlx-cli --no-default-features --features postgres
sqlx migrate add initial_schema
```

This creates a file in `migrations/` with a timestamp prefix. You write your SQL in that file, and then:

```
sqlx migrate run
```

This applies any unapplied migrations to your database. SQLx tracks which migrations have been run in a `_sqlx_migrations` table, so it never applies the same migration twice.

Our application also runs migrations at startup via `sqlx::migrate!("./migrations").run(&pool)`. This keeps the schema synchronized with the application during development. Some production deployments instead run migrations as a separate deployment step before starting the application.

## Project Setup

We need PostgreSQL. The simplest way is Docker:

```
docker compose up -d
```

Create a `docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: bookmark_db
    restart: unless-stopped
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: bookmark
      POSTGRES_PASSWORD: bookmark
      POSTGRES_DB: bookmark
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

This gives us Postgres 16 on port 5432, with a `bookmark` database, user, and password. The `pgdata` volume persists data across container restarts.

Create a `.env` file for SQLx:

```
DATABASE_URL=postgres://bookmark:bookmark@localhost:5432/bookmark
```

Create the project:

```
cargo new bookmark_manager
cd bookmark_manager
```

Open `Cargo.toml`:

```toml
[package]
name = "bookmark_manager"
version = "0.1.0"
edition = "2024"

[dependencies]
axum = "0.8"
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
sqlx = { version = "0.8", features = ["runtime-tokio", "tls-rustls", "postgres", "migrate", "chrono", "uuid"] }
uuid = { version = "1", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
dotenvy = "0.15"
```

The new dependencies worth explaining:

- `sqlx` with five features: `runtime-tokio` (async runtime), `tls-rustls` (TLS for secure connections), `postgres` (database driver), `migrate` (run migrations from code), and `chrono` + `uuid` (type support for `DateTime<Utc>` and `Uuid` columns). Without the `chrono` feature, SQLx wouldn't know how to read a `TIMESTAMPTZ` column into Rust's `DateTime<Utc>`.
- `dotenvy` loads the `.env` file at startup so `DATABASE_URL` is available as an environment variable.
- `uuid` now has the `serde` feature in addition to `v4` for serializing/deserializing UUIDs in JSON.

Install `sqlx-cli` and prepare the offline query cache:

```
cargo install sqlx-cli --no-default-features --features postgres
cargo sqlx prepare
```

The `prepare` command connects to your database, extracts the current schema, and generates a `.sqlx/` directory with cached query metadata. This is what the compiler uses to check your SQL. You should commit the `.sqlx/` directory to version control. It contains the metadata SQLx uses to verify queries during offline compilation, allowing CI to build the project without requiring a running database.

## The Schema

Create `migrations/20260712000000_initial_schema.sql`:

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE bookmarks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE bookmark_tags (
    bookmark_id UUID NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (bookmark_id, tag_id)
);

CREATE INDEX idx_bookmarks_created_at ON bookmarks(created_at DESC);
CREATE INDEX idx_bookmark_tags_bookmark_id ON bookmark_tags(bookmark_id);
CREATE INDEX idx_bookmark_tags_tag_id ON bookmark_tags(tag_id);
```

Now, let me explain each table and the design decisions.

### bookmarks

The core entity. Each row has a UUID primary key, a URL (the thing we are bookmarking), a title, an optional description, and two timestamps. `UUID` primary keys have two advantages over auto-incrementing integers in an API: they are unguessable (no sequential IDs to enumerate), and they can be generated client-side or server-side without coordination.

`uuid_generate_v4()` generates a random (v4) UUID. This requires the `uuid-ossp` extension, enabled at the top of the migration. Random UUIDs are slightly slower to insert than sequential identifiers because they fragment B-tree indexes. For many web applications this overhead is acceptable, while write-heavy systems often prefer sequential identifiers or newer UUID variants such as UUIDv7.

### tags

Tags are shared across bookmarks. A tag like `rust` can be attached to many bookmarks. The `name` column has a `UNIQUE` constraint, you cannot insert the same tag name twice. This constraint is essential because without it, two concurrent requests could create duplicate `rust` rows in the `tags` table, and the `bookmark_tags` junction table would then reference two different rows for what should be the same tag.

### bookmark_tags

This is the **junction table** (also called a join table, association table, or linking table). It models the many-to-many relationship between bookmarks and tags. One bookmark can have many tags. One tag can be attached to many bookmarks. A relational database cannot represent this directly with a foreign key in either table, you need a third table that pairs them.

Each row in `bookmark_tags` is a pair of foreign keys: `bookmark_id` references `bookmarks(id)`, and `tag_id` references `tags(id)`. The composite primary key `(bookmark_id, tag_id)` ensures you can never attach the same tag to the same bookmark twice. `ON DELETE CASCADE` on both foreign keys means deleting a bookmark automatically removes all its tag associations, and deleting a tag removes all its associations.

### Indexes

Three indexes, designed for our access patterns:

- `idx_bookmarks_created_at` supports the `ORDER BY created_at DESC` used in the list endpoint. Without this index, Postgres would sort the entire `bookmarks` table on every request.
- `idx_bookmark_tags_bookmark_id` supports the `WHERE bt.bookmark_id = $1` join used to fetch tags for a bookmark.
- `idx_bookmark_tags_tag_id` supports the `WHERE t.name = $1` join used to filter bookmarks by tag.

Indexes are a trade-off: they speed up reads at the cost of slower writes (every insert must also update the index) and additional disk usage. For this application, reads are far more common than writes, users browse their bookmarks more often than they create new ones so the indexes are worth it.

## The Project: Bookmark Manager

Our program will:

- Accept `POST /bookmarks` with a JSON body containing a URL, title, optional description, and optional tags
- Create the bookmark and attach any tags in a single transaction
- Accept `GET /bookmarks` with optional `?page=`, `?per_page=`, and `?tag=` query parameters for paginated listing
- Accept `GET /bookmarks/{id}` that returns a single bookmark with its tags
- Accept `PUT /bookmarks/{id}` to update a bookmark's fields
- Accept `DELETE /bookmarks/{id}` to delete a bookmark (tags are cascade-deleted)
- Accept `POST /bookmarks/{id}/tags` to attach new tags to an existing bookmark
- Accept `DELETE /bookmarks/{id}/tags/{tag_id}` to detach a single tag

### Data Model

The internal `Bookmark` struct maps directly to the `bookmarks` table:

```rust
#[derive(Debug, Serialize, sqlx::FromRow)]
struct Bookmark {
    id: Uuid,
    url: String,
    title: String,
    description: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}
```

`#[derive(sqlx::FromRow)]` is what makes `query_as!(Bookmark, ...)` work. It generates code that reads each column from a database row and constructs a `Bookmark`. The field names in the struct must match the column names in the database, and the types must be compatible  `Uuid` ↔ `UUID`, `String` ↔ `TEXT`, `Option<String>` ↔ nullable `TEXT`, `DateTime<Utc>` ↔ `TIMESTAMPTZ`. If any field is missing or has the wrong type, `cargo build` catches it.

`Tag` follows the same pattern:

```rust
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
struct Tag {
    id: Uuid,
    name: String,
}
```

`BookmarkResponse` is the external representation. It includes tags alongside the bookmark fields. This is a separate type from `Bookmark` , the internal `Bookmark` struct is a direct row mapping, while `BookmarkResponse` includes computed data (the joined tags):

```rust
#[derive(Debug, Serialize)]
struct BookmarkResponse {
    id: Uuid,
    url: String,
    title: String,
    description: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    tags: Vec<Tag>,
}
```

Why separate `BookmarkResponse` from `Bookmark`? `Bookmark` represents a single row in the `bookmarks` table. `BookmarkResponse` represents the JSON the client sees, which includes tags fetched from a separate query. The response type is a view, it combines data from multiple sources into one shape. The internal type is a model, it maps directly to storage. Keeping them separate lets you change the database schema without changing the API response shape, and vice versa.

### The Full Code

Replace everything in `src/main.rs` with this:

```rust
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{delete, get, post, put},
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Clone)]
struct AppState {
    pool: PgPool,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
struct Bookmark {
    id: Uuid,
    url: String,
    title: String,
    description: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
struct Tag {
    id: Uuid,
    name: String,
}

#[derive(Debug, Deserialize)]
struct CreateBookmarkRequest {
    url: String,
    title: String,
    description: Option<String>,
    tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct UpdateBookmarkRequest {
    url: Option<String>,
    title: Option<String>,
    description: Option<String>,
}

#[derive(Debug, Serialize)]
struct BookmarkResponse {
    id: Uuid,
    url: String,
    title: String,
    description: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    tags: Vec<Tag>,
}

#[derive(Debug, Deserialize)]
struct PaginationParams {
    page: Option<i64>,
    per_page: Option<i64>,
    tag: Option<String>,
}

#[derive(Debug, Serialize)]
struct PaginatedBookmarks {
    bookmarks: Vec<BookmarkResponse>,
    page: i64,
    per_page: i64,
    total: i64,
}

enum AppError {
    ValidationError(String),
    NotFound(String),
    InternalError(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            AppError::ValidationError(msg) => (StatusCode::BAD_REQUEST, msg.clone()),
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, msg.clone()),
            AppError::InternalError(msg) => {
                eprintln!("internal error: {}", msg);
                (StatusCode::INTERNAL_SERVER_ERROR, "internal server error".to_string())
            }
        };

        let body = Json(serde_json::json!({ "error": message }));
        (status, body).into_response()
    }
}

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        match err {
            sqlx::Error::RowNotFound => {
                AppError::NotFound("resource not found".into())
            }
            _ => AppError::InternalError(format!("database error: {}", err)),
        }
    }
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    let database_url =
        std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&database_url)
        .await
        .expect("failed to connect to database");

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("failed to run migrations");

    let state = AppState { pool };

    let app = Router::new()
        .route("/bookmarks", post(create_bookmark))
        .route("/bookmarks", get(list_bookmarks))
        .route("/bookmarks/{id}", get(get_bookmark))
        .route("/bookmarks/{id}", put(update_bookmark))
        .route("/bookmarks/{id}", delete(delete_bookmark))
        .route("/bookmarks/{id}/tags", post(attach_tags))
        .route("/bookmarks/{id}/tags/{tag_id}", delete(detach_tag))
        .route("/healthz", get(healthz))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:3000")
        .await
        .unwrap();
    println!("Listening on http://127.0.0.1:3000");

    axum::serve(listener, app).await.unwrap();
}

async fn healthz() -> impl IntoResponse {
    StatusCode::OK
}

async fn create_bookmark(
    State(state): State<AppState>,
    Json(payload): Json<CreateBookmarkRequest>,
) -> Result<impl IntoResponse, AppError> {
    if payload.url.trim().is_empty() || payload.title.trim().is_empty() {
        return Err(AppError::ValidationError(
            "url and title must not be empty".into(),
        ));
    }

    let mut tx = state.pool.begin().await?;

    let bookmark = sqlx::query_as!(
        Bookmark,
        r#"INSERT INTO bookmarks (url, title, description)
           VALUES ($1, $2, $3)
           RETURNING id, url, title, description, created_at, updated_at"#,
        payload.url,
        payload.title,
        payload.description,
    )
    .fetch_one(&mut *tx)
    .await?;

    let mut tags = Vec::new();

    if let Some(ref tag_names) = payload.tags {
        for name in tag_names {
            let tag = sqlx::query_as!(
                Tag,
                r#"INSERT INTO tags (name) VALUES ($1)
                   ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
                   RETURNING id, name"#,
                name.trim().to_lowercase(),
            )
            .fetch_one(&mut *tx)
            .await?;

            sqlx::query!(
                "INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES ($1, $2)",
                bookmark.id,
                tag.id,
            )
            .execute(&mut *tx)
            .await?;

            tags.push(tag);
        }
    }

    tx.commit().await?;

    Ok((
        StatusCode::CREATED,
        Json(BookmarkResponse {
            id: bookmark.id,
            url: bookmark.url,
            title: bookmark.title,
            description: bookmark.description,
            created_at: bookmark.created_at,
            updated_at: bookmark.updated_at,
            tags,
        }),
    ))
}

async fn get_bookmark(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let bookmark = sqlx::query_as!(
        Bookmark,
        "SELECT id, url, title, description, created_at, updated_at FROM bookmarks WHERE id = $1",
        id,
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("bookmark with id '{}' not found", id)))?;

    let tags = sqlx::query_as!(
        Tag,
        r#"SELECT t.id, t.name
           FROM tags t
           INNER JOIN bookmark_tags bt ON bt.tag_id = t.id
           WHERE bt.bookmark_id = $1"#,
        bookmark.id,
    )
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(BookmarkResponse {
        id: bookmark.id,
        url: bookmark.url,
        title: bookmark.title,
        description: bookmark.description,
        created_at: bookmark.created_at,
        updated_at: bookmark.updated_at,
        tags,
    }))
}

async fn list_bookmarks(
    State(state): State<AppState>,
    Query(params): Query<PaginationParams>,
) -> Result<impl IntoResponse, AppError> {
    let page = params.page.unwrap_or(1).max(1);
    let per_page = params.per_page.unwrap_or(20).clamp(1, 100);
    let offset = (page - 1) * per_page;

    let (bookmarks, total): (Vec<Bookmark>, i64) = if let Some(ref tag_name) = params.tag {
        let total = sqlx::query_scalar!(
            r#"SELECT COUNT(DISTINCT b.id)::bigint
               FROM bookmarks b
               INNER JOIN bookmark_tags bt ON bt.bookmark_id = b.id
               INNER JOIN tags t ON t.id = bt.tag_id
               WHERE t.name = $1"#,
            tag_name.trim().to_lowercase(),
        )
        .fetch_one(&state.pool)
        .await?
        .unwrap_or(0);

        let bookmarks = sqlx::query_as!(
            Bookmark,
            r#"SELECT DISTINCT b.id, b.url, b.title, b.description, b.created_at, b.updated_at
               FROM bookmarks b
               INNER JOIN bookmark_tags bt ON bt.bookmark_id = b.id
               INNER JOIN tags t ON t.id = bt.tag_id
               WHERE t.name = $1
               ORDER BY b.created_at DESC
               LIMIT $2 OFFSET $3"#,
            tag_name.trim().to_lowercase(),
            per_page,
            offset,
        )
        .fetch_all(&state.pool)
        .await?;

        (bookmarks, total)
    } else {
        let total = sqlx::query_scalar!("SELECT COUNT(*)::bigint FROM bookmarks")
            .fetch_one(&state.pool)
            .await?
            .unwrap_or(0);

        let bookmarks = sqlx::query_as!(
            Bookmark,
            r#"SELECT id, url, title, description, created_at, updated_at
               FROM bookmarks
               ORDER BY created_at DESC
               LIMIT $1 OFFSET $2"#,
            per_page,
            offset,
        )
        .fetch_all(&state.pool)
        .await?;

        (bookmarks, total)
    };

    let bookmark_ids: Vec<Uuid> = bookmarks.iter().map(|b| b.id).collect();

    #[derive(Debug, sqlx::FromRow)]
    struct TagWithBookmark {
        id: Uuid,
        name: String,
        bookmark_id: Uuid,
    }

    let all_tags: Vec<TagWithBookmark> = if bookmark_ids.is_empty() {
        Vec::new()
    } else {
        sqlx::query_as!(
            TagWithBookmark,
            r#"SELECT t.id, t.name, bt.bookmark_id
               FROM tags t
               INNER JOIN bookmark_tags bt ON bt.tag_id = t.id
               WHERE bt.bookmark_id = ANY($1)"#,
            &bookmark_ids as &[Uuid],
        )
        .fetch_all(&state.pool)
        .await?
    };

    use std::collections::HashMap;
    let mut tags_by_bookmark: HashMap<Uuid, Vec<Tag>> = HashMap::new();
    for row in all_tags {
        tags_by_bookmark
            .entry(row.bookmark_id)
            .or_default()
            .push(Tag {
                id: row.id,
                name: row.name,
            });
    }

    let bookmark_responses: Vec<BookmarkResponse> = bookmarks
        .into_iter()
        .map(|bookmark| {
            let tags = tags_by_bookmark
                .get(&bookmark.id)
                .cloned()
                .unwrap_or_default();
            BookmarkResponse {
                id: bookmark.id,
                url: bookmark.url,
                title: bookmark.title,
                description: bookmark.description,
                created_at: bookmark.created_at,
                updated_at: bookmark.updated_at,
                tags,
            }
        })
        .collect();

    Ok(Json(PaginatedBookmarks {
        bookmarks: bookmark_responses,
        page,
        per_page,
        total,
    }))
}

async fn update_bookmark(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateBookmarkRequest>,
) -> Result<impl IntoResponse, AppError> {
    let existing = sqlx::query_as!(
        Bookmark,
        "SELECT id, url, title, description, created_at, updated_at FROM bookmarks WHERE id = $1",
        id,
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("bookmark with id '{}' not found", id)))?;

    let url = payload.url.unwrap_or(existing.url);
    let title = payload.title.unwrap_or(existing.title);
    let description = payload.description.or(existing.description);

    let bookmark = sqlx::query_as!(
        Bookmark,
        r#"UPDATE bookmarks
           SET url = $1, title = $2, description = $3, updated_at = NOW()
           WHERE id = $4
           RETURNING id, url, title, description, created_at, updated_at"#,
        url,
        title,
        description,
        id,
    )
    .fetch_one(&state.pool)
    .await?;

    let tags = sqlx::query_as!(
        Tag,
        r#"SELECT t.id, t.name
           FROM tags t
           INNER JOIN bookmark_tags bt ON bt.tag_id = t.id
           WHERE bt.bookmark_id = $1"#,
        bookmark.id,
    )
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(BookmarkResponse {
        id: bookmark.id,
        url: bookmark.url,
        title: bookmark.title,
        description: bookmark.description,
        created_at: bookmark.created_at,
        updated_at: bookmark.updated_at,
        tags,
    }))
}

async fn delete_bookmark(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let result = sqlx::query!("DELETE FROM bookmarks WHERE id = $1", id)
        .execute(&state.pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!(
            "bookmark with id '{}' not found",
            id
        )));
    }

    Ok(StatusCode::NO_CONTENT)
}

async fn attach_tags(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(payload): Json<Vec<String>>,
) -> Result<impl IntoResponse, AppError> {
    let exists = sqlx::query_scalar!("SELECT COUNT(*)::bigint FROM bookmarks WHERE id = $1", id)
        .fetch_one(&state.pool)
        .await?
        .unwrap_or(0)
        > 0;

    if !exists {
        return Err(AppError::NotFound(format!(
            "bookmark with id '{}' not found",
            id
        )));
    }

    let mut tx = state.pool.begin().await?;
    let mut tags = Vec::new();

    for name in payload {
        let tag = sqlx::query_as!(
            Tag,
            r#"INSERT INTO tags (name) VALUES ($1)
               ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
               RETURNING id, name"#,
            name.trim().to_lowercase(),
        )
        .fetch_one(&mut *tx)
        .await?;

        sqlx::query!(
            "INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            id,
            tag.id,
        )
        .execute(&mut *tx)
        .await?;

        tags.push(tag);
    }

    tx.commit().await?;

    Ok((StatusCode::CREATED, Json(tags)))
}

async fn detach_tag(
    State(state): State<AppState>,
    Path((bookmark_id, tag_id)): Path<(Uuid, Uuid)>,
) -> Result<impl IntoResponse, AppError> {
    let result = sqlx::query!(
        "DELETE FROM bookmark_tags WHERE bookmark_id = $1 AND tag_id = $2",
        bookmark_id,
        tag_id,
    )
    .execute(&state.pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("tag not attached to this bookmark".into()));
    }

    Ok(StatusCode::NO_CONTENT)
}
```

Now, let me explain each handler. Pay attention to the SQL, the queries are where the learning happens in this article.

### The State

```rust
#[derive(Clone)]
struct AppState {
    pool: PgPool,
}
```

Notice what changed from Part 2. Previously, `AppState` held `Arc<RwLock<HashMap<String, Paste>>>`. Now it holds a `PgPool`. No `Arc`, no `RwLock`, no `HashMap`. The pool is inherently thread-safe (it uses `Arc` internally) and the database handles all concurrency.

### The From Impl for sqlx::Error

```rust
impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        match err {
            sqlx::Error::RowNotFound => {
                AppError::NotFound("resource not found".into())
            }
            _ => AppError::InternalError(format!("database error: {}", err)),
        }
    }
}
```

This is new. In Parts 1 and 2, we had `From` impls for `PoisonError` on lock guards. Here we have one for `sqlx::Error`. This is what lets us use `?` after every database call, the error auto-converts into an `AppError`.

`sqlx::Error::RowNotFound` is the specific error returned when `fetch_one` finds zero rows. Notice we check for it explicitly and return a 404 instead of a 500. All other SQLx errors, connection failures, constraint violations, serialization failures map to `InternalError` with the full error string logged to stderr. In production, you would log this with `tracing` and discard the raw error string from the client response for security.

### The main Function

```rust
#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    let database_url =
        std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&database_url)
        .await
        .expect("failed to connect to database");

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("failed to run migrations");

    let state = AppState { pool };

    let app = Router::new()
        .route("/bookmarks", post(create_bookmark))
        .route("/bookmarks", get(list_bookmarks))
        .route("/bookmarks/{id}", get(get_bookmark))
        .route("/bookmarks/{id}", put(update_bookmark))
        .route("/bookmarks/{id}", delete(delete_bookmark))
        .route("/bookmarks/{id}/tags", post(attach_tags))
        .route("/bookmarks/{id}/tags/{tag_id}", delete(detach_tag))
        .route("/healthz", get(healthz))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:3000")
        .await
        .unwrap();
    println!("Listening on http://127.0.0.1:3000");

    axum::serve(listener, app).await.unwrap();
}
```

`dotenvy::dotenv().ok()` loads the `.env` file into the process environment. The `.ok()` swallows the error if the file doesn't exist, which is fine for development.

`sqlx::migrate!("./migrations").run(&pool)` compiles the migration SQL into the binary at build time and runs any unapplied migrations at startup. This means you can deploy a new version of your application with a new migration, and the schema updates automatically. No separate migration step in your deployment pipeline.

The `Pool` is moved into `AppState`. After this, any handler can extract `State<AppState>` and call `state.pool.begin()` or use `&state.pool` directly for single queries.

### The Create Bookmark Handler - Transactions

```rust
async fn create_bookmark(
    State(state): State<AppState>,
    Json(payload): Json<CreateBookmarkRequest>,
) -> Result<impl IntoResponse, AppError> {
    if payload.url.trim().is_empty() || payload.title.trim().is_empty() {
        return Err(AppError::ValidationError(
            "url and title must not be empty".into(),
        ));
    }

    let mut tx = state.pool.begin().await?;

    let bookmark = sqlx::query_as!(
        Bookmark,
        r#"INSERT INTO bookmarks (url, title, description)
           VALUES ($1, $2, $3)
           RETURNING id, url, title, description, created_at, updated_at"#,
        payload.url,
        payload.title,
        payload.description,
    )
    .fetch_one(&mut *tx)
    .await?;

    let mut tags = Vec::new();

    if let Some(ref tag_names) = payload.tags {
        for name in tag_names {
            let tag = sqlx::query_as!(
                Tag,
                r#"INSERT INTO tags (name) VALUES ($1)
                   ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
                   RETURNING id, name"#,
                name.trim().to_lowercase(),
            )
            .fetch_one(&mut *tx)
            .await?;

            sqlx::query!(
                "INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES ($1, $2)",
                bookmark.id,
                tag.id,
            )
            .execute(&mut *tx)
            .await?;

            tags.push(tag);
        }
    }

    tx.commit().await?;

    Ok((
        StatusCode::CREATED,
        Json(BookmarkResponse {
            id: bookmark.id,
            url: bookmark.url,
            title: bookmark.title,
            description: bookmark.description,
            created_at: bookmark.created_at,
            updated_at: bookmark.updated_at,
            tags,
        }),
    ))
}
```

This is the most important handler in the project. It demonstrates a **transaction**, a multi-step write that must either succeed entirely or leave the database unchanged.

`state.pool.begin().await?` starts a new transaction. This sends a `BEGIN` to Postgres. Everything executed on `tx` from this point until `tx.commit().await?` (which sends a `COMMIT`) is part of one atomic unit.

If any query inside the transaction fails for example, the tag insertion fails because of a constraint violation, the `?` operator returns an error from the handler. `tx` is dropped. When a `Transaction` is dropped without being committed, SQLx sends a `ROLLBACK` to Postgres, which undoes everything the transaction did. The bookmark that was inserted on line 164 is undone. The tags that were already inserted are undone. The database returns to the state it was in before `tx.begin()`.

This is the answer to the problem from the beginning of this article. Without transactions, a failure halfway through "create bookmark and attach three tags" leaves an orphaned bookmark in the database with some tags attached and others not. With transactions, it's all or nothing.

Let's trace the tag insertion logic step by step:

1. **`INSERT INTO tags ... ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id, name`** - This is an upsert. If a tag with this name already exists, Postgres returns the existing row. If it doesn't exist, Postgres inserts it and returns the new row. The `RETURNING` clause gives us the `id` and `name` of the row (whether it was newly inserted or already existed), so we know which `tag_id` to use in the junction table. The `ON CONFLICT DO UPDATE SET name = EXCLUDED.name` is a no-op update, it writes the existing value back to the row. We use it because we always need the tag's `id`. `ON CONFLICT DO NOTHING RETURNING ...` returns the inserted row only when a new row is created. If the conflict path is taken, it returns zero rows. Using `DO UPDATE ... RETURNING` guarantees that we receive the existing row in both cases.

2. **`INSERT INTO bookmark_tags ...`** - Creates the association between the bookmark and the tag in the junction table. No `ON CONFLICT` here, if the association already exists (because the client sent duplicate tags), the primary key constraint will reject it and the transaction rolls back. In production, you might handle this more gracefully with `ON CONFLICT DO NOTHING`.

3. **`tx.commit().await?`** - Commits the transaction. After this point, the bookmark and all its tags are durably stored. If the server crashes immediately after `commit()` returns, the data survives.

Every query in the transaction uses `&mut *tx` (a mutable reference to the transaction) instead of `&state.pool`. This is critical, queries on the pool use separate connections, which are not part of the transaction. If you accidentally used `&state.pool` for one of the tag insertions, that tag would be inserted outside the transaction and would survive a rollback.

> **What happens if the server crashes between two queries in the transaction?** The TCP connection to Postgres drops. Postgres detects the lost connection and automatically rolls back the transaction. The partial state is never persisted.

### The Get Bookmark Handler - Two Queries, Two Tables

```rust
async fn get_bookmark(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let bookmark = sqlx::query_as!(
        Bookmark,
        "SELECT id, url, title, description, created_at, updated_at FROM bookmarks WHERE id = $1",
        id,
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("bookmark with id '{}' not found", id)))?;

    let tags = sqlx::query_as!(
        Tag,
        r#"SELECT t.id, t.name
           FROM tags t
           INNER JOIN bookmark_tags bt ON bt.tag_id = t.id
           WHERE bt.bookmark_id = $1"#,
        bookmark.id,
    )
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(BookmarkResponse {
        id: bookmark.id,
        url: bookmark.url,
        title: bookmark.title,
        description: bookmark.description,
        created_at: bookmark.created_at,
        updated_at: bookmark.updated_at,
        tags,
    }))
}
```

Two queries on two separate connections from the pool. First, fetch the bookmark by its `Path(id)`, notice `Path<Uuid>` deserializes the path segment directly into a `Uuid`, which is more type-safe than `Path<String>`. Second, fetch all tags associated with that bookmark via the junction table.

`fetch_optional` returns `Option<Bookmark>`. If the row exists, we get `Some`. If it doesn't, we get `None`. The `.ok_or_else(|| ...)` converts `None` into an `AppError::NotFound`. If `fetch_optional` itself fails (network error, connection timeout), the `?` converts the `sqlx::Error` into `AppError::InternalError` via the `From` impl.

The tag query joins `tags` with `bookmark_tags` to find all tags attached to this bookmark. `INNER JOIN` means only tags that actually have an association are returned. If the bookmark has no tags, `fetch_all` returns an empty `Vec`, no error, just an empty tags list in the response.

### The List Bookmarks Handler - Pagination, Tag Filtering, and the N+1 Trap

This is the longest handler. Let's break it into three parts: pagination, the conditional query, and tag fetching.

**Pagination:**

```rust
let page = params.page.unwrap_or(1).max(1);
let per_page = params.per_page.unwrap_or(20).clamp(1, 100);
let offset = (page - 1) * per_page;
```

`.max(1)` prevents negative or zero page numbers. `.clamp(1, 100)` caps the page size between 1 and 100 - requesting 1000 items per page is either a bug or an abuse vector. `offset` is calculated from `(page - 1) * per_page`. Page 1, 20 per page gives offset 0. Page 2 gives offset 20. This is standard cursor-less pagination.

**The conditional query - tagged vs untagged:**

```rust
let (bookmarks, total): (Vec<Bookmark>, i64) = if let Some(ref tag_name) = params.tag {
    // Tagged: count and fetch bookmarks with a specific tag
    let total = sqlx::query_scalar!(
        r#"SELECT COUNT(DISTINCT b.id)::bigint
           FROM bookmarks b
           INNER JOIN bookmark_tags bt ON bt.bookmark_id = b.id
           INNER JOIN tags t ON t.id = bt.tag_id
           WHERE t.name = $1"#,
        tag_name.trim().to_lowercase(),
    )
    .fetch_one(&state.pool)
    .await?
    .unwrap_or(0);

    let bookmarks = sqlx::query_as!(
        Bookmark,
        r#"SELECT DISTINCT b.id, b.url, b.title, b.description, b.created_at, b.updated_at
           FROM bookmarks b
           INNER JOIN bookmark_tags bt ON bt.bookmark_id = b.id
           INNER JOIN tags t ON t.id = bt.tag_id
           WHERE t.name = $1
           ORDER BY b.created_at DESC
           LIMIT $2 OFFSET $3"#,
        tag_name.trim().to_lowercase(),
        per_page,
        offset,
    )
    .fetch_all(&state.pool)
    .await?;

    (bookmarks, total)
} else {
    // Untagged: count and fetch all bookmarks
    let total = sqlx::query_scalar!("SELECT COUNT(*)::bigint FROM bookmarks")
        .fetch_one(&state.pool)
        .await?
        .unwrap_or(0);

    let bookmarks = sqlx::query_as!(
        Bookmark,
        r#"SELECT id, url, title, description, created_at, updated_at
           FROM bookmarks
           ORDER BY created_at DESC
           LIMIT $1 OFFSET $2"#,
        per_page,
        offset,
    )
    .fetch_all(&state.pool)
    .await?;

    (bookmarks, total)
};
```

Two separate query blocks, one with tag filtering, one without. Conditionally branching on `params.tag` is simpler than building a dynamic query string, and it avoids SQL injection entirely.

In the tagged path, the query joins `bookmarks` → `bookmark_tags` → `tags` and filters by tag name. `DISTINCT` prevents duplicate bookmarks if a bookmark has multiple tags (the join would otherwise produce one row per tag per bookmark). The count query counts distinct bookmark IDs for the same reason, without `DISTINCT`, the count would include duplicates.

`query_scalar!` is a new macro. It's for queries that return a single column, like `COUNT(*)` or `SELECT name FROM ... WHERE id = $1`. It deserializes directly into a Rust scalar type (`i64`, `String`, etc.) instead of a struct.

**The tag fetching - avoiding the N+1 trap:**

Here is where this handler differs from a naive approach. A naive approach would be:

```rust
// DON'T DO THIS - the N+1 trap
for bookmark in &bookmarks {
    let tags = sqlx::query_as!(Tag, "... WHERE bt.bookmark_id = $1", bookmark.id)
        .fetch_all(&state.pool)
        .await?;
    // ...
}
```

This is the **N+1 query problem**. If the page has 20 bookmarks, you make 1 query for the bookmarks themselves, then 20 more queries for the tags (one per bookmark). That's 21 queries total. On the next page, another 21. At scale, this multiplies your database load by the page size and it's easy to write by accident because each lookup feels natural in a loop.

The fix: **fetch all tags for all bookmarks on the current page in a single query**, then group them in application code:

```rust
let bookmark_ids: Vec<Uuid> = bookmarks.iter().map(|b| b.id).collect();

#[derive(Debug, sqlx::FromRow)]
struct TagWithBookmark {
    id: Uuid,
    name: String,
    bookmark_id: Uuid,
}

let all_tags: Vec<TagWithBookmark> = if bookmark_ids.is_empty() {
    Vec::new()
} else {
    sqlx::query_as!(
        TagWithBookmark,
        r#"SELECT t.id, t.name, bt.bookmark_id
           FROM tags t
           INNER JOIN bookmark_tags bt ON bt.tag_id = t.id
           WHERE bt.bookmark_id = ANY($1)"#,
        &bookmark_ids as &[Uuid],
    )
    .fetch_all(&state.pool)
    .await?
};
```

`WHERE bt.bookmark_id = ANY($1)` with the slice `&bookmark_ids as &[Uuid]` tells Postgres "give me all tag associations for any of these bookmark IDs." Postgres uses the `idx_bookmark_tags_bookmark_id` index for each ID in the list and returns all matching rows in a single result set.

`TagWithBookmark` is a helper struct used only inside this handler. It includes `bookmark_id` so we know which bookmark each tag belongs to when grouping.

The `if bookmark_ids.is_empty()` check simply avoids making an unnecessary database query. `ANY()` works correctly with an empty array, but since we already know there are no bookmark IDs, we can return an empty vector immediately.

Then we group by bookmark ID:

```rust
let mut tags_by_bookmark: HashMap<Uuid, Vec<Tag>> = HashMap::new();
for row in all_tags {
    tags_by_bookmark
        .entry(row.bookmark_id)
        .or_default()
        .push(Tag { id: row.id, name: row.name });
}
```

And finally map each bookmark to its response, looking up tags from the HashMap:

```rust
let bookmark_responses: Vec<BookmarkResponse> = bookmarks
    .into_iter()
    .map(|bookmark| {
        let tags = tags_by_bookmark
            .get(&bookmark.id)
            .cloned()
            .unwrap_or_default();
        BookmarkResponse { /* ... */ tags }
    })
    .collect();
```

The total number of queries is now 3 (bookmarks, count, tags), regardless of page size. This is the difference between an API that handles 1000 concurrent users and one that falls over at 10.

### The Update Bookmark Handler

```rust
async fn update_bookmark(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateBookmarkRequest>,
) -> Result<impl IntoResponse, AppError> {
    let existing = sqlx::query_as!(
        Bookmark,
        "SELECT id, url, title, description, created_at, updated_at FROM bookmarks WHERE id = $1",
        id,
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("bookmark with id '{}' not found", id)))?;

    let url = payload.url.unwrap_or(existing.url);
    let title = payload.title.unwrap_or(existing.title);
    let description = payload.description.or(existing.description);

    let bookmark = sqlx::query_as!(
        Bookmark,
        r#"UPDATE bookmarks
           SET url = $1, title = $2, description = $3, updated_at = NOW()
           WHERE id = $4
           RETURNING id, url, title, description, created_at, updated_at"#,
        url,
        title,
        description,
        id,
    )
    .fetch_one(&state.pool)
    .await?;

    // ... fetch tags and return
}
```

A partial update pattern. The client sends only the fields it wants to change. Fields not present in the request default to their existing values from the database.

`payload.url.unwrap_or(existing.url)` takes the client-supplied value if present, otherwise falls back to the existing value. `payload.description.or(existing.description)` does the same for `Option<String>` , notice `or()` instead of `unwrap_or()`, since both are `Option` types.

`updated_at = NOW()` sets the timestamp to the current server time. This is done in SQL rather than Rust because the database clock is the single source of truth for when a row was last modified. If you set it in Rust, clock skew between application servers could cause inconsistent timestamps.

### The Delete Bookmark Handler - Cascade

```rust
async fn delete_bookmark(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let result = sqlx::query!("DELETE FROM bookmarks WHERE id = $1", id)
        .execute(&state.pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!(
            "bookmark with id '{}' not found",
            id
        )));
    }

    Ok(StatusCode::NO_CONTENT)
}
```

A single `DELETE` statement. The `ON DELETE CASCADE` foreign key on `bookmark_tags.bookmark_id` ensures that deleting a bookmark also deletes all rows in the junction table. Without `CASCADE`, you would need to delete from `bookmark_tags` first two queries, or a transaction. `CASCADE` handles it in one.

`rows_affected()` returns the number of rows that were modified. If it's 0, the bookmark didn't exist and we return 404.

### The Attach Tags Handler - Transactional Tag Creation

```rust
async fn attach_tags(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(payload): Json<Vec<String>>,
) -> Result<impl IntoResponse, AppError> {
    // Check bookmark exists
    let exists = sqlx::query_scalar!("SELECT COUNT(*)::bigint FROM bookmarks WHERE id = $1", id)
        .fetch_one(&state.pool)
        .await?
        .unwrap_or(0) > 0;

    if !exists {
        return Err(AppError::NotFound(...));
    }

    let mut tx = state.pool.begin().await?;
    let mut tags = Vec::new();

    for name in payload {
        // Upsert tag, insert into bookmark_tags
        // ...
    }

    tx.commit().await?;

    Ok((StatusCode::CREATED, Json(tags)))
}
```

Similar tag creation logic to `create_bookmark`, but for an existing bookmark. The existence check happens before the transaction starts, no point opening a transaction if the bookmark doesn't exist.

The `ON CONFLICT DO NOTHING` on the `bookmark_tags` insert is important here: if the client sends a tag that's already attached, the insert is silently skipped instead of failing with a unique constraint violation. Without `DO NOTHING`, attaching `["rust", "rust"]` would cause the second insert to fail and roll back the entire transaction, losing the first tag.

### The Detach Tag Handler - Tuple Path Parameters

```rust
async fn detach_tag(
    State(state): State<AppState>,
    Path((bookmark_id, tag_id)): Path<(Uuid, Uuid)>,
) -> Result<impl IntoResponse, AppError> {
    let result = sqlx::query!(
        "DELETE FROM bookmark_tags WHERE bookmark_id = $1 AND tag_id = $2",
        bookmark_id,
        tag_id,
    )
    .execute(&state.pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("tag not attached to this bookmark".into()));
    }

    Ok(StatusCode::NO_CONTENT)
}
```

`Path<(Uuid, Uuid)>` is a new Axum trick. The route is `/bookmarks/{id}/tags/{tag_id}`. Axum deserializes the two path segments `{id}` and `{tag_id}` into a tuple `(Uuid, Uuid)`. This is cleaner than writing `Path(id): Path<Uuid>, Path(tag_id): Path<Uuid>` as separate extractor parameters, though both work. The tuple pattern works for up to 16 segments and saves a line of function signature.

> **Why not use `Path` for both?** You can `async fn detach_tag(Path(bookmark_id): Path<Uuid>, Path(tag_id): Path<Uuid>)`  but Axum's `Path` extractor can only appear once per handler since it's a `FromRequestParts` extractor limited to capturing a single path pattern. The tuple syntax `Path((a, b))` captures both in one extractor.

## Understanding Transactions

Transactions are the single most important database concept beyond basic CRUD. Here is the exact lifecycle of the `create_bookmark` transaction:

1. **`state.pool.begin().await?`** - SQLx acquires a connection from the pool and sends `BEGIN` to Postgres. Postgres marks this connection as "in a transaction." All subsequent queries on this connection are part of the transaction.

2. **`INSERT INTO bookmarks ...`** - The bookmark is inserted, but it is not visible to any other connection. Other users querying `bookmarks` will not see this row until the transaction commits. This is Postgres's default isolation level, `READ COMMITTED`, at work.

3. **`INSERT INTO tags ... RETURNING ...`** - Each tag is upserted. The `RETURNING` clause returns the tag's `id` and `name`, which we need for the junction table insert. The upsert uses the transaction's snapshot of the database — if another concurrent transaction creates a tag with the same name at the same moment, Postgres would block one of them (because of the `UNIQUE` constraint) and the second would see the first's row.

4. **`INSERT INTO bookmark_tags ...`** - The junction table row is inserted, linking the bookmark and the tag.

5. **`tx.commit().await?`** - SQLx sends `COMMIT` to Postgres. Postgres writes all the transaction's changes to the write-ahead log (WAL), making them durable. At this moment, the changes become visible to all other connections. The pooled connection is returned to the pool.

If any step fails, the `?` operator returns an `Err`, `tx` is dropped. SQLx's `Transaction` destructor sends `ROLLBACK` to Postgres. Postgres undoes all changes made during the transaction as if they never happened. No orphaned bookmarks. No partial tag attachments.

### What If Two Transactions Run at the Same Time?

The `name TEXT NOT NULL UNIQUE` constraint on `tags` is the key. If two concurrent requests both try to create a tag called `rust`:

1. Transaction A inserts `rust` into `tags`. Postgres acquires an exclusive lock on the new row.
2. Transaction B also tries to insert `rust`. Because of the `UNIQUE` constraint, Postgres blocks B until A commits or rolls back.
3. If A commits, B's insert fails with a unique violation but our query uses `ON CONFLICT (name) DO UPDATE`, so instead of failing, it returns the existing `rust` row that A inserted. B proceeds with A's tag ID.
4. If A rolls back, B's insert succeeds because the conflicting row no longer exists.

Without `ON CONFLICT`, B's insert would fail, the `?` would propagate the error, and B's entire transaction would roll back. The bookmark B was creating would be lost. The upsert pattern is a concurrency-safe way to "get or create" a shared resource like a tag.

## Isolation Levels - A Brief Look

Postgres's default isolation level is `READ COMMITTED`. You can see it if you run `SHOW default_transaction_isolation;` in `psql`. Here is what it means, and what the alternatives are:

### READ COMMITTED (the default)

Each statement in a transaction sees only data that was committed before the statement began, not before the transaction began. This means:

- **No dirty reads:** You never see uncommitted data from another transaction.
- **Non-repeatable reads are possible:** If transaction A reads a row, transaction B updates and commits that row, then A reads it again, A sees B's update. The row changed between reads within A's transaction.

This is sufficient for most applications. In our bookmark manager, the only write that involves multiple tables is `create_bookmark` (bookmark + tags), and that's wrapped in a transaction. Since the bookmark, tags, and their associations are all created inside a single transaction, other transactions do not observe any of those changes until the transaction commits.

### REPEATABLE READ

Each statement in a transaction sees only data that was committed before the **transaction** began. The snapshot is frozen at transaction start. Non-repeatable reads cannot happen. This is stronger isolation, but it can lead to serialization failures, if two transactions modify the same row, one must be retried.

### SERIALIZABLE

The strongest level. Transactions run as if they were executed one after another, even though they actually run concurrently. Postgres detects conflicts and forces one transaction to fail with a serialization failure, which the application must retry. This is the safest level, but it has the highest overhead and requires retry logic in your application code.

For a bookmark manager, `READ COMMITTED` (the default) is correct. For a banking application, you want `SERIALIZABLE` or at least `REPEATABLE READ`. The isolation level is set per transaction:

```rust
let mut tx = pool.begin().await?;
sqlx::query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE")
    .execute(&mut *tx)
    .await?;
```

You probably won't need this in practice, but knowing what the options mean and why Postgres defaults to `READ COMMITTED` is table stakes for backend engineering.

## Running the Project

Make sure Docker is running, then:

```
docker compose up -d
cargo sqlx prepare
cargo run
```

You should see:

```
Listening on http://127.0.0.1:3000
```

### Create a Bookmark

```
curl -X POST http://localhost:3000/bookmarks \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.rust-lang.org",
    "title": "Rust Programming Language",
    "description": "The official Rust website",
    "tags": ["rust", "programming"]
  }'
```

Response:

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "url": "https://www.rust-lang.org",
  "title": "Rust Programming Language",
  "description": "The official Rust website",
  "created_at": "2026-07-12T17:00:00.000000Z",
  "updated_at": "2026-07-12T17:00:00.000000Z",
  "tags": [
    {"id": "b2c3d4e5-f6a7-8901-bcde-f12345678901", "name": "rust"},
    {"id": "c3d4e5f6-a7b8-9012-cdef-123456789012", "name": "programming"}
  ]
}
```

The bookmark and both tags were created in a single transaction. If the server crashed after inserting the bookmark but before inserting the `programming` tag, the entire operation rolls back, no orphaned bookmark.

### Get a Bookmark

```
curl http://localhost:3000/bookmarks/a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

### List All Bookmarks

```
curl http://localhost:3000/bookmarks
```

Response includes pagination metadata:

```json
{
  "bookmarks": [...],
  "page": 1,
  "per_page": 20,
  "total": 1
}
```

### List Bookmarks with Pagination

```
curl "http://localhost:3000/bookmarks?page=2&per_page=10"
```

### Filter by Tag

```
curl "http://localhost:3000/bookmarks?tag=rust"
```

This returns only bookmarks that have the `rust` tag.

### Update a Bookmark

```
curl -X PUT http://localhost:3000/bookmarks/a1b2c3d4-e5f6-7890-abcd-ef1234567890 \
  -H "Content-Type: application/json" \
  -d '{"title": "Rust Lang (Updated)"}'
```

Only the `title` field is updated. `url` and `description` retain their existing values. `updated_at` is set to `NOW()` by the database.

### Attach Tags to an Existing Bookmark

```
curl -X POST http://localhost:3000/bookmarks/a1b2c3d4-e5f6-7890-abcd-ef1234567890/tags \
  -H "Content-Type: application/json" \
  -d '["web", "systems"]'
```

Upserts the tags if they don't exist, inserts the associations, returns the full tag objects. If a tag is already attached, `ON CONFLICT DO NOTHING` skips it silently.

### Detach a Tag

```
curl -X DELETE http://localhost:3000/bookmarks/a1b2c3d4-e5f6-7890-abcd-ef1234567890/tags/b2c3d4e5-f6a7-8901-bcde-f12345678901
```

Returns 204 No Content on success, 404 if the tag wasn't attached.

### Delete a Bookmark

```
curl -X DELETE http://localhost:3000/bookmarks/a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

Returns 204. The bookmark and all its tag associations are removed. `ON DELETE CASCADE` handles the junction table rows.

### Test Validation

```
curl -X POST http://localhost:3000/bookmarks \
  -H "Content-Type: application/json" \
  -d '{"url": "", "title": ""}'
```

Response:

```json
{"error": "url and title must not be empty"}
```

Status code: 400.

### Test Not Found

```
curl http://localhost:3000/bookmarks/00000000-0000-0000-0000-000000000000
```

Response:

```json
{"error": "bookmark with id '00000000-0000-0000-0000-000000000000' not found"}
```

Status code: 404.

## What We Skipped

- **The `thiserror` crate**: We wrote `From` impls manually to show the mechanism. In practice, `thiserror` derives these for you compactly. Use it in your own projects.
- **Compile-time query checking without a running database**: The `.sqlx/` directory generated by `cargo sqlx prepare` is the offline query cache. Commit it. CI builds won't need a database. We covered this in the setup.
- **Full-text search**: Searching bookmarks by URL or title substring would require a `tsvector` and GIN index. That's a different problem from tag-based filtering.
- **User accounts**: Bookmarks belong to everyone. Part 6 adds authentication and user-scoped data.
- **Orphaned tags**: If all bookmarks with a given tag are deleted, the tag row remains in the `tags` table with no associations. This is harmless (takes negligible space) but a production system might periodically clean up unused tags with a background job (Part 9).
- **Soft deletes**: `DELETE` is permanent. A real application might use a `deleted_at` column and a `WHERE deleted_at IS NULL` filter on all queries. This is an application-level decision, not a database one.

## Conclusion

You now have a solid foundation for building data-driven Axum applications. In the next article, we'll build on it by introducing caching and idempotency, two techniques that make APIs faster, more resilient, and safer to retry. See you soon
