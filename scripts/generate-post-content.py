#!/usr/bin/env python3
"""Regenerate slug-map.ts and PostContent.astro from posts directory."""
import os, re, json

POSTS_DIR = os.path.join(os.path.dirname(__file__), "..", "src", "content", "docs", "posts")
SLUG_MAP = os.path.join(os.path.dirname(__file__), "..", "src", "slug-map.ts")
POST_CONTENT = os.path.join(os.path.dirname(__file__), "..", "src", "components", "PostContent.astro")

slug_map = {}
imports = []
files_list = []

for root, dirs, files in os.walk(POSTS_DIR):
    for fname in sorted(files):
        if not fname.endswith(".mdx"):
            continue
        rel = os.path.relpath(os.path.join(root, fname), POSTS_DIR)
        slug = fname.replace(".mdx", "")
        slug_map[slug] = rel
        var_name = re.sub(r"[^a-zA-Z0-9]", "_", rel.replace(".mdx", ""))
        import_path = f"../content/docs/posts/{rel}"
        imports.append(f'import {var_name} from "{import_path}";')
        files_list.append((slug, rel, var_name))

with open(SLUG_MAP, "w") as f:
    f.write("// Maps URL slugs to file paths relative to src/content/docs/posts/\n")
    f.write("export const slugMap: Record<string, string> = ")
    f.write(json.dumps(dict(sorted(slug_map.items())), indent=2))
    f.write(";\n\n")
    f.write("export function getSlug(filePath: string): string | undefined {\n")
    f.write("  return Object.entries(slugMap).find(([, v]) => v === filePath)?.[0];\n")
    f.write("}\n")

with open(POST_CONTENT, "w") as f:
    f.write("---\n")
    for imp in imports:
        f.write(imp + "\n")
    f.write("\nconst fileToComponent = {\n")
    for slug, rel, var_name in files_list:
        f.write(f'  "{rel}": {var_name},\n')
    f.write("} as Record<string, unknown>;\n")
    f.write("\ntype Props = { filePath: string };\n")
    f.write("const { filePath } = Astro.props;\n")
    f.write("const Component = fileToComponent[filePath];\n")
    f.write("---\n\n")
    f.write("{Component ? <Component /> : <p>Not found: {filePath}</p>}\n")

print(f"Generated: {SLUG_MAP} ({len(slug_map)} entries)")
print(f"Generated: {POST_CONTENT} ({len(imports)} imports)")
