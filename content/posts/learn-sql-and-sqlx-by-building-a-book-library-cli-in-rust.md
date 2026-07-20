+++
title = "Learn SQL and SQLx by Building a Book Library CLI in Rust"
description = "Learn complete SQL and SQLx 0.9 by building a book library cli in Rust"
date = 2026-06-26
transparent = true

[taxonomies]
tags = ["rust", "project", "parser"]
series = ["learning-rust"]

[extra]
hidden = true
+++



In this post, we are going to learn SQL from the ground up, no prior database knowledge required. We will learn about tables, data types, constraints, `SELECT`, `INSERT`, `UPDATE`, `DELETE`, filtering with `WHERE`, pattern matching with `LIKE`, sorting with `ORDER BY`, grouping with `GROUP BY`, aggregate functions like `COUNT` and `AVG`, `JOIN`s across multiple tables, subqueries, transactions, and indexes. 

We will practice every concept hands-on in the `sqlite3` terminal first. Then we will learn how to bring all of that into Rust with SQLx: compile-time checked queries, connection pooling, schema migrations, and the `query!`, `query_as!`, and `query_scalar!` macros. Once we cover all the concepts, we will build a **Book Library CLI** backed by SQLite with full CRUD, rich search, genre statistics, pagination, and bulk import with transactions. I am really excited for this project and I hope you are too. I won't go too deep in theory, just practical and we will build our knowledge of these concepts over time with more articles.

The only prerequisite is that you have read the previous articles in this series, as I will assume you know ownership, borrowing, structs, enums, pattern matching, error handling, generics, traits, lifetimes, HashMap, iterators, closures, smart pointers, concurrency, and async/await with Tokio.

