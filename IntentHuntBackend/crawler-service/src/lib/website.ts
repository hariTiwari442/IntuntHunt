/**
 * Website content extractor — turns a product URL into the descriptive text
 * that Step 1 (keyword engine) normally gets from a hand-typed description.
 *
 * Two-tier by design:
 *   1. Plain fetch + HTML strip. Free, ~1s, and enough for most marketing
 *      sites, which are server-rendered.
 *   2. Apify's website-content-crawler, only if tier 1 comes back too thin
 *      (a JS-rendered SPA serves an near-empty shell to a plain GET).
 *
 * Tier 2 costs money and takes ~15-30s, so it must stay the exception —
 * `source` on the result says which one produced the text.
 *
 * What we extract is deliberately ordered by signal density: <title> and the
 * meta description are a product's own one-line pitch, which is far closer to
 * a useful product description than body copy is. Headings come next, body
 * text last.
 */

import { request } from "undici";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ lib: "website" });

/** Below this many characters we assume the plain fetch failed to see the real page. */
const THIN_CONTENT_THRESHOLD = 300;

/** Hard cap on what we keep — the keyword engine only reads the first few thousand chars. */
const MAX_TEXT_LENGTH = 8_000;

/** Don't download an entire CDN asset by accident. */
const MAX_HTML_BYTES = 2_000_000;

const FETCH_TIMEOUT_MS = 12_000;

// Some sites 403 a bare programmatic request. Presenting as a normal browser
// is the difference between getting the page and getting a block page.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

export interface WebsiteContent {
  url:      string;
  title:    string;
  text:     string;
  /** Which tier produced this — useful for cost tracking and debugging. */
  source:   "direct" | "apify";
}

export class WebsiteFetchError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    /**
     * True when the host itself couldn't be reached (DNS failure, refused
     * connection, timeout) as opposed to the server answering with something
     * unusable. Unreachable means the Apify fallback is pointless — it would
     * spend money failing the same way — so we stop instead.
     */
    public readonly unreachable = false,
  ) {
    super(message);
    this.name = "WebsiteFetchError";
  }
}

/** Node/undici surface DNS + connection problems as `cause.code`. */
const UNREACHABLE_CODES = new Set([
  "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET",
  "EHOSTUNREACH", "ENETUNREACH", "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "CERT_HAS_EXPIRED",
]);

function isUnreachable(err: unknown): boolean {
  if (err instanceof WebsiteFetchError) return err.unreachable;
  const code =
    (err as { code?: string })?.code ??
    ((err as { cause?: { code?: string } })?.cause?.code);
  return code ? UNREACHABLE_CODES.has(code) : false;
}

// ── HTML → text ─────────────────────────────────────────────────────────────

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘",
  ldquo: "“", rdquo: "”", trade: "™", reg: "®", copy: "©",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

function firstMatch(html: string, re: RegExp): string {
  const m = html.match(re);
  return m?.[1] ? decodeEntities(m[1]).trim() : "";
}

