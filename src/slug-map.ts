// Maps URL slugs to file paths relative to src/content/docs/posts/
export const slugMap: Record<string, string> = {
  "apology": "philosophy/plato/apology.mdx",
  "build-breakout-in-bevy-step-by-step": "gamedev/bevy/build-breakout-in-bevy-step-by-step.mdx",
  "crito": "philosophy/plato/crito.mdx",
  "euthyphro": "philosophy/plato/euthyphro.mdx",
  "learn-axum-basics-and-routing-by-building-a-url-shortener": "axum/learn-axum-basics-and-routing-by-building-a-url-shortener.mdx",
  "learn-axum-error-handling-by-building-pastebin-api-in-rust": "axum/learn-axum-error-handling-by-building-pastebin-api-in-rust.mdx",
  "learn-axum-persistence-and-transaction-by-building-a-bookmark-manager": "axum/learn-axum-persistence-and-transaction-by-building-a-bookmark-manager.mdx",
  "learn-bevy-states-timers-by-building-snake": "gamedev/bevy/learn-bevy-states-timers-by-building-snake.mdx",
  "learn-error-hanlding-in-rust": "rust/learn-error-hanlding-in-rust.mdx",
  "learn-generics-traits-in-rust-by-building-blackjack-card-game-engine": "rust/learn-generics-traits-in-rust-by-building-blackjack-card-game-engine.mdx",
  "learn-go-basics-by-building-a-brainfuck-intepreter": "programming-languages/go/learn-go-basics-by-building-a-brainfuck-intepreter.mdx",
  "learn-hashmap-iterators-by-building-a-git-object-store-reader": "rust/learn-hashmap-iterators-by-building-a-git-object-store-reader.mdx",
  "learn-rust-async-await-by-building-an-http-server": "rust/learn-rust-async-await-by-building-an-http-server.mdx",
  "learn-rust-basics-by-building-a-brainfuck-interpreter": "rust/learn-rust-basics-by-building-a-brainfuck-interpreter.mdx",
  "learn-rust-closures-by-building-a-tiny-linter": "rust/learn-rust-closures-by-building-a-tiny-linter.mdx",
  "learn-rust-concurrency-by-building-a-thread-pool": "rust/learn-rust-concurrency-by-building-a-thread-pool.mdx",
  "learn-rust-lifetimes-by-building-a-lru-cache": "rust/learn-rust-lifetimes-by-building-a-lru-cache.mdx",
  "learn-rust-ownership-by-building-mini-grep": "rust/learn-rust-ownership-by-building-mini-grep.mdx",
  "learn-rust-smart-pointers-and-interior-mutability-by-building-git-commit-graph-viewer": "rust/learn-rust-smart-pointers-and-interior-mutability-by-building-git-commit-graph-viewer.mdx",
  "learn-rust-structs-enums-pattern-matching-by-building-a-json-parser": "rust/learn-rust-structs-enums-pattern-matching-by-building-a-json-parser.mdx",
  "learn-sql-and-sqlx-by-building-a-book-library-cli-in-rust": "rust/learn-sql-and-sqlx-by-building-a-book-library-cli-in-rust.mdx",
  "learn-the-basics-of-bevy-by-building-and-deploying-pong-to-itch-io": "gamedev/bevy/learn-the-basics-of-bevy-by-building-and-deploying-pong-to-itch-io.mdx",
  "lessons-in-stoicism": "misc/lessons-in-stoicism.mdx",
  "scalars-explained": "math/linear-algebra/scalars-explained.mdx",
  "welcome-to-mrsheerluck-blog": "misc/welcome-to-mrsheerluck-blog.mdx",
  "wtf-is-a-supply-chain-attack": "misc/wtf-is-a-supply-chain-attack.mdx",
  "wtf-is-claude-mythos": "misc/wtf-is-claude-mythos.mdx"
};

export function getSlug(filePath: string): string | undefined {
  return Object.entries(slugMap).find(([, v]) => v === filePath)?.[0];
}
