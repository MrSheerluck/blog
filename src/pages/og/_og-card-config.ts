/**
 * Shared visual config for build-time OG cards.
 *
 * Edit this file to retune generated card colors, spacing, and fonts. Both
 * the per-page endpoint (`og/[...slug].ts`) and the homepage fallback
 * (`og.png.ts`) spread this object into `astro-og-canvas`.
 *
 * Leading underscore tells Astro to skip routing for this file — it sits
 * inside `src/pages/` to be next to its consumers, but it's not a route.
 */

import type { OGImageOptions } from "astro-og-canvas";

export const ogCardConfig = {
  bgGradient: [[7, 7, 9]],
  bgImage: {
    path: "./public/images/og/grid-bg.png",
    fit: "fill",
  },
  border: { color: [0, 255, 65], width: 4, side: "inline-start" },
  padding: 96,
  fonts: [
    "./node_modules/geist/dist/fonts/geist-mono/GeistMono-Bold.ttf",
    "./node_modules/geist/dist/fonts/geist-mono/GeistMono-Regular.ttf",
  ],
  font: {
    title: {
      color: [0, 255, 65],
      size: 56,
      weight: "Bold",
      families: ["Geist Mono"],
      lineHeight: 1.2,
    },
    description: {
      color: [0, 200, 50],
      size: 28,
      weight: "Normal",
      families: ["Geist Mono"],
      lineHeight: 1.4,
    },
  },
  format: "PNG",
} satisfies Partial<OGImageOptions>;
