/**
 * Fetches all boards listed in src/data/job-boards.json and writes a
 * snapshot to src/data/jobs.json, which the site build reads instead of
 * hitting the APIs at build time.
 *
 * Run locally:      pnpm sync-jobs
 * Run in CI:        hourly via .github/workflows/jobs.yml (then deploys)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchAllJobsFromBoards } from "../src/lib/jobs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, "../src/data/jobs.json");

const { jobs, errors } = await fetchAllJobsFromBoards();

if (jobs.length === 0) {
  console.error("Fetched 0 jobs — refusing to overwrite the snapshot.");
  process.exit(1);
}

const payload = JSON.stringify({ generatedAt: new Date().toISOString(), jobs });
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, payload + "\n");

console.log(`Wrote ${jobs.length} jobs to ${outPath}`);
if (errors.length > 0) {
  console.warn(`${errors.length} board(s) failed:`);
  for (const e of errors) console.warn(`  - ${e}`);
}
