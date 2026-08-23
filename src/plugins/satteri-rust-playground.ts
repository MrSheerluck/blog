/**
 * Satteri Mdast plugin for Rust Playground.
 * Transforms ```rust playground fences into raw HTML playground widgets.
 * This is the Satteri equivalent of remark-rust-playground.ts.
 * Satteri is the default markdown processor for Astro + nimbus-docs.
 * It does NOT use remark/unified, so we must provide a MdastPluginDefinition.
 */

export function satteriRustPlayground(): any {
  return {
    name: "satteri-rust-playground",
    code(node: any, ctx: any) {
      // node shape: { type: "code", lang?: string, meta?: string, value: string }
      const lang: string | undefined = node.lang;
      if (lang !== "rust") return;

      const rawMeta: string = node.meta ?? "";
      if (!hasPlaygroundFlag(rawMeta)) return;

      const code: string = node.value ?? "";
      const parsed = parseMeta(rawMeta);

      const edition = normalizeEdition(parsed.edition);
      const channel = normalizeChannel(parsed.channel ?? parsed.version);
      const mode = normalizeMode(parsed.mode);
      const crateType = normalizeCrateType(parsed.crateType ?? parsed["crate-type"]);
      const title = parsed.title ? String(parsed.title) : "Rust Playground";

      // MDX vs Markdown branching: MDX needs JSX so it can be resolved via global components.
      // Markdown can use raw HTML.
      if (ctx.sourceFormat === "mdx") {
        // Return <RustPlayground code="..." title="..." edition="..." ... /> as MDX JSX.
        // The component is globally registered via src/components.ts.
        return {
          type: "mdxJsxFlowElement",
          name: "RustPlayground",
          attributes: [
            { type: "mdxJsxAttribute", name: "code", value: code },
            { type: "mdxJsxAttribute", name: "title", value: title },
            { type: "mdxJsxAttribute", name: "edition", value: edition },
            { type: "mdxJsxAttribute", name: "channel", value: channel },
            { type: "mdxJsxAttribute", name: "mode", value: mode },
            { type: "mdxJsxAttribute", name: "crateType", value: crateType },
          ],
          children: [],
        } as any;
      }

      const html = buildHtml({
        code,
        title,
        edition,
        channel,
        mode,
        crateType,
      });

      return { type: "html", value: html } as any;
    },
  };
}

function hasPlaygroundFlag(meta: string): boolean {
  return /\b(playground|runnable|run|editable)\b/i.test(meta);
}

function parseMeta(meta: string): Record<string, string> {
  const out: Record<string, string> = {};
  const cleaned = meta.replace(/\b(playground|runnable|run|editable)\b/gi, " ").trim();
  if (!cleaned) return out;
  const re = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"']+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned)) !== null) {
    const key = m[1]!;
    const val = m[2] ?? m[3] ?? m[4] ?? "";
    out[key] = val;
  }
  return out;
}

function normalizeEdition(v?: string): "2015" | "2018" | "2021" | "2024" {
  if (v === "2015" || v === "2018" || v === "2021" || v === "2024") return v;
  return "2024";
}
function normalizeChannel(v?: string): "stable" | "beta" | "nightly" {
  if (v === "beta" || v === "nightly" || v === "stable") return v;
  return "stable";
}
function normalizeMode(v?: string): "debug" | "release" {
  if (v === "release") return "release";
  return "debug";
}
function normalizeCrateType(v?: string): "bin" | "lib" {
  if (v === "lib") return "lib";
  return "bin";
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escapeForTextarea(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/<\/textarea>/gi, "&lt;/textarea&gt;");
}

function buildHtml(opts: {
  code: string;
  title: string;
  edition: string;
  channel: string;
  mode: string;
  crateType: string;
}): string {
  const { code, title, edition, channel, mode, crateType } = opts;
  const safeTitle = escapeHtml(title);
  const safeCode = escapeForTextarea(code);
  const playgroundBase = `https://play.rust-lang.org/?version=${encodeURIComponent(channel)}&mode=${encodeURIComponent(mode)}&edition=${encodeURIComponent(edition)}`;
  return `
<div data-rust-playground data-edition="${escapeHtml(edition)}" data-channel="${escapeHtml(channel)}" data-mode="${escapeHtml(mode)}" data-crate-type="${escapeHtml(crateType)}" class="rust-playground not-prose my-6 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
  <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/50 px-3 py-2">
    <div class="flex items-center gap-2 min-w-0">
      <span class="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
        <span class="inline-block h-2 w-2 rounded-full bg-success"></span>
        ${safeTitle}
      </span>
      <span class="hidden sm:inline text-[11px] text-muted-foreground">
        ${escapeHtml(channel)} • ${escapeHtml(edition)} • ${escapeHtml(mode)}
      </span>
    </div>
    <div class="flex items-center gap-1.5">
      <button type="button" data-rust-reset class="inline-flex items-center justify-center rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="Reset code">Reset</button>
      <a data-rust-open target="_blank" rel="noopener noreferrer" href="${playgroundBase}" class="inline-flex items-center justify-center rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">Open in Playground <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" class="ml-1"><path d="M6 4l4 4-4 4"></path><path d="M5 3h7v7"></path></svg></a>
      <button type="button" data-rust-run class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M4 3l8 5-8 5z"></path></svg> Run</button>
    </div>
  </div>
  <div class="relative bg-card">
    <textarea data-rust-editor spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false" class="rust-playground__editor w-full min-h-[140px] resize-y bg-transparent px-4 py-3 font-mono text-sm leading-6 text-foreground placeholder:text-muted-foreground focus:outline-none" rows="8" aria-label="Editable Rust code">${safeCode}</textarea>
    <div class="pointer-events-none absolute bottom-2 right-2 hidden sm:block text-[11px] text-muted-foreground/70">Ctrl+Enter to run</div>
  </div>
  <div data-rust-output-wrap hidden data-state="idle" class="border-t border-border bg-muted/30">
    <div class="flex items-center gap-2 px-3 py-2 border-b border-border/60">
      <span class="text-xs font-medium text-muted-foreground">Output</span>
      <span data-rust-status data-state="idle" class="rust-playground__status text-xs"></span>
    </div>
    <pre data-rust-output hidden class="rust-playground__pre m-0 max-h-[300px] overflow-auto px-4 py-3 font-mono text-xs leading-5 whitespace-pre-wrap break-words text-foreground"></pre>
    <pre data-rust-stderr hidden class="rust-playground__pre rust-playground__pre--stderr m-0 max-h-[300px] overflow-auto px-4 py-3 font-mono text-xs leading-5 whitespace-pre-wrap break-words"></pre>
  </div>
</div>
`.trim();
}
