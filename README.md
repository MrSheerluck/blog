# Zola Blog Setup (Terminimal + Series)

This blog is configured with the [`zola-theme-terminimal`](https://github.com/pawroman/zola-theme-terminimal) theme and includes a custom series feature.

## What is configured

- Theme: `themes/terminimal`
- Tags taxonomy: `/tags`
- Series taxonomy: `/series`
- Archive page: `/archive`
- About page: `/about`
- Post pagination: enabled on home

## Series feature

Series support is based on a taxonomy called `series` and custom templates in:

- `templates/page.html`
- `templates/macros/series.html`
- `templates/series/list.html`
- `templates/series/single.html`

On each post page, if a post belongs to a series, readers will see:

- a link to the series term page
- an ordered list of all posts in that series

## How to create a series post

Use front matter like this:

```toml
+++
title = "My Series Part 1"
date = 2026-03-31

[taxonomies]
tags = ["zola", "tutorial"]
series = ["my-series-name"]
+++
```

Use the same `series` value in each part.

## Next step

Install Zola locally and run:

```bash
scripts/build_site.sh build
zola serve
```

Then open the local URL shown in your terminal.

## Auto OG images for posts

Text-only OpenGraph/Twitter card images are auto-generated for posts in `content/posts/`:

- generator: `scripts/generate_og_images.py`
- output path: `static/images/og/posts/<post-slug>.png`
- metadata template: `templates/macros/head.html`

Run this before publishing if you are not using `scripts/build_site.sh`:

```bash
python3 scripts/generate_og_images.py
```
