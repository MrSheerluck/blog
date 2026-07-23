import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { config } from "virtual:nimbus/config";

export const prerender = true;

export async function GET() {
  const entries = await getCollection("docs");
  const posts = entries
    .filter((e) => e.data.date)
    .filter((e) => e.id !== "index")
    .sort(
      (a, b) =>
        new Date(b.data.date!).getTime() - new Date(a.data.date!).getTime(),
    );

  return rss({
    title: config.title,
    description: config.description,
    site: config.site!,
    items: posts.map((p) => ({
      title: p.data.title,
      description: p.data.description,
      pubDate: p.data.date,
      link: `/${p.id}`,
    })),
    customData: `<language>${config.locale ?? "en"}</language>`,
  });
}
