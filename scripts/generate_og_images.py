#!/usr/bin/env python3
"""Generate text-only OG images for Zola posts.

Outputs PNG files to static/images/og/posts/<slug>.png.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Dict, Iterable, List

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
POSTS_DIR = ROOT / "content" / "posts"
OUTPUT_DIR = ROOT / "static" / "images" / "og" / "posts"

IMAGE_WIDTH = 1200
IMAGE_HEIGHT = 630
PADDING_X = 72

COLORS = {
    "background": "#101010",
    "accent": "#23B0FF",
    "text": "#A9B7C6",
    "muted": "#7C8995",
    "border": "#1F2C3D",
}


def read_front_matter(path: Path) -> Dict[str, str]:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("+++\n"):
        return {}

    end_idx = text.find("\n+++", 4)
    if end_idx == -1:
        return {}

    block = text[4:end_idx]
    data: Dict[str, str] = {}
    current_table = None

    for raw_line in block.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("[") and line.endswith("]"):
            current_table = line[1:-1].strip()
            continue
        if "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()

        # Keep top-level values only for now.
        if current_table is not None:
            continue

        if value.startswith('"') and value.endswith('"') and len(value) >= 2:
            value = value[1:-1]

        data[key] = value

    return data


def slugify(value: str) -> str:
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = value.strip("-")
    return value or "post"


def post_slug(path: Path, meta: Dict[str, str]) -> str:
    if meta.get("slug"):
        return slugify(meta["slug"])

    rel = path.relative_to(POSTS_DIR).with_suffix("")
    if rel.name == "_index":
        return "index"

    parts = [slugify(p) for p in rel.parts]
    return "--".join(p for p in parts if p)


def load_font(size: int) -> ImageFont.ImageFont:
    candidates = [
        ROOT / "assets" / "fonts" / "HackNerdFontMono-Regular.ttf",
        Path.home() / "Library" / "Fonts" / "HackNerdFontMono-Regular.ttf",
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"),
    ]

    for candidate in candidates:
        if candidate.exists():
            try:
                return ImageFont.truetype(str(candidate), size=size)
            except OSError:
                continue

    # macOS fallback often available
    for fallback_name in ("Menlo.ttc", "SFNSMono.ttf"):
        try:
            return ImageFont.truetype(fallback_name, size=size)
        except OSError:
            continue

    return ImageFont.load_default()


def text_width(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont) -> int:
    left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
    return right - left


def wrap_lines(
    draw: ImageDraw.ImageDraw,
    text: str,
    font: ImageFont.ImageFont,
    max_width: int,
    max_lines: int,
) -> List[str]:
    words = text.split()
    if not words:
        return [""]

    lines: List[str] = []
    current = words[0]

    for word in words[1:]:
        trial = f"{current} {word}"
        if text_width(draw, trial, font) <= max_width:
            current = trial
        else:
            lines.append(current)
            current = word

    lines.append(current)

    if len(lines) <= max_lines:
        return lines

    trimmed = lines[:max_lines]
    last = trimmed[-1]
    while text_width(draw, last + "...", font) > max_width and last:
        last = last[:-1]
    trimmed[-1] = (last + "...").strip()
    return trimmed


def draw_og_image(title: str, description: str, date: str, out_path: Path) -> None:
    image = Image.new("RGB", (IMAGE_WIDTH, IMAGE_HEIGHT), COLORS["background"])
    draw = ImageDraw.Draw(image)

    title_font = load_font(64)
    body_font = load_font(32)
    small_font = load_font(26)

    # terminal-like header
    draw.rectangle((0, 0, IMAGE_WIDTH, 10), fill=COLORS["accent"])
    draw.text((PADDING_X, 34), "mrsheerluck.blog", font=small_font, fill=COLORS["accent"])
    draw.text((IMAGE_WIDTH - PADDING_X - 120, 34), "POST", font=small_font, fill=COLORS["muted"])

    content_width = IMAGE_WIDTH - (PADDING_X * 2)
    y = 120

    title_lines = wrap_lines(draw, title, title_font, content_width, max_lines=3)
    for line in title_lines:
        draw.text((PADDING_X, y), line, font=title_font, fill=COLORS["accent"])
        y += 80

    y += 8
    draw.line((PADDING_X, y, IMAGE_WIDTH - PADDING_X, y), fill=COLORS["border"], width=2)
    y += 26

    desc_lines = wrap_lines(draw, description, body_font, content_width, max_lines=4)
    for line in desc_lines:
        draw.text((PADDING_X, y), line, font=body_font, fill=COLORS["text"])
        y += 46

    footer_text = f"{date}  ::  blog.sheerluck.dev"
    draw.text((PADDING_X, IMAGE_HEIGHT - 62), footer_text, font=small_font, fill=COLORS["muted"])

    out_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(out_path, format="PNG", optimize=True)


def iter_posts() -> Iterable[Path]:
    if not POSTS_DIR.exists():
        return []
    return sorted(p for p in POSTS_DIR.rglob("*.md") if p.name != "_index.md")


def main() -> None:
    generated = 0
    for post_path in iter_posts():
        meta = read_front_matter(post_path)
        title = meta.get("title") or post_path.stem.replace("-", " ").title()
        description = meta.get("description") or "New post on mrsheerluck.blog"
        date = meta.get("date") or ""
        slug = post_slug(post_path, meta)

        out_path = OUTPUT_DIR / f"{slug}.png"
        draw_og_image(title=title, description=description, date=date, out_path=out_path)
        generated += 1

    print(f"Generated {generated} OG image(s) in {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
