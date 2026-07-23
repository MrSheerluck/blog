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

1. Create `src/content/docs/posts/<slug>.mdx` with YAML frontmatter:

```yaml
---
title: My Post Title
description: A short description for SEO, sidebar, and RSS.
date: 2026-01-01
series: ["my-series"]
sidebar:
  hidden: true   # hide from sidebar (optional)
---
```

2. Add an entry to `src/slug-map.ts`:

```ts
"my-post-slug": "my-series/my-post.mdx",
```

3. Regenerate `src/components/PostContent.astro`:

```bash
python3 scripts/generate-post-content.py
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
