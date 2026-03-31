#!/usr/bin/env sh
set -eu

python3 scripts/generate_og_images.py

if command -v zola >/dev/null 2>&1; then
  zola "$@"
elif [ -x ./zola ]; then
  ./zola "$@"
else
  echo "Error: zola binary not found. Install zola or download ./zola first." >&2
  exit 1
fi
