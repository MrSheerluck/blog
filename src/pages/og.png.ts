import { config } from "virtual:nimbus/config";
import { renderOg } from "./og/_render-og";

export const prerender = true;

export async function GET() {
  const body = await renderOg({
    url: "blog.sheerluck.dev",
    title: config.title,
    description: config.description,
  });

  return new Response(body, {
    headers: { "Content-Type": "image/png" },
  });
}
