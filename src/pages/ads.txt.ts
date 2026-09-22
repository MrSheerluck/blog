export const prerender = true;

const client = import.meta.env.PUBLIC_ADSENSE_CLIENT?.trim() || "ca-pub-5206404453602193";
const publisher = client?.startsWith("ca-pub-")
  ? `pub-${client.slice("ca-pub-".length)}`
  : null;

export function GET() {
  const body = publisher
    ? `google.com, ${publisher}, DIRECT, f08c47fec0942fa0\n`
    : "# Configure PUBLIC_ADSENSE_CLIENT to generate this file.\n";

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
