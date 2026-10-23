import type { ToolHubStore, ToolLaunch } from "./store.js";

// Hizuri (tool hub): the three outside catalogs hub_find reads, all free and without sign-in.
//   1. The official MCP Registry (CC0): installable servers. Its search is a plain name and
//      description match and answers in 30–60 s, so each keyword is searched on its own, in
//      parallel, and cached for 6 h.
//   2. agent.reviews: ratings coding agents left after real tasks. Its MCP needs an OAuth sign-in,
//      so the hub reads its public pages instead: the sitemap (tool slugs) and each tool's .md
//      page. The ratings are self-reported, with no proof of a run (its own how-it-works page).
//   3. nohumans.directory: paid x402 APIs it bought with real money to check they deliver. The hub
//      cannot install those; it lists them so the agent and the user know they exist.
// A source that is down or slow answers with an empty list and a note; hub_find never fails
// because one catalog does.

export const REGISTRY_URL = "https://registry.modelcontextprotocol.io";
export const AGENT_REVIEWS_URL = "https://agent.reviews";
export const NOHUMANS_MCP_URL = "https://api.nohumans.directory/mcp";

const HOUR = 60 * 60 * 1000;
const REGISTRY_TIMEOUT_MS = 60_000;
const PAGE_TIMEOUT_MS = 20_000;

export type CandidateSource = "registry" | "agent.reviews" | "nohumans";

export interface ExternalRating {
  overall: number;
  count: number;
  usefulness?: number;
  ease?: number;
  reliability?: number;
  completedPercent?: number;
}

export interface HubCandidate {
  source: CandidateSource;
  /** Registry name, agent.reviews page path or nohumans listing id. */
  id: string;
  title: string;
  description: string;
  url?: string;
  /** How hub_add would run it; absent when the hub cannot install it. */
  launch?: ToolLaunch;
  version?: string;
  /** Why hub_add cannot install it, when it cannot. */
  notInstallable?: string;
  requiredSecrets: string[];
  rating?: ExternalRating;
  paid?: { price: number; currency: string; verified: boolean };
}

export interface SourceResult {
  source: CandidateSource;
  status: "ok" | "cached" | "down";
  note?: string;
  candidates: HubCandidate[];
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface SourceContext {
  store: ToolHubStore;
  fetch: FetchLike;
}

const STOPWORDS = new Set(
  "a an the to of for and or in on at by with from as into via is are be it its this that these those my me i we you your our tool tools find need want get use using some any can could would should please which what how do does make let".split(
    " ",
  ),
);

/** The task's words that can match a catalog entry: lower case, no stopwords, at most 5. */
export function taskKeywords(task: string): string[] {
  const words = task
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word));
  return [...new Set(words)].slice(0, 5);
}

/** Loose word match: the shorter word's first five letters start the longer one. */
export function wordsMatch(a: string, b: string): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return long.startsWith(short.slice(0, Math.min(5, short.length)));
}

async function fetchWithTimeout(
  ctx: SourceContext,
  url: string,
  timeoutMs: number,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await ctx.fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`${url} answered HTTP ${response.status}`);
    return response;
  } finally {
    clearTimeout(timer);
  }
}

/** Reads through the cache: fresh copy first, then the network, then a stale copy if it fails. */
async function cached<T>(
  ctx: SourceContext,
  key: string,
  maxAgeMs: number,
  load: () => Promise<T>,
): Promise<{ value: T; status: "ok" | "cached" } | { status: "down"; note: string }> {
  const fresh = await ctx.store.readCache<T>(key, maxAgeMs);
  if (fresh !== undefined) return { value: fresh, status: "cached" };
  try {
    const value = await load();
    await ctx.store.writeCache(key, value);
    return { value, status: "ok" };
  } catch (error) {
    const stale = await ctx.store.readCache<T>(key, Number.POSITIVE_INFINITY);
    if (stale !== undefined) return { value: stale, status: "cached" };
    return { status: "down", note: error instanceof Error ? error.message : String(error) };
  }
}

// ---------- official MCP Registry ----------

interface RegistryPackage {
  registryType?: string;
  identifier?: string;
  version?: string;
  transport?: { type?: string };
  environmentVariables?: Array<{ name?: string; isRequired?: boolean; isSecret?: boolean }>;
  packageArguments?: unknown[];
}

interface RegistryRemote {
  type?: string;
  url?: string;
  headers?: Array<{ name?: string; isRequired?: boolean }>;
}

export interface RegistryServer {
  name: string;
  title?: string;
  description?: string;
  version?: string;
  websiteUrl?: string;
  repository?: { url?: string };
  packages?: RegistryPackage[];
  remotes?: RegistryRemote[];
}

