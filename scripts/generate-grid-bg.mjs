import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";

const { resolve } = createRequire(import.meta.url);

const W = 1200;
const H = 630;

const { default: init } = await import("canvaskit-wasm/full");
const CanvasKit = await init({
  locateFile: (file) => resolve(`canvaskit-wasm/bin/full/${file}`),
});

const surface = CanvasKit.MakeSurface(W, H);
const canvas = surface.getCanvas();

// ── color palette ─────────────────────────────────────────────────────────────
const C = {
  bg:        [1, 1, 3],
  grid:      [15, 15, 18],
  asciiDim:  [80, 80, 100],
  ascii:     [120, 120, 140],
  asciiBold: [190, 190, 210],
  accent:    [220, 220, 235],
  gutter:    [18, 18, 24],
};

function clr(r, g, b, a = 1) {
  return CanvasKit.Color(r, g, b, a);
}

function rect(c, x, y, w, h, aa = false) {
  const p = new CanvasKit.Paint();
  p.setColor(c);
  p.setAntiAlias(aa);
  canvas.drawRect(CanvasKit.XYWHRect(x, y, w, h), p);
  p.delete();
}

// ── solid fill ────────────────────────────────────────────────────────────────
rect(clr(...C.bg), 0, 0, W, H);

// ── pixel grid ────────────────────────────────────────────────────────────────
const block = 10;
const gap = 2;
const cell = block + gap;

for (let y = 0; y < H; y += cell) {
  const h = Math.min(block, H - y);
  for (let x = 0; x < W; x += cell) {
    const w = Math.min(block, W - x);
    rect(clr(...C.grid), x, y, w, h);
  }
}

// ── CRT scanlines ─────────────────────────────────────────────────────────────
for (let y = 0; y < H; y += 3) {
  rect(clr(0, 0, 0, 0.07), 0, y, W, 1);
  rect(clr(0, 0, 0, 0.10), 0, y + 2, W, 1);
}

// vertical phosphors
for (let x = 1; x < W; x += cell) {
  rect(clr(0, 0, 0, 0.04), x, 0, 1, H);
}

// ── CRT vignette ──────────────────────────────────────────────────────────────
const vignettePaint = new CanvasKit.Paint();
vignettePaint.setAntiAlias(true);
vignettePaint.setShader(
  CanvasKit.Shader.MakeRadialGradient(
    [W / 2, H / 2],
    Math.max(W, H) * 0.5,
    [clr(0, 0, 0, 0), clr(0, 0, 0, 0.45)],
    null,
    CanvasKit.TileMode.Clamp,
  ),
);
canvas.drawRect(CanvasKit.XYWHRect(0, 0, W, H), vignettePaint);
vignettePaint.delete();

// ═══════════════════════════════════════════════════════════════════════════════
//  CODE-EDITOR LEFT GUTTER (pixel-art line numbers)
// ═══════════════════════════════════════════════════════════════════════════════

const gutterW = 56;
const gutterX = 28;
const gutterY = 60;
const lineH = 22;

// gutter background
rect(clr(...C.gutter, 0.55), gutterX, gutterY, gutterW, H - 120);

// left edge
rect(clr(...C.ascii, 0.25), gutterX, gutterY, 2, H - 120);
// right edge
rect(clr(...C.ascii, 0.25), gutterX + gutterW - 2, gutterY, 2, H - 120);

// "line numbers" — small block clusters
const lnColor = clr(...C.asciiDim, 0.45);
const lnRows = Math.floor((H - 120) / lineH);
for (let i = 0; i < lnRows; i++) {
  const ly = gutterY + i * lineH + 6;
  // every 5th line gets a more visible marker
  const c = (i + 1) % 5 === 0 ? clr(...C.asciiBold, 0.35) : lnColor;
  const w = (i + 1) % 5 === 0 ? 16 : 10;
  rect(c, gutterX + 8, ly, w, 2);
  // faint dot on every line
  rect(clr(...C.asciiDim, 0.15), gutterX + 6, ly - 2, 2, 2);
}

// ── gutter header marker ──────────────────────────────────────────────────────
rect(clr(...C.accent, 0.30), gutterX + 4, gutterY - 2, gutterW - 8, 2);

