import boards from "../data/job-boards.json";

export type ExperienceLevel =
  | "Internship"
  | "Entry"
  | "Mid"
  | "Senior"
  | "Staff+"
  | "Lead";

export type Experience = ExperienceLevel | "Not specified";

export const EXPERIENCE_LEVELS: ExperienceLevel[] = [
  "Internship",
  "Entry",
  "Mid",
  "Senior",
  "Staff+",
  "Lead",
];

export interface Job {
  title: string;
  company: string;
  location: string;
  url: string;
  updatedAt: string | null;
  tech: string[];
  experience: Experience;
}

interface BoardConfig {
  company: string;
  greenhouse?: string;
  lever?: string;
  ashby?: string;
  smartrecruiters?: string;
}

const TECH_PATTERNS: Array<[string, RegExp]> = [
  ["Rust", /\brust\b/i],
  ["Go", /\bgolang\b|\bgo\b(?=[\s,.;:)])/i],
  ["C++", /\bc\+\+/i],
  ["C", /(^|[^\w+#])c(?![\w+#])/i],
  ["C#", /\bc#\b/i],
  ["Python", /\bpython\b/i],
  ["JavaScript", /\bjavascript\b|\bnode\.?js\b/i],
  ["TypeScript", /\btypescript\b/i],
  ["Java", /\bjava\b/i],
  ["Kotlin", /\bkotlin\b/i],
  ["Swift", /\bswift\b/i],
  ["Ruby", /\bruby\b|\brails\b/i],
  ["Elixir", /\belixir\b/i],
  ["Haskell", /\bhaskell\b/i],
  ["Zig", /\bzig\b/i],
  ["Scala", /\bscala\b/i],
  ["PHP", /\bphp\b/i],
  ["WebAssembly", /\bwebassembly\b|\bwasm\b/i],
  ["React", /\breact\b/i],
  ["Vue", /\bvue\b/i],
  ["GraphQL", /\bgraphql\b/i],
  ["gRPC", /\bgrpc\b/i],
  ["Kubernetes", /\bkubernetes\b|\bk8s\b/i],
  ["Docker", /\bdocker\b/i],
  ["Terraform", /\bterraform\b/i],
  ["AWS", /\baws\b|amazon web services/i],
  ["Google Cloud", /\bgcp\b|google cloud/i],
  ["Azure", /\bazure\b/i],
  ["PostgreSQL", /\bpostgres(ql)?\b/i],
  ["MySQL", /\bmysql\b/i],
  ["Redis", /\bredis\b/i],
  ["MongoDB", /\bmongodb\b/i],
  ["Kafka", /\bkafka\b/i],
  ["Linux", /\blinux\b/i],
];

export const TECH_STACKS: string[] = TECH_PATTERNS.map(([label]) => label);

function detectTech(text: string): string[] {
  const found: string[] = [];
  for (const [label, pattern] of TECH_PATTERNS) {
    if (pattern.test(text)) found.push(label);
  }
  return found;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#x27;/gi, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/\s+/g, " ");
}

function experienceFromText(title: string, body: string): Experience {
  const t = title.toLowerCase();
  if (/\bintern(ship)?\b/.test(t)) return "Internship";
  if (/\b(junior|entry[- ]level|graduate|early career)\b/.test(t)) return "Entry";
  if (/\b(staff|principal|distinguished|architect)\b/.test(t)) return "Staff+";
  if (/\b(senior|sr\.?)\b/.test(t)) return "Senior";
  if (/\b(engineering manager|head of|director|vp of engineering|tech lead|team lead)\b/.test(t))
    return "Lead";
  if (/\blead\b|\bmanager\b/.test(t)) return "Lead";
  if (/\bmid[- ]level\b/.test(t)) return "Mid";
  const b = body.slice(0, 4000);
  if (/\b(intern(ship)?|working student)\b/i.test(b)) return "Internship";
  if (/\b(years of experience|yrs of experience)\b/i.test(b)) {
    const m = b.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s*\+?\s*years?\b/i);
    if (m) {
      const n = parseInt(m[1], 10) || { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }[m[1].toLowerCase()] || 0;
      if (n <= 1) return "Entry";
      if (n === 2) return "Mid";
      if (n <= 4) return "Mid";
      if (n <= 7) return "Senior";
      return "Staff+";
    }
  }
  return "Not specified";
}

async function fetchGreenhouse(token: string, company: string): Promise<Job[]> {
  const res = await fetch(
    `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`,
  );
  if (!res.ok) throw new Error(`Greenhouse ${token}: ${res.status}`);
  type GreenhouseJob = {
    title: string;
    absolute_url: string;
    updated_at?: string;
    location?: { name?: string };
    content?: string;
  };
  const data = (await res.json()) as { jobs?: GreenhouseJob[] };
  return (data.jobs ?? []).map((j) => {
    const text = htmlToText(j.content ?? "");
    return {
      title: j.title,
      company,
      location: j.location?.name ?? "",
      url: j.absolute_url,
      updatedAt: j.updated_at ?? null,
      tech: detectTech(`${j.title} ${text}`),
      experience: experienceFromText(j.title, text),
    };
  });
}

async function fetchLever(company_token: string, company: string): Promise<Job[]> {
  const res = await fetch(
    `https://api.lever.co/v0/postings/${company_token}?mode=json`,
  );
  if (!res.ok) throw new Error(`Lever ${company_token}: ${res.status}`);
  type LeverJob = {
    text: string;
    hostedUrl: string;
    createdAt?: number;
    categories?: { location?: string; commitment?: string };
    descriptionPlain?: string;
  };
  const data = (await res.json()) as LeverJob[];
  return data.map((j) => ({
    title: j.text,
    company,
    location: j.categories?.location ?? "",
    url: j.hostedUrl,
    updatedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
    tech: detectTech(`${j.text} ${j.descriptionPlain ?? ""}`),
    experience: /\bintern(ship)?\b/i.test(j.categories?.commitment ?? "")
      ? "Internship"
      : experienceFromText(j.text, j.descriptionPlain ?? ""),
  }));
}

async function fetchAshby(token: string, company: string): Promise<Job[]> {
  const res = await fetch(
    `https://api.ashbyhq.com/posting-api/job-board/${token}`,
  );
  if (!res.ok) throw new Error(`Ashby ${token}: ${res.status}`);
  type AshbyJob = {
    title: string;
    jobUrl: string;
    publishedAt?: string;
    location?: string;
    isListed?: boolean;
    descriptionPlain?: string;
  };
  const data = (await res.json()) as { jobs?: AshbyJob[] };
  return (data.jobs ?? [])
    .filter((j) => j.isListed !== false)
    .map((j) => ({
      title: j.title,
      company,
      location: j.location ?? "",
      url: j.jobUrl,
      updatedAt: j.publishedAt ?? null,
      tech: detectTech(`${j.title} ${j.descriptionPlain ?? ""}`),
      experience: experienceFromText(j.title, j.descriptionPlain ?? ""),
    }));
}

async function fetchSmartRecruiters(token: string, company: string): Promise<Job[]> {
  const jobs: Job[] = [];
  for (let page = 1; page <= 15; page++) {
    const res = await fetch(
      `https://api.smartrecruiters.com/v1/companies/${token}/postings?limit=100&page=${page}`,
    );
    if (!res.ok) throw new Error(`SmartRecruiters ${token}: ${res.status}`);
    type SRPosting = {
      id: string;
      name: string;
      releasedDate?: string;
      location?: { city?: string; country?: string; region?: string };
    };
    const data = (await res.json()) as { content?: SRPosting[]; totalFound?: number };
    const postings = data.content ?? [];
    if (postings.length === 0) break;
    for (const p of postings) {
      const loc = [p.location?.city, p.location?.region, p.location?.country]
        .filter(Boolean)
        .join(", ");
      jobs.push({
        title: p.name,
        company,
        location: loc,
        url: `https://jobs.smartrecruiters.com/${token}/${p.id}`,
        updatedAt: p.releasedDate ?? null,
        tech: detectTech(p.name),
        experience: experienceFromText(p.name, ""),
      });
    }
    if ((data.totalFound ?? 0) <= page * 100) break;
  }
  return jobs;
}

export async function getAllJobs(): Promise<{ jobs: Job[]; errors: string[] }> {
  const results = await Promise.allSettled(
    (boards as BoardConfig[]).flatMap((b) => {
      const fetchers = [];
      if (b.greenhouse) fetchers.push(fetchGreenhouse(b.greenhouse, b.company));
      if (b.lever) fetchers.push(fetchLever(b.lever, b.company));
      if (b.ashby) fetchers.push(fetchAshby(b.ashby, b.company));
      if (b.smartrecruiters)
        fetchers.push(fetchSmartRecruiters(b.smartrecruiters, b.company));
      return fetchers;
    }),
  );

  const jobs: Job[] = [];
  const errors: string[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") jobs.push(...r.value);
    else errors.push(String(r.reason));
  }

  jobs.sort((a, b) => {
    const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0;
    const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0;
    return tb - ta;
  });
  return { jobs, errors };
}
