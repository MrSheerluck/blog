import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
// `z` re-exported from `astro:content` is deprecated; import it from
// `astro/zod` (the pattern nimbus-docs' own schema helpers document).
import { z } from "astro/zod";
import { docsCollection, partialsCollection } from "@cloudflare/nimbus-docs/content";
import { supportedLocales } from "./i18n/config";

const translationDocs = docsCollection({
  base: "translations",
  schemaFields: {
    locale: z.enum(supportedLocales.filter((locale) => locale !== "en") as [string, ...string[]]),
    translationKey: z.string(),
    slug: z.string(),
    date: z.coerce.date().optional(),
    series: z.array(z.string()).optional(),
  },
});

export const collections = {
  docs: defineCollection(
    docsCollection({
      schemaFields: {
        audience: z.literal("human").optional(),
        date: z.coerce.date().optional(),
        series: z.array(z.string()).optional(),
      },
    }),
  ),
  // Translations are served through locale-prefixed routes rather than the
  // primary Nimbus docs route. The leading underscore keeps this collection
  // out of Nimbus's global agent index until each locale has been reviewed.
  _translations: defineCollection(
    {
      // The public `slug` is intentionally shared by every translation. Use
      // the locale-qualified source path as the collection id so Astro does
      // not collapse equivalent translations into one entry.
      loader: glob({
        base: "./src/content/translations",
        pattern: "**/*.{md,mdx}",
        generateId: ({ entry }) => entry.replace(/\.(md|mdx)$/, ""),
      }),
      schema: translationDocs.schema,
    },
  ),
  partials: defineCollection(partialsCollection()),
};