// ═══════════════════════════════════════════════════════════════════════════════
//  RIGHT-SIDE LARGE PIXEL-ART GEOMETRIC TOWER
//  A composed block structure — consistent visual anchor across all cards.
// ═══════════════════════════════════════════════════════════════════════════════

const towerX = W - 120;
const towerStartY = 80;
const towerBlock = 8;

function towerBalloon(cx, cy, w, h, c) {
  rect(c, cx, cy, w, h);
}

function tower(cx, top, c) {
  const layers = [
    [ 2, 6 ],   // (count, width in towerBlock units)
    [ 1, 8 ],
    [ 2, 4 ],
    [ 1, 10 ],
    [ 3, 6 ],
    [ 1, 12 ],
    [ 2, 8 ],
    [ 3, 4 ],
    [ 1, 10 ],
    [ 2, 6 ],
    [ 1, 14 ],
    [ 4, 8 ],
    [ 1, 6 ],
    [ 2, 10 ],
    [ 3, 4 ],
    [ 1, 12 ],
    [ 2, 6 ],
    [ 1, 8 ],
  ];

  let cy = top;
  for (const [count, w] of layers) {
    for (let i = 0; i < count; i++) {
      const bw = w * towerBlock;
      const bx = cx - bw / 2;
      const alpha = 0.06 + (layers.indexOf([count, w]) / layers.length) * 0.22;
      const tc = clr(...C.accent, alpha);
      rect(tc, bx, cy, bw, towerBlock * 0.8);
      cy += towerBlock + 2;
    }
    cy += 4;
  }
}

tower(towerX, towerStartY, clr(...C.accent, 0.15));