Get source code from [here](https://github.com/MrSheerluck/bookcli)

> **A quick note before we begin:** This article is in three parts. Part 1 teaches SQL from scratch using the `sqlite3` command-line tool, no Rust, just SQL. Part 2 introduces SQLx and explains how its compile-time checked queries work. Part 3 builds the full Book Library CLI. If you already know SQL well, you can skim Part 1. But I recommend at least glancing through it because the examples use the exact same schema we will build in the project, and we cover some patterns (GROUP BY on genres, subqueries for rankings) that you will use in the CLI.

## Part 1: Learning SQL from Scratch

### What Is a Database

A database is an organised collection of data stored on disk. You interact with it using SQL (Structured Query Language). SQL is a declarative language. You describe *what* you want, not *how* to get it. The database engine figures out the how.

Think of it like this. If you stored books in a JSON file, finding all science fiction books by a specific author would require you to read the entire file into memory, loop through every entry, and filter manually. At 10 books, this is fine. At 10,000 books, it is slow. At 10,000,000 books, it does not fit in memory. A database handles this by keeping data organised on disk, using indexes to find things without scanning everything, and returning only what you asked for.

### Why SQLite

The database engine we will use is SQLite. Unlike PostgreSQL or MySQL, SQLite is not a separate server process. It is a library that reads and writes directly to a single file on disk. This makes it perfect for learning, for CLI tools, for mobile apps, for desktop applications, and for embedded systems. SQLite is the most deployed database engine in the world. It runs inside every iPhone, every Android device, every Chrome browser, and every Python installation.

### Getting Started with sqlite3

Most systems come with `sqlite3` pre-installed. Check:

```bash
sqlite3 --version
```

If you see something like `3.43.0`, you are good. If not, install it (`brew install sqlite` on macOS, `apt install sqlite3` on Ubuntu).

Create a database and enter the interactive shell:

```bas
sqlite3 library.db
```

You are now inside the SQLite shell. Every command you type is SQL and ends with a semicolon `;`. To exit, type `.quit` (with a dot, dot commands are sqlite3-specific, not SQL). Let's create our first table.

### Creating Tables

A table is like a spreadsheet. Columns have names and types. Rows are individual records. Here is our first table:

```sql
CREATE TABLE books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    genre TEXT NOT NULL,
    year INTEGER,
    read INTEGER NOT NULL DEFAULT 0
);
```

Now, let me explain what we just did.

`CREATE TABLE books (...)` creates a new table called `books`. Inside the parentheses, we define columns. Each column has a name, a type, and optional constraints.

`id INTEGER PRIMARY KEY AUTOINCREMENT`. `INTEGER` is the type (a whole number). `PRIMARY KEY` means this column uniquely identifies each row, no two rows can have the same ID. `INTEGER PRIMARY KEY` already tells SQLite to automatically generate row IDs when you insert a row without specifying an ID. Adding `AUTOINCREMENT` changes the allocation strategy so previously used IDs are never reused, even if rows are deleted. It has a small performance cost, so most applications only use it when they specifically need that guarantee.

`title TEXT NOT NULL`. `TEXT` stores strings. `NOT NULL` means this column cannot be empty. You must provide a title for every book.

`author TEXT NOT NULL`. Same as title, every book must have an author.

`genre TEXT NOT NULL`. Every book must have a genre. We will use this for filtering and grouping later.

`year INTEGER`. No `NOT NULL` here, so `year` can be `NULL`. Some books have unknown publication years.

`read INTEGER NOT NULL DEFAULT 0`. `read` is an integer that acts as a boolean because SQLite does not have a separate `BOOLEAN` type. `0` means unread, `1` means read. `DEFAULT 0` means new books start as unread unless specified otherwise. This is our convention. We will map `0` and `1` to Rust's `bool` later with SQLx.

SQLite has five storage classes:

|Storage Class|What It Stores|Example|
|---|---|---|
|`INTEGER`|Whole numbers|`42`, `0`, `-7`|
|`TEXT`|Text strings|`'hello'`, `'world'`|
|`REAL`|Floating-point numbers|`3.14`, `-0.5`|
|`BLOB`|Binary data|`X'89504E47'`|
|`NULL`|The absence of a value|`NULL`|

### Inspecting Tables

To see all tables in the database:

```
.tables
```

To see the schema of a specific table:

```
.schema books
```

Output:

```sql
CREATE TABLE books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    genre TEXT NOT NULL,
    year INTEGER,
    read INTEGER NOT NULL DEFAULT 0
);
```

These dot commands are sqlite3-specific shortcuts. They are not SQL. Real SQL queries go through a different table called `sqlite_master`, but `.tables` and `.schema` are faster to type.

### Inserting Data

Now let's add some books. The `INSERT` statement adds rows:

```sql
INSERT INTO books (title, author, genre, year) VALUES
    ('The Rust Programming Language', 'Steve Klabnik', 'Programming', 2018);
```

Now, let me explain what we just did.

`INSERT INTO books` says we are adding to the `books` table. The parentheses `(title, author, genre, year)` list which columns we are providing values for. `VALUES (...)` provides the corresponding values. We did not specify `id` because `AUTOINCREMENT` handles it. We did not specify `read` because it defaults to `0`. The single quotes `'...'` denote string literals in SQL. Double quotes are for identifiers (table names, column names), single quotes are for string values.

Insert more books:

```sql
INSERT INTO books (title, author, genre, year) VALUES
    ('Project Hail Mary', 'Andy Weir', 'Science Fiction', 2021);

INSERT INTO books (title, author, genre, year, read) VALUES
    ('The Martian', 'Andy Weir', 'Science Fiction', 2011, 1);

INSERT INTO books (title, author, genre, year) VALUES
    ('Atomic Habits', 'James Clear', 'Self-Help', 2018);

INSERT INTO books (title, author, genre, year, read) VALUES
    ('Dune', 'Frank Herbert', 'Science Fiction', 1965, 1);

INSERT INTO books (title, author, genre, year) VALUES
    ('Neuromancer', 'William Gibson', 'Cyberpunk', 1984);

INSERT INTO books (title, author, genre, year) VALUES
    ('Snow Crash', 'Neal Stephenson', 'Cyberpunk', 1992);

INSERT INTO books (title, author, genre, year, read) VALUES
    ('The Name of the Wind', 'Patrick Rothfuss', 'Fantasy', 2007, 1);

INSERT INTO books (title, author, genre, year) VALUES
    ('A Wise Man's Fear', 'Patrick Rothfuss', 'Fantasy', 2011);

INSERT INTO books (title, author, genre, year, read) VALUES
    ('Deep Work', 'Cal Newport', 'Self-Help', 2016, 1);
```

Now we have 10 books to work with.

### Selecting Data

The `SELECT` statement retrieves data. It is the most used statement in SQL.

#### SELECT All Columns

```sql
SELECT * FROM books;
```

Output:

```
id  title                        author             genre            year  read
--  ---------------------------  -----------------  ---------------  ----  ----
1   The Rust Programming Langua  Steve Klabnik      Programming      2018  0
2   Project Hail Mary            Andy Weir          Science Fiction  2021  0
3   The Martian                  Andy Weir          Science Fiction  2011  1
4   Atomic Habits                James Clear        Self-Help        2018  0
5   Dune                         Frank Herbert      Science Fiction  1965  1
6   Neuromancer                  William Gibson     Cyberpunk        1984  0
7   Snow Crash                   Neal Stephenson    Cyberpunk        1992  0
8   The Name of the Wind         Patrick Rothfuss   Fantasy          2007  1
9   A Wise Man's Fear             Patrick Rothfuss   Fantasy          2011  0
10  Deep Work                    Cal Newport        Self-Help        2016  1
```

`*` means "all columns." Read this as "select all columns from the books table."

#### SELECT Specific Columns

Selecting everything is wasteful if you only need titles. Be specific:

```sql
SELECT title, author FROM books;
```

#### SELECT with Aliases

You can rename columns in the output with `AS`:

```sql
SELECT title AS book_title, author AS written_by FROM books;
```

#### SELECT DISTINCT

To get unique values without duplicates:

```sql
SELECT DISTINCT genre FROM books;
```

Output:

```
genre
---------------
Programming
Science Fiction
Self-Help
Cyberpunk
Fantasy
```

`DISTINCT` removes duplicates. There are 10 books but only 5 distinct genres.

### Filtering with WHERE

`WHERE` filters rows based on conditions. It comes after `FROM` and before `ORDER BY`.

#### Equality and Comparison

```sql
SELECT title, year FROM books WHERE author = 'Andy Weir';
```

Output:

```
title               year
------------------  ----
Project Hail Mary   2021
The Martian         2011
```

Comparison operators: `=` (equal), `!=` or `<>` (not equal), `<` (less than), `>` (greater than), `<=`, `>=`.

```sql
SELECT title, year FROM books WHERE year >= 2015;
```

Output:

```
title                        year
---------------------------  ----
The Rust Programming Langua  2018
Project Hail Mary            2021
Atomic Habits                2018
Deep Work                    2016
```

#### AND, OR, NOT

Combine conditions with `AND` and `OR`:

```sql
SELECT title, year FROM books WHERE genre = 'Science Fiction' AND year < 2020;
```

Output:

```
title          year
-------------  ----
The Martian    2011
Dune           1965
```

Both conditions must be true for `AND`. For `OR`, only one needs to be true:

```sql
SELECT title, genre FROM books WHERE genre = 'Cyberpunk' OR genre = 'Fantasy';
```

You can group conditions with parentheses:

```sql
SELECT title, author, year FROM books
WHERE (genre = 'Science Fiction' OR genre = 'Fantasy') AND year > 2000;
```

Now, let me explain what we just did.

This finds Science Fiction or Fantasy books published after the year 2000. Without the parentheses, `AND` has higher precedence than `OR`, so `genre = 'Fantasy' AND year > 2000` would be evaluated first, changing the meaning. Always use parentheses when mixing `AND` and `OR`.

`NOT` negates a condition:

```sql
SELECT title FROM books WHERE NOT read;
```

Output:

```
title
---------------------------
The Rust Programming Langua
Project Hail Mary
Atomic Habits
Neuromancer
Snow Crash
A Wise Man's Fear
```

In SQLite, `read` is `0` or `1`. `NOT 0` is true, `NOT 1` is false. This shows all unread books. You could also write `WHERE read = 0`.

#### BETWEEN

`BETWEEN` checks if a value is within a range (inclusive on both ends):

```sql
SELECT title, year FROM books WHERE year BETWEEN 1990 AND 2020;
```

This is equivalent to `WHERE year >= 1990 AND year <= 2020`.

#### IN

`IN` checks if a value matches any value in a list:

```sql
SELECT title, genre FROM books WHERE genre IN ('Cyberpunk', 'Fantasy');
```

This is equivalent to `WHERE genre = 'Cyberpunk' OR genre = 'Fantasy'`. `IN` is much cleaner when you have many values.

#### LIKE and Pattern Matching

`LIKE` does pattern matching on text. Two wildcards:
- `%` matches any sequence of characters (including zero)
- `_` matches exactly one character

```sql
SELECT title FROM books WHERE title LIKE '%Rust%';
```

Output:

```
title
---------------------------
The Rust Programming Langua
```

`%Rust%` means "anything, then Rust, then anything." It finds any title containing the word "Rust."

```sql
SELECT title FROM books WHERE author LIKE 'A%';
```

`A%` means "starts with A." This matches Andy Weir.

```sql
SELECT title FROM books WHERE title LIKE 'The %';
```
In SQLite, `LIKE` is case-insensitive for ASCII characters by default. For example, `LIKE '%rust%'` also matches `"Rust"`.
#### IS NULL and IS NOT NULL

To check for NULL values, you cannot use `=` because `NULL = NULL` is false in SQL (NULL means "unknown," and two unknowns are not equal). Use `IS NULL` and `IS NOT NULL`:

```sql
SELECT title FROM books WHERE year IS NULL;
```

This would return books with no publication year. We do not have any yet, so it returns nothing.

```sql
SELECT title, year FROM books WHERE year IS NOT NULL;
```

This returns all books (all our books have years).

### Sorting with ORDER BY

`ORDER BY` sorts the result set. It comes after `WHERE` (and after `GROUP BY` if present).

```sql
SELECT title, year FROM books ORDER BY year;
```

Ascending (oldest first) is the default. For descending, add `DESC`:

```sql
SELECT title, year FROM books ORDER BY year DESC;
```

You can sort by multiple columns:

```sql
SELECT title, author, year FROM books ORDER BY author, year DESC;
```

This sorts by author alphabetically. For books by the same author, it sorts by year descending (newest first).

```sql
SELECT title, year FROM books ORDER BY read, year DESC;
```

Now, let me explain what we just did.

Sorting by `read` first groups unread books together (read = 0 comes before read = 1 in ascending order). Within each read group, books are sorted by year descending. This is a common pattern: sort by a category first, then by a numeric value within each category.

### Limiting and Paginating with LIMIT and OFFSET

`LIMIT` restricts how many rows are returned. `OFFSET` skips rows at the beginning:

```sql
SELECT title, year FROM books ORDER BY year DESC LIMIT 3;
```

This returns the 3 most recent books.

```sql
SELECT title, year FROM books ORDER BY year DESC LIMIT 3 OFFSET 3;
```

This skips the first 3 and returns books 4 through 6. This is pagination. Page 1: `LIMIT 3 OFFSET 0`. Page 2: `LIMIT 3 OFFSET 3`. Page 3: `LIMIT 3 OFFSET 6`.

SQLite also supports a shorthand:

```sql
SELECT title, year FROM books ORDER BY year DESC LIMIT 3, 3;
```

`LIMIT 3, 3` means `LIMIT 3 OFFSET 3`. The first number is the offset, the second is the limit. I find this confusing, so I always write `LIMIT x OFFSET y`.

### Aggregate Functions

Aggregate functions compute a single value from multiple rows.

#### COUNT

```sql
SELECT COUNT(*) FROM books;
```

Returns `10`, the total number of rows.

```sql
SELECT COUNT(*) FROM books WHERE read = 1;
```

Returns `4`, the number of read books.

```sql
SELECT COUNT(DISTINCT author) FROM books;
```

Returns the number of unique authors. In our sample data there are 8 unique authors: Steve Klabnik, Andy Weir, James Clear, Frank Herbert, William Gibson, Neal Stephenson, Patrick Rothfuss, and Cal Newport.

#### SUM, AVG, MAX, MIN

```sql
SELECT MAX(year) FROM books;
```

Returns `2021`, the most recent publication year.

```sql
SELECT MIN(year) FROM books;
```

Returns `1965`.

```sql
SELECT AVG(year) FROM books;
```

Returns the average publication year.

```sql
SELECT SUM(read) FROM books;
```

Returns `4`, since `read` is `0` or `1`, summing gives the count of read books.

Because `read` stores `0` and `1`, `SUM(read)` gives the number of read books. This is a perfectly valid SQL technique. Some developers prefer `COUNT(*)` with a `WHERE` clause because it more clearly expresses the intent.

### Grouping with GROUP BY

`GROUP BY` groups rows that have the same values in specified columns. You then use aggregate functions on each group.

```sql
SELECT genre, COUNT(*) AS book_count FROM books GROUP BY genre;
```

Output:

```
genre            book_count
---------------  ----------
Programming      1
Science Fiction  3
Self-Help        2
Cyberpunk        2
Fantasy          2
```

Now, let me explain what we just did.

`GROUP BY genre` creates one row per unique genre. `COUNT(*)` counts how many books are in each group. `AS book_count` gives the count column a name. Without `AS`, the column would be named `COUNT(*)`, which is ugly.

The rule of `GROUP BY`: every column in the `SELECT` list must either be in the `GROUP BY` clause or be wrapped in an aggregate function. If you select `genre` and `title`, but only group by `genre`, which title should SQLite show? It cannot decide, so most databases reject this query. SQLite is lenient and picks an arbitrary title, but you should not rely on this.

#### GROUP BY with Multiple Columns

```sql
SELECT author, genre, COUNT(*) FROM books GROUP BY author, genre;
```

This groups by the combination of author and genre. If an author writes in multiple genres, they appear in multiple rows.

#### HAVING - Filtering Groups

`WHERE` filters rows before grouping. `HAVING` filters groups after grouping:

```sql
SELECT genre, COUNT(*) AS cnt FROM books
GROUP BY genre
HAVING cnt > 1;
```

Output:

```
genre            cnt
---------------  ---
Science Fiction  3
Self-Help        2
Cyberpunk        2
Fantasy          2
```

Now, let me explain what we just did.

`GROUP BY genre` creates the groups. `HAVING cnt > 1` keeps only groups with more than one book. Programming is excluded because it has only one book. The order of operations is: `FROM` → `WHERE` → `GROUP BY` → `HAVING` → `SELECT` → `ORDER BY` → `LIMIT`.

#### GROUP BY with Multiple Aggregates

```sql
SELECT
    genre,
    COUNT(*) AS total,
    SUM(read) AS read_count,
    ROUND(AVG(year)) AS avg_year
FROM books
GROUP BY genre
ORDER BY total DESC;
```

Now, let me explain what we just did.

Each genre group gets three computed values: the total number of books, the count of read books (by summing the `read` column, which is 0 or 1), and the rounded average publication year. `ROUND()` is a scalar function that rounds to the nearest integer. The result is sorted by total books, most popular genres first. This kind of query is the backbone of any dashboard or reporting feature.

### Updating Data

`UPDATE` modifies existing rows:

```sql
UPDATE books SET read = 1 WHERE id = 1;
```

Now, let me explain what we just did.

This marks book 1 as read. The `WHERE` clause is critical. If you omit it:

```sql
UPDATE books SET read = 1;  -- DANGER: updates ALL rows
```

Every book would be marked as read. Always double-check your `WHERE` clause before running an `UPDATE`.

You can update multiple columns:

```sql
UPDATE books SET read = 1, year = 2020 WHERE id = 6;
```

The `WHERE` clause can use any condition we have learned:

```sql
UPDATE books SET read = 1 WHERE author LIKE 'Andy%';
```

This marks all books by authors whose name starts with "Andy" as read.

### Deleting Data

`DELETE` removes rows:

```sql
DELETE FROM books WHERE id = 10;
```

Again, the `WHERE` clause is critical. Without it, every row is deleted:

```sql
DELETE FROM books;  -- DANGER: deletes ALL rows from the table
```

If you want to delete all rows in test data, a faster alternative is `DELETE FROM books` (which logs each deletion) or `TRUNCATE TABLE books` (not supported by SQLite, use `DELETE FROM books` instead).

### Subqueries

A subquery is a query nested inside another query. The inner query runs first, and its result is used by the outer query.

#### Subquery in WHERE

Find all books published in a year where at least one book was read:

```sql
SELECT title, year FROM books
WHERE year IN (SELECT year FROM books WHERE read = 1);
```

Now, let me explain what we just did.

The inner query `SELECT year FROM books WHERE read = 1` returns the years of all read books. The outer query finds all books published in any of those years, whether read or not. This is a semi-join pattern.

#### Subquery in SELECT

Show each book's publication year relative to the average:

```sql
SELECT
    title,
    year,
    year - (SELECT AVG(year) FROM books) AS diff_from_avg
FROM books
ORDER BY diff_from_avg DESC;
```

Now, let me explain what we just did.

The subquery `SELECT AVG(year) FROM books` computes the average publication year once. For each book, we compute how far its year is from that average. Books after the average have positive values. Books before the average have negative values. The subquery in `SELECT` must return exactly one row and one column (a scalar value).

#### Subquery in FROM

Find the genre with the most books:

```sql
SELECT genre, cnt FROM (
    SELECT genre, COUNT(*) AS cnt FROM books GROUP BY genre
) AS genre_counts
ORDER BY cnt DESC
LIMIT 1;
```

Now, let me explain what we just did.

The inner query creates a temporary table (`genre_counts`) with genre names and counts. The outer query takes that temporary result and sorts it to find the most common genre. Subqueries in `FROM` are called derived tables. They must have an alias (`AS genre_counts`). This pattern is useful for multi-step analysis where you need to query the result of an aggregation.

> There is a cleaner way to write this using a Common Table Expression (CTE or `WITH` clause), but we will save CTEs for a future article.

### Joining Tables

So far we have worked with a single table. Real databases have multiple related tables. Let's create two more tables to demonstrate joins.

#### Creating Related Tables

```sql
CREATE TABLE authors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE genres (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);
```

Now, let me explain what we just did.

`UNIQUE` means no two rows can have the same value in this column. If we try to insert "Andy Weir" twice into `authors`, the second insert fails. This prevents duplicate authors and genres.

Insert data into these tables:

```sql
INSERT INTO authors (name) VALUES
    ('Steve Klabnik'),
    ('Andy Weir'),
    ('James Clear'),
    ('Frank Herbert'),
    ('William Gibson'),
    ('Neal Stephenson'),
    ('Patrick Rothfuss'),
    ('Cal Newport');

INSERT INTO genres (name) VALUES
    ('Programming'),
    ('Science Fiction'),
    ('Self-Help'),
    ('Cyberpunk'),
    ('Fantasy');
```

Now we have three tables. But they are not connected. We need to link books to authors and genres.

#### Creating a Better Books Table

Let's drop our old books table and create one with foreign keys:

```sql
DROP TABLE books;

CREATE TABLE books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author_id INTEGER NOT NULL,
    genre_id INTEGER NOT NULL,
    year INTEGER,
    read INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (author_id) REFERENCES authors(id),
    FOREIGN KEY (genre_id) REFERENCES genres(id)
);
```

Now, let me explain what we just did.

`DROP TABLE books` deletes the entire table. This is irreversible. In a real application, you would use migrations to add columns to an existing table instead of dropping it. We are doing this for the learning exercise.

`author_id INTEGER NOT NULL` stores the ID from the `authors` table instead of the author's name directly. `genre_id` does the same for genres. `FOREIGN KEY (author_id) REFERENCES authors(id)` tells SQLite that `author_id` must match an existing `id` in the `authors` table. If you try to insert a book with `author_id = 999` when no author has that ID, the insert fails. This is called referential integrity.

> **Want to learn how to design relational databases?**
> We intentionally designed this schema to be simple so we can focus on learning SQL. In a real application, deciding **what tables to create, how they relate to each other, when to normalize data, which constraints to use, and which columns should be indexed** is an important skill on its own.
> I'll cover all of that in a dedicated follow-up article where we'll design relational databases from scratch, starting from application requirements and gradually evolving them into well-structured, production-ready schemas.

Insert books with the new schema:

```sql
INSERT INTO books (title, author_id, genre_id, year) VALUES
    ('The Rust Programming Language', 1, 1, 2018);

INSERT INTO books (title, author_id, genre_id, year) VALUES
    ('Project Hail Mary', 2, 2, 2021);

INSERT INTO books (title, author_id, genre_id, year, read) VALUES
    ('The Martian', 2, 2, 2011, 1);

INSERT INTO books (title, author_id, genre_id, year) VALUES
    ('Atomic Habits', 3, 3, 2018);

INSERT INTO books (title, author_id, genre_id, year, read) VALUES
    ('Dune', 4, 2, 1965, 1);

INSERT INTO books (title, author_id, genre_id, year) VALUES
    ('Neuromancer', 5, 4, 1984);

INSERT INTO books (title, author_id, genre_id, year) VALUES
    ('Snow Crash', 6, 4, 1992);

INSERT INTO books (title, author_id, genre_id, year, read) VALUES
    ('The Name of the Wind', 7, 5, 2007, 1);

INSERT INTO books (title, author_id, genre_id, year) VALUES
    ('A Wise Man's Fear', 7, 5, 2011);

INSERT INTO books (title, author_id, genre_id, year, read) VALUES
    ('Deep Work', 8, 3, 2016, 1);
```

Now if we `SELECT * FROM books`, we see IDs instead of names. That is not helpful for humans. We need to join the tables.

#### INNER JOIN

An `INNER JOIN` combines rows from two tables based on a matching condition. It only returns rows where the match exists in both tables:

```sql
SELECT books.title, authors.name AS author, genres.name AS genre
FROM books
INNER JOIN authors ON books.author_id = authors.id
INNER JOIN genres ON books.genre_id = genres.id;
```

Output:

```
title                        author             genre
---------------------------  -----------------  ---------------
The Rust Programming Langua  Steve Klabnik      Programming
Project Hail Mary            Andy Weir          Science Fiction
The Martian                  Andy Weir          Science Fiction
Atomic Habits                James Clear        Self-Help
Dune                         Frank Herbert      Science Fiction
Neuromancer                  William Gibson     Cyberpunk
Snow Crash                   Neal Stephenson    Cyberpunk
The Name of the Wind         Patrick Rothfuss   Fantasy
A Wise Man's Fear             Patrick Rothfuss   Fantasy
Deep Work                    Cal Newport        Self-Help
```

Now, let me explain what we just did.

`FROM books` starts with the books table. `INNER JOIN authors ON books.author_id = authors.id` takes each book row, looks up the matching author row where `authors.id` equals `books.author_id`, and combines them into a single result row. `INNER JOIN genres ON books.genre_id = genres.id` does the same for genres. The result looks like our original flat table, but the data is normalised, author names and genre names are stored only once, in their own tables. If an author's name changes, we update one row in `authors`, not every book by that author.

When joining, you can prefix column names with the table name (`books.title`, `authors.name`) to avoid ambiguity. If two tables have columns with the same name, you must qualify them.

#### LEFT JOIN

An `INNER JOIN` excludes rows that do not have a match. A `LEFT JOIN` includes all rows from the left table, filling unmatched columns with `NULL`:

Let's add an author with no books:

```sql
INSERT INTO authors (name) VALUES ('Isaac Asimov');
```

Now compare:

```sql
-- INNER JOIN: only authors who have books
SELECT authors.name, COUNT(books.id) AS book_count
FROM authors
INNER JOIN books ON authors.id = books.author_id
GROUP BY authors.name
ORDER BY book_count DESC;
```

This only shows the 8 authors who have books. Isaac Asimov is excluded.

```sql
-- LEFT JOIN: all authors, even those with no books
SELECT authors.name, COUNT(books.id) AS book_count
FROM authors
LEFT JOIN books ON authors.id = books.author_id
GROUP BY authors.name
ORDER BY book_count DESC;
```

Isaac Asimov appears with `book_count = 0`.

Now, let me explain what we just did.

`LEFT JOIN` keeps every row from the left table (`authors`). For Isaac Asimov, there are no matching `books` rows, so `books.id` is `NULL` for that joined row. `COUNT(books.id)` counts only non-NULL values, so it returns `0`. This is how you find authors with no books, genres with no books, or any "missing" relationship.

#### Join with Filtering and Sorting

You can combine joins with everything else we have learned:

```sql
SELECT
    authors.name AS author,
    books.title,
    books.year,
    genres.name AS genre
FROM books
INNER JOIN authors ON books.author_id = authors.id
INNER JOIN genres ON books.genre_id = genres.id
WHERE books.read = 0
    AND genres.name = 'Science Fiction'
ORDER BY books.year DESC;
```

This finds all unread science fiction books, sorted by publication year (newest first). The query reads almost like English: "Select author name, book title, year, and genre name from books, joined with authors and genres, where the book is unread and the genre is Science Fiction, sorted by year descending."

### Transactions


Start a transaction with `BEGIN`, run your statements, then `COMMIT` to save or `ROLLBACK` to undo:

```sql
BEGIN;
INSERT INTO books (title, author_id, genre_id, year) VALUES
    ('Foundation', 9, 2, 1951);
INSERT INTO books (title, author_id, genre_id, year) VALUES
    ('Foundation and Empire', 9, 2, 1952);
INSERT INTO books (title, author_id, genre_id, year) VALUES
    ('Second Foundation', 9, 2, 1953);
COMMIT;
```

Now, let me explain what we just did.

All three inserts happen within a single transaction. If the computer crashes after the first insert but before `COMMIT`, the database rolls back to the state before `BEGIN`. Other database connections do not observe the changes until the transaction commits, subject to SQLite's transaction isolation rules.

Try a rollback:

```sql
BEGIN;
INSERT INTO books (title, author_id, genre_id, year) VALUES
    ('I, Robot', 9, 2, 1950);
ROLLBACK;
```

The insert is undone. `I, Robot` does not appear in the table.

Transactions are essential for data integrity. Without them, a crash during a bulk import leaves your database in an inconsistent state. With them, it is all or nothing.

### Indexes

When you run `SELECT * FROM books WHERE author_id = 5`, SQLite scans every row in the table checking the condition. With 10 rows, this is instant. With 10,000,000 rows, it is slow. An index speeds up lookups:

```sql
CREATE INDEX idx_books_author_id ON books(author_id);
CREATE INDEX idx_books_genre_id ON books(genre_id);
```

Now, let me explain what we just did.

An index is a separate data structure (a B-tree) that maps values to row locations. When you query `WHERE author_id = 5`, SQLite looks up `5` in the index (using a B-tree) instead of scanning every row in the table, making lookups, joins, and many sorts much more efficient on large datasets. Indexes also speed up `ORDER BY` and `JOIN` operations on the indexed columns.

Indexes have a cost. Every `INSERT`, `UPDATE`, and `DELETE` must also update the indexes. And indexes take up disk space. Index columns you frequently filter or join on. Do not index columns that are rarely queried.

To see what indexes exist:

```
.indexes
```

SQLite also provides `EXPLAIN QUERY PLAN` to show how it intends to execute a query. Other database systems provide similar commands, although the syntax differs:

```sql
EXPLAIN QUERY PLAN SELECT * FROM books WHERE author_id = 5;
```

### SQL Summary

We have covered a lot in this first part of the article. Here is a quick reference of the SQL concepts you now know.

|Clause / Keyword|What It Does|Example|
|---|---|---|
|`CREATE TABLE`|Defines a new table|`CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)`|
|`INSERT INTO`|Adds rows|`INSERT INTO t (name) VALUES ('Alice')`|
|`SELECT`|Retrieves data|`SELECT * FROM t`|
|`SELECT DISTINCT`|Returns unique values|`SELECT DISTINCT name FROM t`|
|`WHERE`|Filters rows|`WHERE age > 18`|
|`AND`, `OR`, `NOT`|Combines conditions|`WHERE a AND (b OR NOT c)`|
|`BETWEEN`|Range check|`WHERE x BETWEEN 1 AND 10`|
|`IN`|Checks membership in a list|`WHERE color IN ('red', 'blue')`|
|`LIKE`|Pattern matching|`WHERE name LIKE 'A%'`|
|`IS NULL`, `IS NOT NULL`|Checks for NULL values|`WHERE email IS NULL`|
|`ORDER BY`|Sorts results|`ORDER BY year DESC`|
|`LIMIT`, `OFFSET`|Paginates results|`LIMIT 10 OFFSET 20`|
|`COUNT`, `SUM`, `AVG`|Aggregate functions|`SELECT COUNT(*) FROM t`|
|`MAX`, `MIN`|Finds extreme values|`SELECT MAX(score) FROM t`|
|`GROUP BY`|Groups rows for aggregation|`GROUP BY category`|
|`HAVING`|Filters grouped results|`HAVING COUNT(*) > 5`|
|`UPDATE`|Modifies existing rows|`UPDATE t SET x = 1 WHERE id = 1`|
|`DELETE`|Removes rows|`DELETE FROM t WHERE id = 1`|
|`INNER JOIN`|Combines matching rows from multiple tables|`... INNER JOIN b ON a.id = b.a_id`|
|`LEFT JOIN`|Keeps all rows from the left table|`... LEFT JOIN b ON a.id = b.a_id`|
|`FOREIGN KEY`|Enforces relationships between tables|`FOREIGN KEY (x) REFERENCES t(id)`|
|`BEGIN`, `COMMIT`|Starts and commits a transaction|`BEGIN; ... COMMIT;`|
|`ROLLBACK`|Cancels a transaction|`BEGIN; ... ROLLBACK;`|
|`CREATE INDEX`|Speeds up lookups|`CREATE INDEX idx ON t(col)`|
|`EXPLAIN QUERY PLAN`|Shows how SQLite executes a query|`EXPLAIN QUERY PLAN SELECT ...`|

At this point, you know enough SQL to build real applications. You can create tables, modify data, query it in different ways, combine related tables with joins, and write efficient queries using indexes and transactions.

The next step is bringing those SQL queries into Rust. In Part 2, we'll learn SQLx, a library that lets us write raw SQL while giving us compile-time query checking, asynchronous database access, and a powerful migration system. Once we've learned SQLx, we'll put everything together in Part 3 by building our complete Book Library CLI.

## Part 2: SQLx - SQL Meets Rust

### Why SQLx

Rust has several libraries for working with databases, each with a different philosophy.

|Library|Style|Async|Compile-Time Query Checks|
|---|---|:-:|:-:|
|Diesel|ORM with its own query DSL|No (synchronous)|Yes|
|SeaORM|ORM built on top of SQLx|Yes|Via SQLx|
|rusqlite|Raw SQL|No (synchronous)|No|
|SQLx|Raw SQL|Yes|Yes|

For this series, we'll use **SQLx**.

There are three reasons.

First, it is fully asynchronous and integrates directly with Tokio, making it suitable for modern Rust applications.

Second, it lets us write **real SQL** instead of learning another query language. We just spent the entire first half of this article learning SQL, so it makes sense to use that knowledge directly.

Finally and this is SQLx's biggest feature, it verifies your SQL queries at compile time against your actual database schema. If you misspell a column name, reference a table that doesn't exist, or try to map an SQL type to an incompatible Rust type, the compiler reports the error before your application ever runs.

That combination of asynchronous I/O, raw SQL, and compile-time verification makes SQLx one of the most popular choices for database access in modern Rust applications.

### Compile-Time Checked Queries

This is SQLx's signature feature. When you write:

```rust
let books = sqlx::query!("SELECT id, title, author FROM books")
    .fetch_all(&pool)
    .await?;
```

At compile time, SQLx:

1.  Reads your `DATABASE_URL` environment variable
2.  Connects to the database
3. Asks the database to validate the query and report information about the result columns and parameter types. The exact mechanism depends on the database backend.
4.  Checks that every column you are selecting actually exists
5.  Checks that the types match (TEXT maps to `String`, INTEGER maps to `i64`, etc.)
6.  Generates a struct with the correct field names and types

If you mistype a column name:

```rust
let books = sqlx::query!("SELECT id, title, authr FROM books")
    .fetch_all(&pool)
    .await?;
```

The compiler gives you an error:

```
error: no such column: authr
```


If you mismatch the number of parameters:

```rust
sqlx::query!("INSERT INTO books (title, author) VALUES (?, ?, ?)", ...)
```

The compiler tells you that you have 2 columns but 3 parameters.

### Setting Up SQLx

Add to `Cargo.toml`:

```toml
[dependencies]
sqlx = { version = "0.9", features = ["runtime-tokio", "sqlite", "macros", "migrate"] }
tokio = { version = "1", features = ["full"] }
```

`runtime-tokio` tells SQLx to use Tokio for async I/O. `sqlite` enables the SQLite driver.

Set the database URL environment variable. You need this set whenever you compile because the macros connect to the database:

```bash
export DATABASE_URL=sqlite:books.db
```

`sqlite:books.db` means "SQLite database in the file `books.db`." You can also use `sqlite::memory:` for an in-memory database (ephemeral), or `sqlite:/absolute/path/to/db.sqlite` for a specific location.

### Connection Pooling with SqlitePool

A connection pool holds multiple open connections. Tasks check out connections, use them, and return them. This gives concurrent database access without serialising everything through a mutex:

```rust
use sqlx::sqlite::SqlitePoolOptions;

let pool = SqlitePoolOptions::new()
    .max_connections(5)
    .connect("sqlite:books.db")
    .await?;
```

Now, let me explain what we just did.

`SqlitePoolOptions::new()` creates a builder. `.max_connections(5)` sets the pool size. Five is a reasonable default for many SQLite applications. SQLite supports many concurrent readers but only one writer at a time, so increasing the pool size does not necessarily improve write throughput. `.connect("sqlite:books.db").await` opens the file and creates the initial connections. The pool is cheap to clone (it uses `Arc` internally). Pass clones to different async tasks.

### Running Migrations

Migrations are versioned SQL files that define your schema. SQLx keeps track of which migrations have already been applied so each migration is executed only once. When you run migrations, SQLx applies any that have not been applied yet. Create a `migrations` directory and add numbered SQL files:

`migrations/0001_initial.sql`:

```sql
CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    genre TEXT NOT NULL,
    read INTEGER NOT NULL DEFAULT 0
);
```

`migrations/0002_add_rating.sql`:

```sql
ALTER TABLE books ADD COLUMN rating INTEGER;
```

In Rust:

```rust
sqlx::migrate!("./migrations").run(&pool).await?;
```

The `migrate!` macro embeds the SQL files into the binary at compile time. At runtime, `.run(&pool)` applies pending migrations. This is idempotent, running it multiple times is safe.

### The query! Macros

SQLx provides three macros for different return shapes.

#### `query!` - Ad-Hoc Structs

The macro generates an anonymous struct with fields matching the selected columns:

```rust
let rows = sqlx::query!("SELECT id, title, author FROM books")
    .fetch_all(&pool)
    .await?;

for row in rows {
    println!("{}. {} by {}", row.id, row.title, row.author);
}
```

The generated struct has fields `id: i64`, `title: String`, `author: String`. You cannot name this type or store it in a struct field. Use it for quick queries where you consume the result immediately.

#### `query_as!` - Maps to Your Structs

Define a struct and derive `FromRow`:

```rust
#[derive(Debug, sqlx::FromRow)]
struct Book {
    id: i64,
    title: String,
    author: String,
    genre: String,
    read: bool,
}

let books = sqlx::query_as!(Book, "SELECT id, title, author, genre, read FROM books")
    .fetch_all(&pool)
    .await?;
```

The macro checks that every field in `Book` has a matching column, that the types are compatible, and that no required column is missing. `read: bool` maps `0`/`1` integers automatically.

Although this example derives `sqlx::FromRow`, the `query_as!` macro does not actually require it because the macro generates the mapping at compile time. `FromRow` is mainly used with the runtime `query_as::<_, T>()` API.

#### `query_scalar!` - Single Value

For queries that return one column and one row:

```rust
let count = sqlx::query_scalar!("SELECT COUNT(*) as count FROM books")
    .fetch_one(&pool)
    .await?;
```

`fetch_one` expects exactly one row. If there are zero or more than one, it returns an error.

#### Parameterised Queries

All three macros support `?` placeholders with parameters:

```rust
sqlx::query!(
    "INSERT INTO books (title, author, genre) VALUES (?, ?, ?)",
    title,
    author,
    genre,
)
.execute(&pool)
.await?;
```

The macro checks at compile time that the number of `?` matches the number of parameters, and that each parameter's Rust type is compatible with the SQL column type. Parameters are bound separately, not interpolated into the SQL string, this prevents SQL injection.

## Part 3: The Project - Book Library CLI

Now that you know SQL and SQLx, let's build a Book Library CLI. Our program will:

-   Store books in a SQLite database with title, author, genre, publication year, read status, and rating
-   Run two migrations: create the `books` table, then add a `rating` column
-   Add, list, search, update, rate, and delete books
-   Search by title, author, or genre with `LIKE` patterns
-   Show genre statistics with `GROUP BY` and `COUNT`
-   Sort results by title, year, or rating with `ORDER BY`
-   Support pagination with `LIMIT` and `OFFSET`
-   Import books in bulk from JSON using transactions
-   Every query is type-safe and checked against the live database at compile time

### Project Setup

```bash
cargo new bookcli
cd bookcli
mkdir -p migrations
```

`Cargo.toml`:

```toml
[package]
name = "bookcli"
version = "0.1.0"
edition = "2021"

[dependencies]
sqlx = { version = "0.9", features = ["runtime-tokio", "sqlite", "macros", "migrate"] }
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "2"
```

Set the database URL. Create a `.env` file so the macros can find it at compile time:

```bash
echo 'DATABASE_URL=sqlite:books.db' > .env
```

You can also export it in your shell (the `.env` file is the most reliable approach since it is checked before every compile):

```bash
export DATABASE_URL=sqlite:books.db
```

### Migration Files

`migrations/0001_initial.sql`:

```sql
CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    genre TEXT NOT NULL,
    year INTEGER,
    read INTEGER NOT NULL DEFAULT 0
);
```

`migrations/0002_add_rating.sql`:

```sql
ALTER TABLE books ADD COLUMN rating INTEGER;
```

### Bootstrap the Database

Before the macros can verify queries, the database must exist with the schema applied. Write a minimal `src/main.rs` to run migrations:

```rust
use sqlx::sqlite::SqlitePoolOptions;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect("sqlite:books.db")
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;

    println!("Database set up successfully.");
    Ok(())
}
```

Run it once:

```
cargo run
```

Now `books.db` exists with the schema applied. Delete the temporary main and let's build the real CLI.

(Alternatively, you can use `sqlx database create && sqlx migrate run` instead of the temporary main.rs. This requires `sqlx-cli` to be installed: `cargo install sqlx-cli`.)

### The Book Struct, Error Type, and Display

```rust
use sqlx::FromRow;
use thiserror::Error;
use std::fmt;

#[derive(Debug, FromRow)]
struct Book {
    id: i64,
    title: String,
    author: String,
    genre: String,
    year: Option<i64>,
    read: i64,
    rating: Option<i64>,
}

#[derive(Error, Debug)]
enum AppError {
    #[error("Database error: {0}")]
    Db(#[from] sqlx::Error),

    #[error("Migration error: {0}")]
    Migrate(#[from] sqlx::migrate::MigrateError),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("{0}")]
    Message(String),
}

impl fmt::Display for Book {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let status = if self.read != 0 { "[x]" } else { "[ ]" };
        let year_str = self.year.map(|y| y.to_string()).unwrap_or_else(|| "????".to_string());
        write!(f, "{} {:3}. {} by {} ({}) [{}]",
            status, self.id, self.title, self.author, self.genre, year_str)?;
        if let Some(r) = self.rating {
            write!(f, " ★{}", r)?;
        }
        Ok(())
    }
}
```

Now, let me explain what we just did.

`Book` has all the columns from our schema. `year` is `Option<i64>` because some books might not have a publication year. `read` is `i64`, SQLite stores booleans as `0`/`1` integers, and the `query_as!` macro sees `INTEGER` in the schema and requires `i64`. We treat `0` as unread and any non-zero value as read. `rating` is `Option<i64>` because the second migration added it later and existing rows default to `NULL`.

Note that when you *bind* a Rust `bool` as a query parameter (e.g., in `mark_book`), SQLx's `Encode` trait converts `false` → `0` and `true` → `1` automatically. The asymmetry is that *reading* a column back must match the Rust field type, while *writing* a parameter can convert freely.

`AppError` has variants for database errors, migration errors, I/O errors, JSON parsing errors, and custom messages. The `#[from]` attributes let us use `?` on `sqlx::Error`, `MigrateError`, `std::io::Error`, and `serde_json::Error`, they auto-convert.

`Display` for `Book` uses `[x]` for read, `[ ]` for unread, and shows the year (or `????` if unknown). If a rating exists, it shows stars.

### Database Initialisation

```rust
use sqlx::sqlite::{SqlitePool, SqlitePoolOptions};

async fn init_db() -> Result<SqlitePool, AppError> {
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect("sqlite:books.db")
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;

    Ok(pool)
}
```

### Adding a Book

```rust
async fn add_book(
    pool: &SqlitePool,
    title: &str,
    author: &str,
    genre: &str,
    year: Option<i64>,
) -> Result<(), AppError> {
    sqlx::query!(
        "INSERT INTO books (title, author, genre, year) VALUES (?, ?, ?, ?)",
        title,
        author,
        genre,
        year,
    )
    .execute(pool)
    .await?;

    println!("Added: \"{}\" by {}", title, author);
    Ok(())
}
```

Now, let me explain what we just did.

`year: Option<i64>` is passed directly as a parameter. SQLx maps `None` to SQL `NULL` and `Some(n)` to the integer `n`. The `?` placeholder accepts either. The macro verifies that the type (`Option<i64>`) is compatible with the column type (`INTEGER`).

### Listing Books with Sorting and Pagination

```rust
async fn list_books(
    pool: &SqlitePool,
    unread_only: bool,
    sort_by: &str,
    descending: bool,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<(), AppError> {
    let order_col = match sort_by {
        "year" => "year",
        "rating" => "rating",
        "author" => "author",
        "genre" => "genre",
        _ => "id",
    };

    let direction = if descending { "DESC" } else { "ASC" };

    let books = if unread_only {
        // Because the SQL is built dynamically, we use the non-macro query!
        // for the WHERE clause variation. But for compile-time checking,
        // we use the macro on the base query pattern.
        sqlx::query_as!(
            Book,
            "SELECT id, title, author, genre, year, read, rating FROM books WHERE read = 0 ORDER BY id"
        )
        .fetch_all(pool)
        .await?
    } else {
        sqlx::query_as!(
            Book,
            "SELECT id, title, author, genre, year, read, rating FROM books ORDER BY id"
        )
        .fetch_all(pool)
        .await?
    };

    // Sorting and pagination are applied in Rust since the ORDER BY
    // and LIMIT/OFFSET vary at runtime. This is fine for CLI-scale data.
    let mut books = books;
    books.sort_by(|a, b| {
        let cmp = match order_col {
            "year" => a.year.cmp(&b.year).then(a.title.cmp(&b.title)),
            "rating" => a.rating.cmp(&b.rating).then(a.title.cmp(&b.title)),
            "author" => a.author.cmp(&b.author).then(a.title.cmp(&b.title)),
            "genre" => a.genre.cmp(&b.genre).then(a.title.cmp(&b.title)),
            _ => a.id.cmp(&b.id),
        };
        if descending { cmp.reverse() } else { cmp }
    });

    let start = offset.unwrap_or(0) as usize;
    let end = limit.map(|l| start + l as usize).unwrap_or(books.len());
    let page: Vec<&Book> = books.iter().skip(start).take(end.saturating_sub(start)).collect();

    if page.is_empty() {
        println!("No books found.");
    } else {
        for book in &page {
            println!("{}", book);
        }
        println!("\n{} book(s) shown (total: {})", page.len(), books.len());
    }

    Ok(())
}
```

Now, let me explain what we just did.

Dynamic sorting and pagination are tricky with compile-time checked macros because `ORDER BY` and `LIMIT` vary at runtime. One approach is to use `sqlx::QueryBuilder` for fully dynamic SQL. Another approach, which we use here, is to fetch all matching rows with a compile-time checked query and then sort and paginate in Rust. For a personal book library with hundreds or thousands of books, this is perfectly fast. For millions of rows, you would use dynamic SQL with `QueryBuilder` or separate compile-time queries for each sort order.

The `.sort_by()` closure compares fields based on the `order_col` string. `Option<i64>` comparison puts `None` before `Some(n)`. For pagination, we `skip(offset)` and `take(limit)` using standard iterator methods. We show the page count and total count so the user knows where they are.

An alternative approach which demonstrates more SQL is to build the query with `sqlx::query_as` (runtime-checked, not compile-time checked) and string interpolation for the `ORDER BY` and `LIMIT` clauses. But the parameters must still be bound through placeholders, never string-interpolated:

```
// Example of dynamic ORDER BY using runtime query (no compile-time check on sort column):
let query_str = format!(
    "SELECT id, title, author, genre, year, read, rating FROM books ORDER BY {} {} LIMIT ? OFFSET ?",
    order_col, direction
);
// This loses compile-time checking for the ORDER BY clause.
// For a learning project, sorting in Rust is simpler and safer.
```

We will stick with sorting in Rust for clarity.

### Searching Books

```rust
async fn search_books(pool: &SqlitePool, query: &str) -> Result<(), AppError> {
    let pattern = format!("%{}%", query);

    let books = sqlx::query_as!(
        Book,
        "SELECT id, title, author, genre, year, read, rating FROM books
         WHERE title LIKE ? OR author LIKE ? OR genre LIKE ?
         ORDER BY id",
        pattern,
        pattern,
        pattern,
    )
    .fetch_all(pool)
    .await?;

    if books.is_empty() {
        println!("No books matching \"{}\".", query);
    } else {
        for book in &books {
            println!("{}", book);
        }
        println!("\n{} book(s) found", books.len());
    }

    Ok(())
}
```

Now, let me explain what we just did.

`LIKE` with `%query%` does a substring search across title, author, and genre. All three columns use the same pattern. The macro checks that three `?` placeholders match three parameters. This is the same `LIKE` we practiced in Part 1.

### Searching by Author or Genre

```rust
async fn search_by_author(pool: &SqlitePool, author: &str) -> Result<(), AppError> {
    let pattern = format!("%{}%", author);

    let books = sqlx::query_as!(
        Book,
        "SELECT id, title, author, genre, year, read, rating FROM books WHERE author LIKE ? ORDER BY year DESC",
        pattern,
    )
    .fetch_all(pool)
    .await?;

    if books.is_empty() {
        println!("No books by author matching \"{}\".", author);
    } else {
        for book in &books {
            println!("{}", book);
        }
        println!("\n{} book(s) found", books.len());
    }

    Ok(())
}

async fn search_by_genre(pool: &SqlitePool, genre: &str) -> Result<(), AppError> {
    let pattern = format!("%{}%", genre);

    let books = sqlx::query_as!(
        Book,
        "SELECT id, title, author, genre, year, read, rating FROM books WHERE genre LIKE ? ORDER BY year DESC",
        pattern,
    )
    .fetch_all(pool)
    .await?;

    if books.is_empty() {
        println!("No books in genre matching \"{}\".", genre);
    } else {
        for book in &books {
            println!("{}", book);
        }
        println!("\n{} book(s) found", books.len());
    }

    Ok(())
}
```

The search by author and genre both sort by year descending, newest first. This is useful: when you browse an author's work, you typically want to see their latest book first.

### Getting Genre Statistics with GROUP BY

This is where we use the SQL we learned in Part 1 to build a useful feature:

```rust
async fn genre_stats(pool: &SqlitePool) -> Result<(), AppError> {
    #[derive(Debug)]
    struct GenreStat {
        genre: String,
        total: i64,
        read_count: i64,
        avg_rating: Option<f64>,
    }

    let rows = sqlx::query!(
        "SELECT
            genre,
            COUNT(*) as total,
            SUM(read) as read_count,
            AVG(CAST(rating AS REAL)) as avg_rating
         FROM books
         GROUP BY genre
         ORDER BY total DESC, genre ASC"
    )
    .fetch_all(pool)
    .await?;

    if rows.is_empty() {
        println!("No books in the library.");
        return Ok(());
    }

    println!("{:<20} {:>6} {:>6} {:>10}", "Genre", "Books", "Read", "Avg Rating");
    println!("{}", "-".repeat(46));

    for row in rows {
        let avg = row.avg_rating
            .map(|r| format!("{:.1}", r))
            .unwrap_or_else(|| "  -".to_string());
        println!(
            "{:<20} {:>6} {:>6} {:>10}",
            row.genre,
            row.total,
            row.read_count,
            avg,
        );
    }

    Ok(())
}
```

Now, let me explain what we just did.

This query uses `GROUP BY genre` with three aggregate functions: `COUNT(*)` for total books, `SUM(read)` for read books (summing 0s and 1s), and `AVG(CAST(rating AS REAL))` for the average rating. The `CAST(rating AS REAL)` is needed because `AVG` on an `INTEGER` column causes the sqlx macro to infer `Option<i64>` instead of `Option<f64>`, which leads to wrong formatting (no decimal places) or a runtime type mismatch crash. `ORDER BY total DESC, genre ASC` puts the most popular genres first and breaks ties alphabetically.

`query!` generates an anonymous struct. We access fields as `row.genre`, `row.total`, etc. `row.read_count` is `i64` (not optional) because sqlx infers `SUM(read)` on a `NOT NULL` column as non-nullable over a non-empty group. No `.unwrap_or(0)` needed. `row.avg_rating` is `Option<f64>`,  `AVG` can return `NULL` when there are no ratings. We format it to one decimal place or show `-` if no ratings exist.

### Showing Author Statistics

```rust
async fn author_stats(pool: &SqlitePool) -> Result<(), AppError> {
    let rows = sqlx::query!(
        "SELECT
            author,
            COUNT(*) as total,
            SUM(read) as read_count,
            MIN(year) as first_published,
            MAX(year) as latest_published
         FROM books
         GROUP BY author
         HAVING total > 0
         ORDER BY total DESC, author ASC"
    )
    .fetch_all(pool)
    .await?;

    if rows.is_empty() {
        println!("No books in the library.");
        return Ok(());
    }

    println!("{:<20} {:>6} {:>6} {:>14} {:>14}", "Author", "Books", "Read", "First Pub", "Latest Pub");
    println!("{}", "-".repeat(66));

    for row in rows {
        let first = row.first_published.map(|y| y.to_string()).unwrap_or_else(|| "  ?".to_string());
        let latest = row.latest_published.map(|y| y.to_string()).unwrap_or_else(|| "  ?".to_string());
        println!(
            "{:<20} {:>6} {:>6} {:>14} {:>14}",
            row.author.as_deref().unwrap_or("?"),
            row.total,
            row.read_count,
            first,
            latest,
        );
    }

    Ok(())
}
```

Now, let me explain what we just did.

`GROUP BY author` with `MIN(year)` and `MAX(year)` shows the span of each author's work. This uses `HAVING total > 0` even though it is redundant (no author has 0 books because they are grouped from the books table). I include it to show the `HAVING` syntax in a real query. `MIN` and `MAX` on `year` (which is `INTEGER`) return the earliest and latest publication years. If all `year` values are `NULL`, they return `NULL`.

### Marking Books, Rating, and Deleting

```rust
async fn mark_book(pool: &SqlitePool, id: i64, read: bool) -> Result<(), AppError> {
    let result = sqlx::query!(
        "UPDATE books SET read = ? WHERE id = ?",
        read,
        id,
    )
    .execute(pool)
    .await?;

    if result.rows_affected() == 0 {
        println!("No book found with ID {}.", id);
    } else {
        let status = if read { "read" } else { "unread" };
        println!("Marked book {} as {}.", id, status);
    }

    Ok(())
}

async fn rate_book(pool: &SqlitePool, id: i64, rating: i64) -> Result<(), AppError> {
    if rating < 1 || rating > 5 {
        return Err(AppError::Message("Rating must be between 1 and 5.".to_string()));
    }

    let result = sqlx::query!(
        "UPDATE books SET rating = ? WHERE id = ?",
        rating,
        id,
    )
    .execute(pool)
    .await?;

    if result.rows_affected() == 0 {
        println!("No book found with ID {}.", id);
    } else {
        println!("Rated book {} with {} stars.", id, rating);
    }

    Ok(())
}

async fn delete_book(pool: &SqlitePool, id: i64) -> Result<(), AppError> {
    let result = sqlx::query!("DELETE FROM books WHERE id = ?", id)
        .execute(pool)
        .await?;

    if result.rows_affected() == 0 {
        println!("No book found with ID {}.", id);
    } else {
        println!("Deleted book {}.", id);
    }

    Ok(())
}
```

`rows_affected()` tells us whether any row was actually updated or deleted. If the ID does not exist, we get `0` and print a message.

### Counting with query_scalar!

```rust
async fn show_counts(pool: &SqlitePool) -> Result<(), AppError> {
    let total = sqlx::query_scalar!("SELECT COUNT(*) as count FROM books")
        .fetch_one(pool)
        .await?;

    let read_count = sqlx::query_scalar!("SELECT COUNT(*) as count FROM books WHERE read = 1")
        .fetch_one(pool)
        .await?;

    let has_ratings = sqlx::query_scalar!("SELECT COUNT(*) as count FROM books WHERE rating IS NOT NULL")
        .fetch_one(pool)
        .await?;

    let avg_rating = sqlx::query_scalar!("SELECT AVG(CAST(rating AS REAL)) as avg_rating FROM books WHERE rating IS NOT NULL")
        .fetch_one(pool)
        .await?;

    println!("Total books:     {}", total);
    println!("Read:            {} ({}%)", read_count,
        if total > 0 { (read_count * 100) / total } else { 0 });
    println!("Unread:          {}", total - read_count);
    println!("With ratings:    {}", has_ratings);
    if let Some(avg) = avg_rating {
        println!("Average rating:  {:.1} / 5", avg);
    }

    Ok(())
}
```

Now, let me explain what we just did.

Four separate `query_scalar!` calls. `COUNT(*)` never returns `NULL` in SQL, so the macro infers `i64` directly, not `Option<i64>`. We do **not** call `.unwrap_or(0)` because the type is already `i64`.

`AVG(CAST(rating AS REAL))` uses `CAST` because without it, sqlx infers `AVG(rating)` on an `INTEGER` column as `Option<i64>` (it reasons from the input column type rather than the SQL return type of `AVG`). At runtime, SQLite returns a `REAL` value, causing a type mismatch crash. With `CAST`, sqlx infers `Option<f64>` correctly, and we handle it with `if let Some(avg)`.

### Bulk Import with Transactions

```rust
use serde::Deserialize;

#[derive(Deserialize)]
struct BookImport {
    title: String,
    author: String,
    genre: String,
    year: Option<i64>,
}

async fn import_books(pool: &SqlitePool, file_path: &str) -> Result<(), AppError> {
    let content = tokio::fs::read_to_string(file_path).await?;
    let imports: Vec<BookImport> = serde_json::from_str(&content)
        .map_err(|e| AppError::Message(format!("Invalid JSON: {}", e)))?;

    println!("Importing {} books...", imports.len());

    let mut tx = pool.begin().await?;

    for (i, book) in imports.iter().enumerate() {
        sqlx::query!(
            "INSERT INTO books (title, author, genre, year) VALUES (?, ?, ?, ?)",
            book.title,
            book.author,
            book.genre,
            book.year,
        )
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Message(format!("Row {}: {}", i + 1, e)))?;
    }

    tx.commit().await?;

    println!("Successfully imported {} books.", imports.len());
    Ok(())
}
```

Now, let me explain what we just did.

`pool.begin().await?` starts a transaction. Inside the loop, we pass `&mut *tx` to `.execute()`,  this tells SQLx to run within the transaction. If any insert fails, the `?` returns early, the `Transaction` is dropped before commit, and SQLx automatically rolls back. `tx.commit().await?` makes all inserts permanent.

The error is wrapped with the row number for debugging. If row 42 has a typo in the JSON, the error tells you exactly which row.

### CLI Parsing

```rust
use std::env;

async fn run() -> Result<(), AppError> {
    let pool = init_db().await?;

    let args: Vec<String> = env::args().collect();

    if args.len() < 2 {
        print_usage();
        return Ok(());
    }

    match args[1].as_str() {
        "add" => {
            if args.len() < 5 {
                println!("Usage: cargo run -- add <title> <author> <genre> [year]");
                return Ok(());
            }
            let year: Option<i64> = if args.len() > 5 {
                Some(args[5].parse().map_err(|_| AppError::Message("Invalid year.".to_string()))?)
            } else {
                None
            };
            add_book(&pool, &args[2], &args[3], &args[4], year).await?;
        }
        "list" => {
            let mut unread_only = false;
            let mut sort_by = "id";
            let mut descending = false;
            let mut limit: Option<i64> = None;
            let mut offset: Option<i64> = None;

            let mut i = 2;
            while i < args.len() {
                match args[i].as_str() {
                    "--unread" => unread_only = true,
                    "--sort" => {
                        i += 1;
                        if i < args.len() { sort_by = &args[i]; }
                    }
                    "--desc" => descending = true,
                    "--limit" => {
                        i += 1;
                        if i < args.len() { limit = args[i].parse().ok(); }
                    }
                    "--offset" => {
                        i += 1;
                        if i < args.len() { offset = args[i].parse().ok(); }
                    }
                    _ => {}
                }
                i += 1;
            }
            list_books(&pool, unread_only, sort_by, descending, limit, offset).await?;
        }
        "search" => {
            if args.len() != 3 {
                println!("Usage: cargo run -- search <query>");
                return Ok(());
            }
            search_books(&pool, &args[2]).await?;
        }
        "search-author" => {
            if args.len() != 3 {
                println!("Usage: cargo run -- search-author <author>");
                return Ok(());
            }
            search_by_author(&pool, &args[2]).await?;
        }
        "search-genre" => {
            if args.len() != 3 {
                println!("Usage: cargo run -- search-genre <genre>");
                return Ok(());
            }
            search_by_genre(&pool, &args[2]).await?;
        }
        "read" => {
            if args.len() != 3 {
                println!("Usage: cargo run -- read <id>");
                return Ok(());
            }
            let id: i64 = args[2].parse().map_err(|_| AppError::Message("Invalid ID.".to_string()))?;
            mark_book(&pool, id, true).await?;
        }
        "unread" => {
            if args.len() != 3 {
                println!("Usage: cargo run -- unread <id>");
                return Ok(());
            }
            let id: i64 = args[2].parse().map_err(|_| AppError::Message("Invalid ID.".to_string()))?;
            mark_book(&pool, id, false).await?;
        }
        "rate" => {
            if args.len() != 4 {
                println!("Usage: cargo run -- rate <id> <1-5>");
                return Ok(());
            }
            let id: i64 = args[2].parse().map_err(|_| AppError::Message("Invalid ID.".to_string()))?;
            let rating: i64 = args[3].parse().map_err(|_| AppError::Message("Invalid rating.".to_string()))?;
            rate_book(&pool, id, rating).await?;
        }
        "delete" => {
            if args.len() != 3 {
                println!("Usage: cargo run -- delete <id>");
                return Ok(());
            }
            let id: i64 = args[2].parse().map_err(|_| AppError::Message("Invalid ID.".to_string()))?;
            delete_book(&pool, id).await?;
        }
        "import" => {
            if args.len() != 3 {
                println!("Usage: cargo run -- import <file.json>");
                return Ok(());
            }
            import_books(&pool, &args[2]).await?;
        }
        "genres" => {
            genre_stats(&pool).await?;
        }
        "authors" => {
            author_stats(&pool).await?;
        }
        "stats" => {
            show_counts(&pool).await?;
        }
        _ => {
            println!("Unknown command: {}", args[1]);
            print_usage();
        }
    }

    Ok(())
}

fn print_usage() {
    println!("Book Library CLI");
    println!();
    println!("Commands:");
    println!("  add <title> <author> <genre> [year]");
    println!("                            Add a new book");
    println!("  list [--unread] [--sort <col>] [--desc] [--limit N] [--offset N]");
    println!("                            List books with optional filters");
    println!("  search <query>            Search by title, author, or genre");
    println!("  search-author <author>    Search by author");
    println!("  search-genre <genre>      Search by genre");
    println!("  read <id>                 Mark a book as read");
    println!("  unread <id>               Mark a book as unread");
    println!("  rate <id> <1-5>           Rate a book (1-5 stars)");
    println!("  delete <id>               Delete a book");
    println!("  import <file.json>        Import books from a JSON array");
    println!("  genres                    Show genre statistics (GROUP BY)");
    println!("  authors                   Show author statistics");
    println!("  stats                     Show library summary");
}

#[tokio::main]
async fn main() {
    if let Err(e) = run().await {
        eprintln!("Error: {}", e);
        std::process::exit(1);
    }
}
```

Now, let me explain what we just did.

The CLI has grown from previous projects. The `list` command supports `--sort` (by `id`, `title`, `author`, `genre`, `year`, `rating`), `--desc`, `--unread`, and `--limit`/`--offset` for pagination. The `genres` and `authors` commands give us statistical views of the library using the `GROUP BY` queries we practiced in Part 1. The `stats` command gives an overview. The `add` command accepts an optional year. The `import` command reads JSON arrays with transactions.

### Running the Project

Make sure `DATABASE_URL` is set before compiling:

```
export DATABASE_URL=sqlite:books.db
```

Add some books:

```
cargo run -- add "The Rust Programming Language" "Steve Klabnik" "Programming" 2018
cargo run -- add "Project Hail Mary" "Andy Weir" "Science Fiction" 2021
cargo run -- add "The Martian" "Andy Weir" "Science Fiction" 2011
cargo run -- add "Atomic Habits" "James Clear" "Self-Help" 2018
cargo run -- add "Dune" "Frank Herbert" "Science Fiction" 1965
cargo run -- add "Neuromancer" "William Gibson" "Cyberpunk" 1984
cargo run -- add "Snow Crash" "Neal Stephenson" "Cyberpunk" 1992
cargo run -- add "The Name of the Wind" "Patrick Rothfuss" "Fantasy" 2007
cargo run -- add "A Wise Mans Fear" "Patrick Rothfuss" "Fantasy" 2011
cargo run -- add "Deep Work" "Cal Newport" "Self-Help" 2016
```

List all books:

```
cargo run -- list
```

Expected output:

```
[ ]   1. The Rust Programming Language by Steve Klabnik (Programming) [2018]
[ ]   2. Project Hail Mary by Andy Weir (Science Fiction) [2021]
[ ]   3. The Martian by Andy Weir (Science Fiction) [2011]
[ ]   4. Atomic Habits by James Clear (Self-Help) [2018]
[ ]   5. Dune by Frank Herbert (Science Fiction) [1965]
[ ]   6. Neuromancer by William Gibson (Cyberpunk) [1984]
[ ]   7. Snow Crash by Neal Stephenson (Cyberpunk) [1992]
[ ]   8. The Name of the Wind by Patrick Rothfuss (Fantasy) [2007]
[ ]   9. A Wise Mans Fear by Patrick Rothfuss (Fantasy) [2011]
[ ]  10. Deep Work by Cal Newport (Self-Help) [2016]

10 book(s) shown (total: 10)
```

List with sorting and pagination:

```
cargo run -- list --sort year --desc --limit 3
```

Expected output (3 most recent books):

```
[ ]   2. Project Hail Mary by Andy Weir (Science Fiction) [2021]
[ ]   1. The Rust Programming Language by Steve Klabnik (Programming) [2018]
[ ]   4. Atomic Habits by James Clear (Self-Help) [2018]

3 book(s) shown (total: 10)
```

Search:

```
cargo run -- search "Science Fiction"
```

Expected output:

```
[ ]   2. Project Hail Mary by Andy Weir (Science Fiction) [2021]
[ ]   3. The Martian by Andy Weir (Science Fiction) [2011]
[ ]   5. Dune by Frank Herbert (Science Fiction) [1965]

3 book(s) found
```

Mark books as read and rate them:

```
cargo run -- read 1
cargo run -- read 3
cargo run -- read 5
cargo run -- rate 1 5
cargo run -- rate 3 4
cargo run -- rate 5 5
```

View genre statistics (the GROUP BY query):

```
cargo run -- genres
```

Expected output:

```
Genre                 Books   Read Avg Rating
----------------------------------------------
Science Fiction           3      2        4.5
Cyberpunk                 2      0          -
Fantasy                   2      0          -
Self-Help                 2      0          -
Programming               1      1        5.0
```

View author statistics (MIN and MAX years):

```
cargo run -- authors
```

Expected output:

```
Author                Books   Read      First Pub     Latest Pub
------------------------------------------------------------------
Andy Weir                 2      1           2011           2021
Patrick Rothfuss          2      0           2007           2011
Cal Newport               1      0           2016           2016
Frank Herbert             1      1           1965           1965
James Clear               1      0           2018           2018
Neal Stephenson           1      0           1992           1992
Steve Klabnik             1      1           2018           2018
William Gibson            1      0           1984           1984
```

View overall stats:

```
cargo run -- stats
```

Expected output:

```
Total books:     10
Read:            3 (30%)
Unread:          7
With ratings:    3
Average rating:  4.7 / 5
```

### Bulk Import with a JSON File

Create `more_books.json`:

```
[
    { "title": "Foundation", "author": "Isaac Asimov", "genre": "Science Fiction", "year": 1951 },
    { "title": "Hyperion", "author": "Dan Simmons", "genre": "Science Fiction", "year": 1989 },
    { "title": "The Hobbit", "author": "J.R.R. Tolkien", "genre": "Fantasy", "year": 1937 }
]
```

Import:

```
cargo run -- import more_books.json
```

Expected output:

```
Importing 3 books...
Successfully imported 3 books.
```

### Pagination in Action

After importing, we have 13 books. Paginate through them:

```
cargo run -- list --sort year --limit 5 --offset 0
```

Output shows the 5 oldest books. Then:

```
cargo run -- list --sort year --limit 5 --offset 5
```

Output shows books 6–10. Then:

```
cargo run -- list --sort year --limit 5 --offset 10
```

Output shows the remaining 3.

```
13 book(s) shown (total: 13)
```

## Conclusion

You now know enough SQL to build real applications with Rust. We covered table creation, querying, filtering, joins, aggregation, transactions, indexes, and then used SQLx to integrate those concepts into a complete CLI application with compile-time checked queries.

In the next article, we'll revisit this project from a different perspective. Instead of focusing on SQL and SQLx, we'll design the database itself, starting from requirements, modeling relationships, normalizing the schema, choosing constraints and indexes, and implementing the final design using both SQL and SQLx. See you soon.