/** Strip tags and collapse whitespace, after removing non-content elements entirely. */
function htmlToText(html: string): string {
  return html
    // Drop these including their contents — none of it is page copy, and
    // inline JSON-LD/script blobs would otherwise dominate the output.
    .replace(/<(script|style|noscript|svg|iframe|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // Block-level boundaries become newlines so sentences don't run together.
    .replace(/<\/(p|div|section|article|h[1-6]|li|tr|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split("\n")
    .map((line) => decodeEntities(line).replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * Compose the extracted page into description-shaped text, highest-signal
 * first. A product's <title> + meta description is usually a better product
 * summary than anything in its body copy.
 */
function composeContent(html: string): { title: string; text: string } {
  const title =
    firstMatch(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
    firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);

  const metaDescription =
    firstMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
    firstMatch(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);

  const headings = [...html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi)]
    .map((m) => htmlToText(m[1] ?? "").replace(/\n/g, " ").trim())
    .filter((h) => h.length > 2 && h.length < 200)
    .slice(0, 12);

  const body = htmlToText(html);

  const parts = [
    title && `${title}`,
    metaDescription && `${metaDescription}`,
    headings.length > 0 && headings.join("\n"),
    body,
  ].filter(Boolean) as string[];

  // Dedupe: title/meta/headings usually reappear verbatim in the body, and
  // repeating them wastes the character budget the keyword engine reads.
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const line of parts.join("\n").split("\n")) {
    const key = line.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(line.trim());
  }

  return { title, text: deduped.join("\n").slice(0, MAX_TEXT_LENGTH) };
}

// ── Tier 1: plain fetch ─────────────────────────────────────────────────────

async function fetchDirect(url: string): Promise<{ title: string; text: string }> {
  const res = await request(url, {
    method:              "GET",
    maxRedirections:     5,
    headersTimeout:      FETCH_TIMEOUT_MS,
    bodyTimeout:         FETCH_TIMEOUT_MS,
    headers: {
      "user-agent":      BROWSER_UA,
      accept:            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
    },
  });

  if (res.statusCode >= 400) {
    res.body.dump().catch(() => {});
    throw new WebsiteFetchError(`HTTP ${res.statusCode}`, url);
  }

  const contentType = String(res.headers["content-type"] ?? "");
  if (contentType && !contentType.includes("html") && !contentType.includes("text")) {
    res.body.dump().catch(() => {});
    throw new WebsiteFetchError(`Not an HTML page (${contentType})`, url);
  }

  // Read with a byte ceiling rather than res.body.text(), so an unexpectedly
  // huge document can't pin memory.
  let html = "";
  let bytes = 0;
  for await (const chunk of res.body) {
    bytes += chunk.length;
    if (bytes > MAX_HTML_BYTES) break;
    html += chunk.toString("utf8");
  }

  return composeContent(html);
}

// ── Tier 2: Apify fallback ──────────────────────────────────────────────────

/**
 * Only reached when the direct fetch returned too little to be a real page —
 * almost always a client-rendered SPA. Runs Apify's website-content-crawler,
 * which executes JS and returns rendered text.
 */
async function fetchViaApify(url: string): Promise<{ title: string; text: string }> {
  const { ApifyClient } = await import("apify-client");
  const client = new ApifyClient({
    token: env.APIFY_API_KEY,
    ...(env.APIFY_BASE_URL ? { baseUrl: env.APIFY_BASE_URL } : {}),
  });

  const run = await client.actor("apify/website-content-crawler").call(
    {
      startUrls:            [{ url }],
      maxCrawlPages:        1,      // the landing page only — we're not indexing their site
      crawlerType:          "playwright:adaptive",
      saveMarkdown:         true,
      proxyConfiguration:   { useApifyProxy: true },
    },
    { waitSecs: 90 },
  );

  const { items } = await client.dataset(run.defaultDatasetId).listItems({ limit: 1 });
  const item = items[0] as { text?: string; markdown?: string; metadata?: { title?: string } } | undefined;

  const text = (item?.text ?? item?.markdown ?? "").slice(0, MAX_TEXT_LENGTH);
  if (!text.trim()) {
    // Visitor-facing wording — "Apify" means nothing to them, and naming our
    // vendors on a public surface is against convention anyway.
    throw new WebsiteFetchError("We couldn't read any content from that page.", url);
  }

  return { title: item?.metadata?.title ?? "", text };
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Normalise user input into a canonical, fetchable URL.
 *
 * This doubles as the cache/identity key for a trial scan, so it has to
 * collapse the ways people write the same product URL — otherwise
 * "covve.com", "https://www.covve.com" and "https://covve.com/" are three
 * separate keys and each one pays for its own pipeline run.
 *
 * Dropping "www." is safe because we follow redirects, so an apex that
 * redirects to www still resolves.
 */
export function normaliseUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new WebsiteFetchError("No URL provided", input);

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new WebsiteFetchError("That doesn't look like a valid URL", input);
  }

  if (!parsed.hostname.includes(".")) {
    throw new WebsiteFetchError("That doesn't look like a valid URL", input);
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const path = parsed.pathname.replace(/\/+$/, "");   // trailing slashes carry no meaning here
  // Query is kept (some product pages need it); the fragment never is.
  return `https://${host}${path}${parsed.search}`;
}

/**
 * Fetch a product/company page and return its descriptive text.
 *
 * @throws WebsiteFetchError when neither tier can produce usable content.
 */
export async function extractWebsiteContent(rawUrl: string): Promise<WebsiteContent> {
  const url = normaliseUrl(rawUrl);

  let direct: { title: string; text: string } | null = null;
  try {
    direct = await fetchDirect(url);
  } catch (err) {
    // The host doesn't exist / won't answer. Apify can't help with that, and
    // trying costs real money, so fail immediately with something the visitor
    // can act on.
    if (isUnreachable(err)) {
      log.warn({ url }, "[website] host unreachable — not falling back to Apify");
      throw new WebsiteFetchError(
        "We couldn't reach that site. Check the address and try again.",
        url,
        true,
      );
    }
    // Answered, but with something we couldn't use (403 bot-block, non-HTML).
    // Apify's proxied browser often gets through where a plain GET doesn't.
    log.warn({ url, err: err instanceof Error ? err.message : err }, "[website] direct fetch failed");
  }

  if (direct && direct.text.length >= THIN_CONTENT_THRESHOLD) {
    log.info({ url, chars: direct.text.length }, "[website] extracted via direct fetch");
    return { url, title: direct.title, text: direct.text, source: "direct" };
  }

  log.info(
    { url, directChars: direct?.text.length ?? 0 },
    "[website] direct fetch too thin — falling back to Apify",
  );

  try {
    const viaApify = await fetchViaApify(url);
    log.info({ url, chars: viaApify.text.length }, "[website] extracted via Apify");
    return {
      url,
      title:  viaApify.title || direct?.title || "",
      text:   viaApify.text,
      source: "apify",
    };
  } catch (err) {
    // If Apify also failed but the direct fetch got *something*, thin content
    // still beats no content — the keyword engine can work with a title and a
    // meta description.
    if (direct && direct.text.trim().length > 0) {
      log.warn({ url }, "[website] Apify failed — falling back to thin direct content");
      return { url, title: direct.title, text: direct.text, source: "direct" };
    }
    throw err instanceof WebsiteFetchError
      ? err
      : new WebsiteFetchError(
          `Could not read that page: ${err instanceof Error ? err.message : String(err)}`,
          url,
        );
  }
}