function requiredEnv(pkg: RegistryPackage): string[] {
  return (pkg.environmentVariables ?? [])
    .filter((env) => env.isRequired && env.name)
    .map((env) => env.name as string);
}

function requiredHeaders(remote: RegistryRemote): string[] {
  return (remote.headers ?? []).filter((h) => h.isRequired && h.name).map((h) => h.name as string);
}

function isRunnableNpm(pkg: RegistryPackage): boolean {
  return (
    pkg.registryType === "npm" &&
    Boolean(pkg.identifier) &&
    (pkg.transport?.type ?? "stdio") === "stdio" &&
    !pkg.packageArguments?.length
  );
}

/** How the hub would run a registry server: a free npm stdio package first, then a remote. */
function pickLaunch(server: RegistryServer): ToolLaunch | undefined {
  const npm = (server.packages ?? []).filter(isRunnableNpm);
  const remotes = (server.remotes ?? []).filter((remote) => remote.type === "streamable-http");
  const pkg = npm.find((p) => requiredEnv(p).length === 0) ?? npm[0];
  const remote = remotes.find((r) => requiredHeaders(r).length === 0 && r.url) ?? remotes[0];
  const freeRemote = remote?.url && requiredHeaders(remote).length === 0;
  if (pkg && (requiredEnv(pkg).length === 0 || !freeRemote)) {
    return {
      kind: "npm",
      package: pkg.identifier as string,
      version: pkg.version ?? server.version ?? "latest",
      args: [],
      env: requiredEnv(pkg),
    };
  }
  if (remote?.url) return { kind: "remote", url: remote.url, headers: requiredHeaders(remote) };
  return undefined;
}

export function registryCandidate(server: RegistryServer): HubCandidate {
  const base = {
    source: "registry" as const,
    id: server.name,
    title: server.title ?? server.name,
    description: server.description ?? "",
    url: server.repository?.url ?? server.websiteUrl,
    version: server.version,
  };
  const launch = pickLaunch(server);
  if (launch) {
    return {
      ...base,
      ...(launch.kind === "npm" ? { version: launch.version } : {}),
      launch,
      requiredSecrets: launch.kind === "npm" ? launch.env : launch.headers,
    };
  }
  const kinds = [
    ...new Set((server.packages ?? []).map((p) => p.registryType ?? "unknown")),
    ...(server.remotes ?? []).map((r) => r.type ?? "unknown"),
  ];
  return {
    ...base,
    notInstallable: `the hub runs npm stdio packages and streamable-http remotes; this one ships ${kinds.join(", ") || "nothing runnable"}`,
    requiredSecrets: [],
  };
}

export async function searchRegistry(
  ctx: SourceContext,
  keywords: string[],
): Promise<SourceResult> {
  const results = await Promise.all(
    keywords.map((keyword) =>
      cached(ctx, `registry:search:${keyword}`, 6 * HOUR, async () => {
        const url = `${REGISTRY_URL}/v0.1/servers?search=${encodeURIComponent(keyword)}&version=latest&limit=100`;
        const body = (await (await fetchWithTimeout(ctx, url, REGISTRY_TIMEOUT_MS)).json()) as {
          servers?: Array<{ server?: RegistryServer }>;
        };
        return (body.servers ?? []).flatMap((entry) => (entry.server ? [entry.server] : []));
      }),
    ),
  );
  const servers = new Map<string, RegistryServer>();
  const notes: string[] = [];
  let anyFresh = false;
  for (const [index, result] of results.entries()) {
    if (result.status === "down") {
      notes.push(`"${keywords[index]}": ${result.note}`);
      continue;
    }
    anyFresh ||= result.status === "ok";
    for (const server of result.value) servers.set(server.name, server);
  }
  if (servers.size === 0 && notes.length > 0) {
    return { source: "registry", status: "down", note: notes.join("; "), candidates: [] };
  }
  return {
    source: "registry",
    status: anyFresh ? "ok" : "cached",
    ...(notes.length ? { note: notes.join("; ") } : {}),
    candidates: [...servers.values()].map(registryCandidate),
  };
}

export async function fetchRegistryServer(
  ctx: SourceContext,
  name: string,
): Promise<RegistryServer | undefined> {
  const result = await cached(ctx, `registry:server:${name}`, HOUR, async () => {
    const url = `${REGISTRY_URL}/v0.1/servers/${encodeURIComponent(name)}/versions/latest`;
    const body = (await (await fetchWithTimeout(ctx, url, REGISTRY_TIMEOUT_MS)).json()) as {
      server?: RegistryServer;
    };
    if (!body.server) throw new Error(`the registry has no server named ${name}`);
    return body.server;
  });
  return result.status === "down" ? undefined : result.value;
}

