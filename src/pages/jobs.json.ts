import type { APIRoute } from "astro";
import { getAllJobs } from "../lib/jobs";

export const GET: APIRoute = async () => {
  const { jobs } = await getAllJobs();
  return new Response(JSON.stringify({ pageSize: 25, jobs }), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};