// ── smaller tower on the right as well, lower down ────────────────────────────
const smallTowerX = towerX - 70;
const smallLayers = [
  [1, 6], [2, 4], [1, 8], [3, 4], [1, 6], [2, 8], [1, 4], [2, 6],
];
let cy = towerStartY + 180;
for (const [count, w] of smallLayers) {
  for (let i = 0; i < count; i++) {
    const bw = w * towerBlock;
    const bx = smallTowerX - bw / 2;
    const alpha = 0.05 + (smallLayers.indexOf([count, w]) / smallLayers.length) * 0.18;
    rect(clr(...C.ascii, alpha), bx, cy, bw, towerBlock * 0.7);
    cy += towerBlock + 2;
  }
  cy += 3;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LARGE PIXEL-ART DIAMOND (decorative background element, top-right quadrant)
// ═══════════════════════════════════════════════════════════════════════════════

function bigDiamond(cx, cy, sideBlocks, c) {
  const s = sideBlocks;
  const totalRows = s * 2 - 1;
  for (let row = 0; row < totalRows; row++) {
    const offset = row < s ? row : totalRows - 1 - row;
    const w = offset * 2 + 1;
    const sx = cx - offset * (block + gap);
    const sy = cy + row * (block + gap);
    for (let col = 0; col < w; col++) {
      rect(c, sx + col * (block + gap), sy, block, block);
    }
  }
}

// a faint large diamond near top-center (behind text area but very dim)
bigDiamond(W / 2, 200, 6, clr(...C.accent, 0.04));

// bold diamond on the bottom-left corner area
bigDiamond(140, H - 140 - 5 * (block + gap), 4, clr(...C.ascii, 0.18));

// ═══════════════════════════════════════════════════════════════════════════════
//  BORDER — double-line box-drawing style
// ═══════════════════════════════════════════════════════════════════════════════

const BI = 26;        // border inset
const OT = 3;         // outer thickness
const IT = 1;         // inner thickness
const BG = 6;         // gap between outer and inner
const CS = 8;         // corner solid size

const bO = BI;                    // outer edge
const bI = BI + OT + BG;         // inner edge
const bR = W - BI;               // right outer
const bB = H - BI;               // bottom outer
const bIR = bR - OT - BG;       // right inner
const bIB = bB - OT - BG;       // bottom inner

// top outer
rect(clr(...C.ascii, 0.45), bO, bO, W - BI * 2, OT);
// bottom outer
rect(clr(...C.ascii, 0.45), bO, bB - OT, W - BI * 2, OT);
// left outer
rect(clr(...C.ascii, 0.45), bO, bO, OT, H - BI * 2);
// right outer
rect(clr(...C.ascii, 0.45), bR - OT, bO, OT, H - BI * 2);

// top inner
rect(clr(...C.asciiDim, 0.30), bI, bI, W - bI * 2, IT);
// bottom inner
rect(clr(...C.asciiDim, 0.30), bI, bIB - IT, W - bI * 2, IT);
// left inner
rect(clr(...C.asciiDim, 0.30), bI, bI, IT, H - bI * 2);
// right inner
rect(clr(...C.asciiDim, 0.30), bIR, bI, IT, H - bI * 2);

// corner solids
rect(clr(...C.asciiBold, 0.55), bO, bO, CS, CS);
rect(clr(...C.asciiBold, 0.55), bR - CS, bO, CS, CS);
rect(clr(...C.asciiBold, 0.55), bO, bB - CS, CS, CS);
rect(clr(...C.asciiBold, 0.55), bR - CS, bB - CS, CS, CS);

// ═══════════════════════════════════════════════════════════════════════════════
//  MARGIN DECORATIONS — dashes, dot patterns, crosses
// ═══════════════════════════════════════════════════════════════════════════════

const U = 2; // pixel unit

function dot(x, y, c, s = U) {
  rect(c, x, y, s, s);
}

function cross(x, y, c) {
  dot(x, y - U * 2, c);
  dot(x - U * 2, y, c);
  dot(x, y, c);
  dot(x + U * 2, y, c);
  dot(x, y + U * 2, c);
}

// dashed decorative rules
function dashes(y, c, dash = 4, gap = 6, x0 = bI + 10, x1 = bIR - 10) {
  for (let x = x0; x < x1; x += dash + gap) {
    const end = Math.min(x + dash, x1);
    rect(c, x, y, end - x, U);
  }
}

const DIM = clr(...C.asciiDim, 0.22);
const MID = clr(...C.asciiDim, 0.35);

// top and bottom dash lines
dashes(bO + OT + 4, MID, 3, 8);
dashes(bB - OT - 4 - U, MID, 3, 8);

// crosses between border lines and text
const tY = bO + OT + BG + 8;
const bY = bB - OT - BG - 8 - U * 3;
const crossXs = [100, 260, 420, 580, 740, 900, 1060, 1150];
for (const cx of crossXs) {
  cross(cx, tY, DIM);
  cross(cx, bY, DIM);
}

// scattered dot triads
const SC = clr(...C.asciiDim, 0.15);
const triads = [
  [70, 140], [1130, 150], [80, 500], [1120, 490],
  [70, 330], [1130, 310], [150, 90], [1050, 90],
  [150, H - 90], [1050, H - 90],
];
for (const [x, y] of triads) {
  dot(x, y, SC, U);
  dot(x + U * 3, y, SC, U);
  dot(x + U * 1, y + U * 2, SC, U);
}

// bottom status bar "blocks" (pixel-art binary/hex pairs)
const barY = bB - OT - BG - 14;
const barX = bI + 12;
const barW = 8;
const barH = 6;
const barGap = 6;
const barColor = clr(...C.asciiDim, 0.25);
const barColorOn = clr(...C.accent, 0.18);
const barPattern = [1,1,0,0,1,0,1,1,1,0,0,1,0,1,1,0];
for (let i = 0; i < barPattern.length; i++) {
  const c = barPattern[i] ? barColorOn : barColor;
  const bx = barX + i * (barW + barGap / 2);
  rect(c, bx, barY, barW, barH);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  WRITE OUTPUT
// ═══════════════════════════════════════════════════════════════════════════════

const image = surface.makeImageSnapshot();
const bytes = image.encodeToBytes(CanvasKit.ImageFormat.PNG, 100);

const outDir = path.resolve(import.meta.dirname, "../public/images/og");
await fs.mkdir(outDir, { recursive: true });
const outPath = path.join(outDir, "grid-bg.png");
await fs.writeFile(outPath, Buffer.from(bytes));

surface.dispose();

console.log(`Written: ${outPath}`);
