import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const locales = ["pt-br", "hi", "es", "de", "fr", "ja"];
const articles = [
  {
    source: "src/content/docs/posts/gpui/your-first-gpui-app-building-a-desktop-ui-in-rust.mdx",
    translations: "src/content/translations/{locale}/posts/your-first-gpui-app-building-a-desktop-ui-in-rust.{locale}.mdx",
  },
  {
    source: "src/content/docs/posts/programming-languages/rust/understanding-rust-variables-and-types-by-building-a-scientific-calculator.mdx",
    translations: "src/content/translations/{locale}/posts/understanding-rust-variables-and-types-by-building-a-scientific-calculator.{locale}.mdx",
  },
];

const BREAK = "[[XQ_BREAK]]";
const TOKEN = (kind, index) => `[[XQ_${kind}_${index}]]`;

function splitFrontmatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error("Expected YAML frontmatter");
  return { frontmatter: match[1], body: match[2] };
}

function protect(text) {
  const values = [];
  const save = (kind, value) => {
    const index = values.length;
    values.push(value);
    return TOKEN(kind, index);
  };

  // Code fences must remain byte-for-byte identical, including language tags.
  text = text.replace(/```[\s\S]*?```/g, (value) => save("CODE", value));
  // Keep inline code unchanged so API names, commands, and filenames stay exact.
  text = text.replace(/`[^`\n]+`/g, (value) => save("INLINE", value));
  // Preserve JSX/HTML tags and their attributes. Their visible text is outside tags.
  text = text.replace(/<[^>]+>/g, (value) => save("TAG", value));
  // Keep links and image destinations unchanged while allowing their labels/alt text to translate.
  text = text.replace(/https?:\/\/[^\s)\]"']+/g, (value) => save("URL", value));
  return { text, values };
}

function restore(text, values) {
  return text.replace(/\[\[XQ_(?:CODE|TAG|URL|INLINE)_\d+\]\]/g, (token) => {
    const match = token.match(/^\[\[XQ_(?:CODE|TAG|URL|INLINE)_(\d+)\]\]$/);
    return match ? values[Number(match[1])] : token;
  });
}

async function translate(text, locale) {
  const params = new URLSearchParams({
    client: "gtx",
    sl: "en",
    tl: locale,
    dt: "t",
    q: text,
  });
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(`https://translate.googleapis.com/translate_a/single?${params}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return data[0].map((part) => part[0]).join("");
    } catch (error) {
      if (attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw new Error("Translation failed");
}

async function translateBody(body, locale) {
  const protectedBody = protect(body);
  const blocks = protectedBody.text.split(/\n\s*\n/);
  const translated = [];
  let batch = [];
  let length = 0;

  const flush = async () => {
    if (!batch.length) return;
    const source = batch.join(`\n\n${BREAK}\n\n`);
    const result = await translate(source, locale);
    const parts = result.split(BREAK);
    if (parts.length !== batch.length) {
      throw new Error(`Translation response lost paragraph boundaries for ${locale}`);
    }
    translated.push(...parts.map((part) => part.trim()));
    batch = [];
    length = 0;
    await new Promise((resolve) => setTimeout(resolve, 100));
  };

  for (const block of blocks) {
    if (!block.trim()) {
      translated.push("");
      continue;
    }
    if (length + block.length > 4500 && batch.length) await flush();
    batch.push(block);
    length += block.length;
  }
  await flush();
  const result = restore(translated.join("\n\n"), protectedBody.values);
  if (/\[\[XQ_(?:CODE|TAG|URL|INLINE)_\d+\]\]/.test(result)) {
    throw new Error(`Unrestored protected token in ${locale}`);
  }
  return result;
}

function getTranslationPath(template, locale) {
  return template.replaceAll("{locale}", locale);
}

for (const article of articles) {
  const source = await readFile(join(root, article.source), "utf8");
  const { body } = splitFrontmatter(source);
  for (const locale of locales) {
    const target = getTranslationPath(article.translations, locale);
    const existing = await readFile(join(root, target), "utf8");
    const { frontmatter } = splitFrontmatter(existing);
    process.stdout.write(`Translating ${basename(article.source)} -> ${locale}\n`);
    const translatedBody = await translateBody(body, locale);
    await writeFile(join(root, target), `---\n${frontmatter}\n---\n${translatedBody.trim()}\n`);
  }
}
