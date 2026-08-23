// @ts-nocheck
/**
 * Rust Playground — client runtime.
 * Mounts on every [data-rust-playground] (multiple per page).
 * Uses https://play.rust-lang.org/execute (CORS-enabled).
 * Also handles "Open in Playground" via code-in-URL.
 */
import { mount } from "@cloudflare/nimbus-docs/client";

type Channel = "stable" | "beta" | "nightly";
type Mode = "debug" | "release";
type Edition = "2015" | "2018" | "2021" | "2024";

const PLAYGROUND_EXECUTE = "https://play.rust-lang.org/execute";
const PLAYGROUND_BASE = "https://play.rust-lang.org/";

function initPlayground(root: HTMLElement): () => void {
  const editor = root.querySelector<HTMLTextAreaElement>("[data-rust-editor]");
  const runBtn = root.querySelector<HTMLButtonElement>("[data-rust-run]");
  const resetBtn = root.querySelector<HTMLButtonElement>("[data-rust-reset]");
  const openLink = root.querySelector<HTMLAnchorElement>("[data-rust-open]");
  const outputWrap = root.querySelector<HTMLElement>("[data-rust-output-wrap]");
  const outputEl = root.querySelector<HTMLElement>("[data-rust-output]");
  const stderrEl = root.querySelector<HTMLElement>("[data-rust-stderr]");
  const statusEl = root.querySelector<HTMLElement>("[data-rust-status]");

  if (!editor || !runBtn || !outputWrap || !outputEl || !stderrEl) return () => {};

  const edition = (root.dataset.edition as Edition) || "2024";
  const channel = (root.dataset.channel as Channel) || "stable";
  const mode = (root.dataset.mode as Mode) || "debug";
  const crateType = root.dataset.crateType || "bin";

  // Capture original for reset. Dataset may contain original via SSR, but we trust initial textarea value.
  const original = editor.value;

  // Auto-resize textarea to fit content (min 8 rows, max ~400px).
  function autoResize() {
    editor.style.height = "auto";
    const maxH = 400;
    const minH = 120;
    const h = Math.min(maxH, Math.max(minH, editor.scrollHeight + 2));
    editor.style.height = `${h}px`;
  }
  autoResize();
  editor.addEventListener("input", autoResize);

  // Update open link href on input (so it always reflects current code).
  function updateOpenHref() {
    const code = editor.value;
    // play.rust-lang.org supports ?code= param. For very large code, URL length may exceed browser limit (~2000-8000).
    // We still generate it; browsers will handle. Alternatively we could use /meta/gist API but that would require extra request.
    const url = new URL(PLAYGROUND_BASE);
    url.searchParams.set("version", channel);
    url.searchParams.set("mode", mode);
    url.searchParams.set("edition", edition);
    url.searchParams.set("code", code);
    if (openLink) openLink.href = url.toString();
  }
  updateOpenHref();
  editor.addEventListener("input", updateOpenHref);

  let abortController: AbortController | null = null;

  async function run() {
    const code = editor.value;
    if (!code.trim()) {
      if (statusEl) {
        statusEl.textContent = "Nothing to run.";
        statusEl.dataset.state = "idle";
      }
      return;
    }

    // Session cache — check before showing "Running…" so we can return instantly without spinner.
    const cacheKey = `rust-playground:${channel}:${mode}:${edition}:${crateType}:${hashCode(code)}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as { success: boolean; stdout: string; stderr: string };
          renderResult(parsed);
          return;
        } catch {}
      }
    } catch {}

    // Abort previous fetch if still in-flight
    if (abortController) abortController.abort();
    abortController = new AbortController();

    runBtn.disabled = true;
    runBtn.setAttribute("aria-busy", "true");
    const prevLabel = runBtn.innerHTML;
    runBtn.innerHTML = `<span class="rust-playground__spinner" aria-hidden="true"></span> Running…`;

    if (statusEl) {
      statusEl.textContent = "Running…";
      statusEl.dataset.state = "running";
    }
    outputWrap.hidden = false;
    outputEl.textContent = "";
    stderrEl.textContent = "";
    stderrEl.hidden = true;
    outputEl.hidden = true;
    outputWrap.dataset.state = "running";

    try {
      const res = await fetch(PLAYGROUND_EXECUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          mode,
          edition,
          crateType,
          tests: false,
          code,
          backtrace: false,
        }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Playground error ${res.status}: ${text.slice(0, 500)}`);
      }

      const data = (await res.json()) as { success: boolean; stdout: string; stderr: string };
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(data));
      } catch {}

      renderResult(data);
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : String(err);
      if (statusEl) {
        statusEl.textContent = "Failed to run.";
        statusEl.dataset.state = "error";
      }
      outputWrap.dataset.state = "error";
      stderrEl.textContent = msg;
      stderrEl.hidden = false;
      outputEl.hidden = true;
    } finally {
      runBtn.disabled = false;
      runBtn.removeAttribute("aria-busy");
      runBtn.innerHTML = prevLabel;
      abortController = null;
    }
  }

  function renderResult(data: { success: boolean; stdout: string; stderr: string }) {
    const hasStdout = !!data.stdout;
    if (data.success) {
      // Success: show only stdout, suppress warnings and cargo logs (stderr) — keep errors for failure case only.
      outputEl.textContent = data.stdout || "";
      stderrEl.textContent = "";
      stderrEl.hidden = true;
      if (statusEl) {
        statusEl.textContent = "Success.";
        statusEl.dataset.state = "success";
      }
      outputWrap.dataset.state = "success";
      if (!hasStdout) {
        outputEl.textContent = "(no output)";
        outputEl.hidden = false;
      } else {
        outputEl.hidden = false;
      }
    } else {
      const hasStderr = !!data.stderr;
      outputEl.textContent = data.stdout || "";
      stderrEl.textContent = data.stderr || "";
      outputEl.hidden = !hasStdout;
      stderrEl.hidden = !hasStderr;
      if (statusEl) {
        statusEl.textContent = "Compilation failed.";
        statusEl.dataset.state = "error";
      }
      outputWrap.dataset.state = "error";
      if (!hasStderr && !hasStdout) {
        stderrEl.textContent = "Unknown error.";
        stderrEl.hidden = false;
      }
    }
    outputWrap.hidden = false;
    try {
      outputWrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch {}
  }

  function reset() {
    editor.value = original;
    autoResize();
    updateOpenHref();
    outputWrap.hidden = true;
    outputEl.textContent = "";
    stderrEl.textContent = "";
    if (statusEl) {
      statusEl.textContent = "";
      statusEl.dataset.state = "idle";
    }
    outputWrap.dataset.state = "idle";
    if (abortController) abortController.abort();
    runBtn.disabled = false;
  }

  runBtn.addEventListener("click", run);
  if (resetBtn) resetBtn.addEventListener("click", reset);

  // Keyboard: Cmd/Ctrl+Enter to run
  function onKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      run();
    }
  }
  editor.addEventListener("keydown", onKeydown);

  return () => {
    runBtn.removeEventListener("click", run);
    if (resetBtn) resetBtn.removeEventListener("click", reset);
    editor.removeEventListener("keydown", onKeydown);
    editor.removeEventListener("input", autoResize);
    editor.removeEventListener("input", updateOpenHref);
    if (abortController) abortController.abort();
  };
}

function hashCode(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return `${hash}_${str.length}`;
}

mount("[data-rust-playground]", initPlayground);
