import { getCollection } from "astro:content";
import { renderOg, type OgParams } from "./_render-og";

const entries = await getCollection("docs", (entry) => !entry.data.draft);

export async function getStaticPaths() {
  return entries.map((entry) => ({
    params: { slug: entry.id },
    props: {
      title: entry.data.title,
      description: entry.data.description ?? "",
      date: entry.data.date,
    },
  }));
}

export async function GET({ props }: { props: OgParams }) {
  const body = await renderOg({
    url: "blog.sheerluck.dev",
    ...props,
    date: props.date
      ? new Date(props.date).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : undefined,
  });

  return new Response(body, {
    headers: { "Content-Type": "image/png" },
  });
}
