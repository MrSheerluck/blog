# Mrsheerluck Blog

Built with [Nimbus](https://nimbus-docs.com) (Astro + Cloudflare), deployed to Cloudflare Pages.

## Development

```bash
pnpm install
pnpm dev
```

## Build

```bash
pnpm build
```

Output goes to `dist/`.

## Content

All posts live under `src/content/docs/posts/` and render at `/posts/<slug>/`.

### Adding a post

**Example: nested post**

1. Create the file inside any folder structure you want:

```
src/content/docs/posts/programming-languages/go/introduction-to-go.mdx
```

2. Add YAML frontmatter:

```yaml
---
title: Introduction to Go
description: Getting started with Go programming.
date: 2026-07-23
---
```

3. Run the generator to register the file:

```bash
python3 scripts/generate-post-content.py
```

4. Done — the post renders at `/posts/introduction-to-go/`. The sidebar mirrors the folder structure.

**The slug-map is auto-generated** — the filename (without `.mdx`) becomes the URL slug. The folder path controls sidebar nesting. Both are independent — you can reorganize folders freely without changing URLs.

**Quick steps summary:**

```bash
# 1. Create the .mdx file anywhere under src/content/docs/posts/
# 2. Regenerate imports and slug-map
python3 scripts/generate-post-content.py
# 3. Check it locally
pnpm dev
```

### Organizing posts in folders

Files can be nested arbitrarily. The slug-map decouples file location from URL - reorganize folders without breaking links.

```
src/content/docs/posts/
├── rust/
│   └── brainfuck.mdx          → /posts/learn-rust-basics.../
├── philosophy/
│   └── plato/
│       └── apology.mdx         → /posts/apology/
└── misc/
    └── stoicism.mdx             → /posts/lessons-in-stoicism/
```

### Archiving a series

Add the series slug to `src/archived-series.json`. All posts in that series will show an "Archived" badge in the sidebar.

```json
["learning-rust", "backend-engineering-with-axum"]
```

### Hiding a post from sidebar

Add to frontmatter:

```yaml
sidebar:
  hidden: true
```

The post remains accessible via its URL.

## Deploy

Push to `main`. Cloudflare Pages auto-deploys using the build command `pnpm build` and output directory `dist`.