/** true or false from npm itself; undefined when npm could not be asked (the caller goes on). */
export async function npmVersionExists(
  ctx: SourceContext,
  pkg: string,
  version: string,
): Promise<boolean | undefined> {
  const url = `https://registry.npmjs.org/${pkg.replace("/", "%2F")}/${encodeURIComponent(version)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
  try {
    const response = await ctx.fetch(url, { signal: controller.signal });
    if (response.status === 404) return false;
    return response.ok ? true : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- agent.reviews (public pages) ----------

/** Parses the "## Ratings" block of an agent.reviews tool page. */
export function parseAgentReviewsPage(markdown: string): ExternalRating | undefined {
  const overall = markdown.match(/Overall: ([\d.]+) out of 5[^\n]*?from ([\d,]+) reviews/);
  if (!overall) return undefined;
  const num = (re: RegExp) => {
    const m = markdown.match(re);
    return m ? Number(m[1]) : undefined;
  };
  return {
    overall: Number(overall[1]),
    count: Number(overall[2].replace(/,/g, "")),
    usefulness: num(/- Usefulness: ([\d.]+)/),
    ease: num(/- Ease: ([\d.]+)/),
    reliability: num(/- Reliability: ([\d.]+)/),
    completedPercent: num(/- Tasks completed: (\d+)%/),
  };
}

export async function fetchAgentReviewsPage(
  ctx: SourceContext,
  pagePath: string,
): Promise<{ title: string; description: string; rating?: ExternalRating } | undefined> {
  const result = await cached(ctx, `agent.reviews:page:${pagePath}`, 24 * HOUR, async () => {
    const response = await fetchWithTimeout(
      ctx,
      `${AGENT_REVIEWS_URL}${pagePath}.md`,
      PAGE_TIMEOUT_MS,
    );
    return response.text();
  });
  if (result.status === "down") return undefined;
  const text = result.value;
  const title = text.match(/^# (.+?)(?: reviews by coding agents)?$/m)?.[1] ?? pagePath;
  const description = text.match(/^> (.+)$/m)?.[1] ?? "";
  return { title, description, rating: parseAgentReviewsPage(text) };
}

interface AgentReviewsCategory {
  slug: string;
  name: string;
  description: string;
}

/** The "## Categories" list of agent.reviews' llms.txt. */
export function parseAgentReviewsCategories(llmsTxt: string): AgentReviewsCategory[] {
  return [
    ...llmsTxt.matchAll(
      /^- \[([^\]]+)\]\(https:\/\/agent\.reviews\/([a-z0-9-]+)\.md\): [\d,]+ tools\. (.+)$/gm,
    ),
  ].map((m) => ({ name: m[1], slug: m[2], description: m[3] }));
}

/** The ranked tool list of an agent.reviews category page. */
export function parseAgentReviewsCategoryPage(
  markdown: string,
  categoryDescription: string,
): HubCandidate[] {
  return [
    ...markdown.matchAll(
      /^\d+\. \[([^\]]+)\]\(https:\/\/agent\.reviews(\/[a-z0-9-]+\/[a-z0-9-]+)\.md\)[^:]*: ([\d.]+) out of 5 \([^)]*\) from ([\d,]+) reviews(?:, (\d+)% of tasks completed)?\.?(?:[^“\n]*“([^”\n]*)”)?/gm,
    ),
  ].map((m) => ({
    source: "agent.reviews" as const,
    id: m[2],
    title: m[1],
    description: [categoryDescription, m[6] ?? ""].filter(Boolean).join(" "),
    url: `${AGENT_REVIEWS_URL}${m[2]}`,
    notInstallable: "agent.reviews rates products and libraries, not MCP servers the hub can run",
    requiredSecrets: [],
    rating: {
      overall: Number(m[3]),
      count: Number(m[4].replace(/,/g, "")),
      ...(m[5] ? { completedPercent: Number(m[5]) } : {}),
    },
  }));
}

/**
 * Two ways in: tool pages whose slug carries a task word (the sitemap), and the tools of the
 * category whose description matches the task best (llms.txt, then the category page).
 */
export async function searchAgentReviews(
  ctx: SourceContext,
  keywords: string[],
): Promise<SourceResult> {
  const [sitemap, llms] = await Promise.all([
    cached(ctx, "agent.reviews:sitemap", 24 * HOUR, async () => {
      const xml = await (
        await fetchWithTimeout(ctx, `${AGENT_REVIEWS_URL}/sitemap.xml`, PAGE_TIMEOUT_MS)
      ).text();
      return [
        ...xml.matchAll(/<loc>https:\/\/agent\.reviews(\/[a-z0-9-]+\/[a-z0-9-]+)<\/loc>/g),
      ].map((m) => m[1]);
    }),
    cached(ctx, "agent.reviews:llms", 24 * HOUR, async () =>
      (await fetchWithTimeout(ctx, `${AGENT_REVIEWS_URL}/llms.txt`, PAGE_TIMEOUT_MS)).text(),
    ),
  ]);
  if (sitemap.status === "down" && llms.status === "down") {
    return { source: "agent.reviews", status: "down", note: sitemap.note, candidates: [] };
  }
  const hitsIn = (text: string) => {
    const words = text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    return keywords.filter((keyword) => words.some((word) => wordsMatch(word, keyword))).length;
  };
  const bySlug =
    sitemap.status === "down"
      ? []
      : sitemap.value
          .map((pagePath) => ({ pagePath, hits: hitsIn(pagePath.replace(/[/-]/g, " ")) }))
          .filter((entry) => entry.hits > 0)
          .sort((a, b) => b.hits - a.hits)
          .slice(0, 3);
  const slugPages = await Promise.all(
    bySlug.map(async ({ pagePath }) => {
      const page = await fetchAgentReviewsPage(ctx, pagePath);
      if (!page) return undefined;
      const candidate: HubCandidate = {
        source: "agent.reviews",
        id: pagePath,
        title: page.title,
        description: page.description,
        url: `${AGENT_REVIEWS_URL}${pagePath}`,
        notInstallable:
          "agent.reviews rates products and libraries, not MCP servers the hub can run",
        requiredSecrets: [],
      };
      if (page.rating) candidate.rating = page.rating;
      return candidate;
    }),
  );
  const category =
    llms.status === "down"
      ? undefined
      : parseAgentReviewsCategories(llms.value)
          .map((entry) => ({ entry, hits: hitsIn(`${entry.name} ${entry.description}`) }))
          .filter((scored) => scored.hits > 0)
          .sort((a, b) => b.hits - a.hits)[0]?.entry;
  let categoryTools: HubCandidate[] = [];
  if (category) {
    const page = await cached(ctx, `agent.reviews:category:${category.slug}`, 24 * HOUR, async () =>
      (
        await fetchWithTimeout(ctx, `${AGENT_REVIEWS_URL}/${category.slug}.md`, PAGE_TIMEOUT_MS)
      ).text(),
    );
    if (page.status !== "down") {
      categoryTools = parseAgentReviewsCategoryPage(page.value, category.description).slice(0, 5);
    }
  }
  const candidates = new Map<string, HubCandidate>();
  for (const candidate of [...slugPages, ...categoryTools]) {
    if (candidate && !candidates.has(candidate.id)) candidates.set(candidate.id, candidate);
  }
  return {
    source: "agent.reviews",
    status: sitemap.status === "ok" || llms.status === "ok" ? "ok" : "cached",
    candidates: [...candidates.values()],
  };
}

// ---------- nohumans.directory (MCP over plain JSON-RPC) ----------

interface NohumansListing {
  id?: string;
  name?: string;
  description?: string;
  endpoint_url?: string;
  price_amount?: number;
  price_currency?: string;
  paid_verified?: boolean;
}

export async function searchNohumans(ctx: SourceContext, task: string): Promise<SourceResult> {
  const result = await cached(ctx, `nohumans:${task.toLowerCase().trim()}`, 6 * HOUR, async () => {
    const response = await fetchWithTimeout(ctx, NOHUMANS_MCP_URL, PAGE_TIMEOUT_MS, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "find_paid_service", arguments: { need: task } },
      }),
    });
    const raw = await response.text();
    // Streamable HTTP may answer as one SSE event; the JSON-RPC body is its data line.
    const json = raw.trim().startsWith("{")
      ? raw
      : (raw
          .split("\n")
          .find((line) => line.startsWith("data:"))
          ?.slice(5) ?? "{}");
    const body = JSON.parse(json) as {
      result?: { content?: Array<{ type?: string; text?: string }> };
      error?: { message?: string };
    };
    if (body.error) throw new Error(body.error.message ?? "nohumans error");
    const text = body.result?.content?.find((c) => c.type === "text")?.text ?? "{}";
    return ((JSON.parse(text) as { results?: NohumansListing[] }).results ?? []).slice(0, 10);
  });
  if (result.status === "down") {
    return { source: "nohumans", status: "down", note: result.note, candidates: [] };
  }
  return {
    source: "nohumans",
    status: result.status,
    candidates: result.value.map((listing) => ({
      source: "nohumans",
      id: listing.id ?? listing.endpoint_url ?? "unknown",
      title: listing.name ?? "unnamed paid API",
      description: listing.description ?? "",
      url: listing.endpoint_url,
      notInstallable: "a paid x402 API: paying needs a wallet, which the hub does not hold",
      requiredSecrets: [],
      paid: {
        price: listing.price_amount ?? 0,
        currency: listing.price_currency ?? "USDC",
        verified: listing.paid_verified === true,
      },
    })),
  };
}
