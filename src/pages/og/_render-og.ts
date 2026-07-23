import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const W = 1200;
const H = 630;
const PAD = 80;
const TEXT_W = W - PAD * 2;

// ═══════════════════════════════════════════════════════════════════════════════
//  Resolve an asset path — bypasses Vite's module runner restrictions by
//  going through the actual filesystem.
// ═══════════════════════════════════════════════════════════════════════════════

const PROJECT_ROOT = path.resolve(__dirname, "../../..");

function assetPath(rel: string): string {
  return path.join(PROJECT_ROOT, rel);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CanvasKit singleton
// ═══════════════════════════════════════════════════════════════════════════════

let _CK: any = null;

async function getCK() {
  if (_CK) return _CK;

  const { default: init } = await import("canvaskit-wasm/full");
  _CK = await init({
    locateFile: (file: string) =>
      assetPath(`node_modules/canvaskit-wasm/bin/full/${file}`),
  });
  return _CK;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Font manager singleton
// ═══════════════════════════════════════════════════════════════════════════════

let _fontMgr: any = null;

async function getFontMgr(CK: any) {
  if (_fontMgr) return _fontMgr;

  const boldData = await fs.readFile(
    assetPath("node_modules/geist/dist/fonts/geist-mono/GeistMono-Bold.ttf"),
  );
  const regData = await fs.readFile(
    assetPath("node_modules/geist/dist/fonts/geist-mono/GeistMono-Regular.ttf"),
  );

  _fontMgr = CK.FontMgr.FromData(boldData.buffer, regData.buffer);
  return _fontMgr;
}

// ── helpers ───────────────────────────────────────────────────────────────────

/** fast rect fill — no anti-alias for pixel-crisp edges */
function rect(canvas: any, CK: any, color: number[], x: number, y: number, w: number, h: number) {
  const p = new CK.Paint();
  p.setColor(CK.Color(...color));
  p.setAntiAlias(false);
  canvas.drawRect(CK.XYWHRect(x, y, w, h), p);
  p.delete();
}

/** Build + layout a paragraph, return it (caller must .delete()) */
function makePara(
  CK: any,
  fontMgr: any,
  text: string,
  fontSize: number,
  color: number[],
  maxWidth: number,
  weight: string = "Normal",
) {
  const style = new CK.ParagraphStyle({
    textStyle: {
      color: CK.Color(...color),
      fontSize,
      fontFamilies: ["Geist Mono"],
      fontStyle: { weight: CK.FontWeight[weight] },
      heightMultiplier: 1.2,
    },
  });
  const builder = CK.ParagraphBuilder.Make(style, fontMgr);
  builder.addText(text);
  const para = builder.build();
  para.layout(maxWidth);
  builder.delete();
  return para;
}

// ── public API ────────────────────────────────────────────────────────────────

export interface OgParams {
  url: string;
  title: string;
  description?: string;
  date?: string;
}

export async function renderOg({ url, title, description, date }: OgParams): Promise<Buffer> {
  const CK = await getCK();
  const fontMgr = await getFontMgr(CK);

  const surface = CK.MakeSurface(W, H);
  const canvas = surface.getCanvas();

  // ─── background: solid black ────────────────────────────────────────────────
  rect(canvas, CK, [0, 0, 0, 1], 0, 0, W, H);

  // ─── dotted matrix pattern ──────────────────────────────────────────────────
  const dotGap = 10;
  const dotR = 1.2;
  const dotPaint = new CK.Paint();
  dotPaint.setColor(CK.Color(30, 30, 36, 1));
  dotPaint.setAntiAlias(true);
  for (let y = 0; y < H; y += dotGap) {
    for (let x = 0; x < W; x += dotGap) {
      canvas.drawCircle(x, y, dotR, dotPaint);
    }
  }
  dotPaint.delete();

  // ─── URL (top-left) ─────────────────────────────────────────────────────────
  const urlPara = makePara(CK, fontMgr, url, 18, [100, 100, 120, 1], TEXT_W);
  canvas.drawParagraph(urlPara, PAD, PAD - 4);

  const urlBottom = PAD - 4 + urlPara.getHeight();

  // ─── title ──────────────────────────────────────────────────────────────────
  const titlePara = makePara(CK, fontMgr, title, 56, [235, 235, 245, 1], TEXT_W, "Bold");
  const titleY = urlBottom + 24;
  canvas.drawParagraph(titlePara, PAD, titleY);

  const titleBottom = titleY + titlePara.getHeight();

  // ─── horizontal bar ─────────────────────────────────────────────────────────
  const barY = titleBottom + 12;
  const barW = 80;
  const barH = 4;
  rect(canvas, CK, [235, 235, 245, 0.7], PAD, barY, barW, barH);

  // ─── description ────────────────────────────────────────────────────────────
  let descBottom = barY + barH;
  if (description) {
    const descPara = makePara(CK, fontMgr, description, 22, [150, 150, 170, 1], TEXT_W);
    const descY = barY + barH + 16;
    canvas.drawParagraph(descPara, PAD, descY);
    descBottom = descY + descPara.getHeight();
    descPara.delete();
  }

  // ─── date (bottom-left) ─────────────────────────────────────────────────────
  if (date) {
    const datePara = makePara(CK, fontMgr, date, 18, [100, 100, 120, 1], TEXT_W);
    const dateY = H - PAD - datePara.getHeight();
    canvas.drawParagraph(datePara, PAD, dateY);
    datePara.delete();
  }

  // ─── bottom accent line ─────────────────────────────────────────────────────
  rect(canvas, CK, [60, 60, 80, 0.25], PAD, H - PAD + 14, TEXT_W, 1);

  // ─── encode ─────────────────────────────────────────────────────────────────
  const image = surface.makeImageSnapshot();
  const bytes = image.encodeToBytes(CK.ImageFormat.PNG, 100) || new Uint8Array();

  urlPara.delete();
  titlePara.delete();
  surface.dispose();

  return Buffer.from(bytes);
}
