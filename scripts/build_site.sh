#!/usr/bin/env sh
set -eu

ensure_pillow() {
  if python3 -c "import PIL" >/dev/null 2>&1; then
    return 0
  fi

  echo "Pillow not found, attempting installation..." >&2

  if python3 -m pip install --quiet --disable-pip-version-check --user Pillow >/dev/null 2>&1; then
    return 0
  fi

  if python3 -m ensurepip --upgrade >/dev/null 2>&1 \
    && python3 -m pip install --quiet --disable-pip-version-check --user Pillow >/dev/null 2>&1; then
    return 0
  fi

  return 1
}

if ensure_pillow; then
  python3 scripts/generate_og_images.py
else
  echo "Warning: Pillow could not be installed. Skipping OG image generation." >&2
fi

if command -v zola >/dev/null 2>&1; then
  zola "$@"
elif [ -x ./zola ]; then
  ./zola "$@"
else
  echo "Error: zola binary not found. Install zola or download ./zola first." >&2
  exit 1
fi
