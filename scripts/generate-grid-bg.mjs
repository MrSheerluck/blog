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

const bgPaint = new CanvasKit.Paint();
bgPaint.setColor(CanvasKit.Color(7, 7, 9));
canvas.drawRect(CanvasKit.XYWHRect(0, 0, W, H), bgPaint);

const pixelSize = 6;
const gap = 1;
const gridColor = CanvasKit.Color(22, 25, 26);

const gridPaint = new CanvasKit.Paint();
gridPaint.setColor(gridColor);

for (let x = pixelSize; x < W; x += pixelSize + gap) {
  if (x > W) break;
  canvas.drawRect(CanvasKit.XYWHRect(x, 0, gap, H), gridPaint);
}

for (let y = pixelSize; y < H; y += pixelSize + gap) {
  if (y > H) break;
  canvas.drawRect(CanvasKit.XYWHRect(0, y, W, gap), gridPaint);
}

const scanlineAlpha = 0.03;
const scanPaint = new CanvasKit.Paint();
scanPaint.setColor(CanvasKit.Color(0, 0, 0, scanlineAlpha));

for (let y = 0; y < H; y += 4) {
  canvas.drawRect(CanvasKit.XYWHRect(0, y, W, 2), scanPaint);
}

const image = surface.makeImageSnapshot();
const bytes = image.encodeToBytes(CanvasKit.ImageFormat.PNG, 100);

const outDir = path.resolve(import.meta.dirname, "../public/images/og");
await fs.mkdir(outDir, { recursive: true });
const outPath = path.join(outDir, "grid-bg.png");
await fs.writeFile(outPath, Buffer.from(bytes));

surface.dispose();
console.log(`Written: ${outPath}`);
