// Shared types for the lead-engine pipeline.
// Mirrors the Prisma enums where applicable.

export type ProductType =
  | "b2b_saas"
  | "consumer_extension"
  | "developer_tool"
  | "consumer_app"
  | "marketplace";

export type Platform = "reddit" | "linkedin" | "twitter";

export type LeadType =
  | "hot"
  | "warm"
  | "possible"
  | "unlikely"
  | "not_a_lead";

export type ReplyOpportunity = "comment" | "dm" | "both" | "none";

export interface ProductIntelligence {
  productName:    string;
  productType:    ProductType;
  category:       string;
  problem:        string;
  audience:       string;
  pains:          string[];
  alternatives:   string[];
  triggers:       string[];
  searchPhrases:  string[];
}

/**
 * Per-platform Google `site:` query bundle.
 * - redditSubreddit is a map: subreddit name → queries to run inside that sub
 * - Other platforms are flat arrays of queries to run with `site:` prefix
 * - For consumer_extension / consumer_app, linkedin will be []
 *
 * Even though v1 only fans out Reddit + LinkedIn, we keep twitter/producthunt/
 * indiehackers in the type for forward compatibility — Step 2 just ignores them.
 */
export interface QueryBundle {
  redditGlobal:    string[];
  redditSubreddit: Record<string, string[]>;
  linkedin:        string[];
  twitter:         string[];
  producthunt:     string[];
  indiehackers:    string[];
}

export interface KeywordEngineResult {
  intelligence: ProductIntelligence;
  queries:      QueryBundle;
}

// ── Step 2 (Google Search) types ────────────────────────────────────────────

/**
 * One Google result, parsed and platform-tagged. Multiple queries can return
 * the same URL — Step 2 dedupes across all queries, keeping the first hit.
 */
export interface GoogleResult {
  title:      string;
  link:       string;
  snippet:    string;
  date?:      string;        // sometimes provided by Google (e.g. "3 days ago")
  position:   number;        // result position from THIS query (1-based)
  query:      string;        // the full site: query that found it
  platform:   Platform;      // parsed from URL
  subreddit?: string;        // extracted from Reddit URL path
}

/**
 * Optional config for the search step.
 * - timeFilter: passes through Serper's `tbs` param. `null` = no filter.
 *   Common values: "qdr:y" (last year), "qdr:d" (last 24h), "qdr:d7" (last week)
 * - resultsPerQuery: how many Google results per query (Serper default = 10)
 * - concurrency: how many queries to run in parallel
 * - platforms: which platforms to actually search. v1 = reddit + linkedin only.
 */
export interface GoogleSearchOptions {
  timeFilter?:      string | null;
  resultsPerQuery?: number;
  concurrency?:     number;
  platforms?:       Platform[];
}

export interface GoogleSearchResult {
  results:        GoogleResult[];        // deduped, platform-tagged
  totalRaw:       number;                // total before dedup
  totalAfterDedup: number;
  queriesExecuted: number;
  errors:         Array<{ query: string; error: string }>;
}

// ── Step 3 (Pre-Score) types ────────────────────────────────────────────────

/** A GoogleResult enriched with a snippet-based preScore (0-100). */
export interface PreScoredResult extends GoogleResult {
  preScore: number;
}

export interface PreScoreOptions {
  /** How many results per GPT batch (default 12). */
  batchSize?:   number;
  /** Parallel batch calls (default 5). */
  concurrency?: number;
  /** Drop everything with preScore < threshold from `passing` (default 30). */
  threshold?:   number;
}

export interface PreScoreOutcome {
  /** Every result with a preScore set (including those below threshold). */
  scored:       PreScoredResult[];
  /** Only results that passed the threshold. Feeds into Step 4. */
  passing:      PreScoredResult[];
  /** GPT batch call count (for cost tracking). */
  totalCalls:   number;
  errors:       Array<{ batchIndex: number; error: string }>;
}

// ── Step 4 (Content Fetch) types ────────────────────────────────────────────

/**
 * Full post content normalized across platforms.
 * Step 4 maps each platform's raw API response into this shape.
 */
export interface RawLead {
  url:               string;
  platform:          Platform;
  subreddit?:        string;
  title:             string;
  content:           string;
  author:            string | null;
  authorProfileUrl?: string;
  postScore:         number;
  commentCount:      number;
  postedAt:          Date | null;
  topComments:       string[];      // up to 5 top comments for context
  // Carry-through from prior steps (for audit + display)
  preScore:          number;
  googleSnippet:     string;
  querySource:       string;
}

// ── Step 5 (Deep Score) types ───────────────────────────────────────────────

export interface ScoredLead extends RawLead {
  intentScore:        number;             // 0-100
  leadType:           LeadType;
  reasoning:          string;
  replyOpportunity:   ReplyOpportunity;
  suggestedAngle:     string;
  /** Author is showcasing a competing tool, not buying. OP isn't a lead but
   *  commenters in the thread might be — surfaced separately in UI. */
  isCompetitorThread: boolean;
}

// ── Step 4+5 combined: process-lead worker ──────────────────────────────────

export interface ProcessLeadOptions {
  /** Concurrent in-flight calls when running many. Default 3 (ScrapeCreators rate-friendly). */
  concurrency?: number;
}

export interface ProcessLeadOutcome {
  /** Leads that successfully fetched + scored. */
  leads:    ScoredLead[];
  /** URLs that failed during fetch or scoring. */
  failures: Array<{ url: string; stage: "fetch" | "score"; error: string }>;
}

// ── Step 6 (Reply Generation) types ─────────────────────────────────────────

export interface ReplyGenInput {
  lead:          ScoredLead;
  intelligence:  ProductIntelligence;
  /** Optional — product URL/landing page, for natural link mentions. */
  productUrl?:   string;
}

/**
 * The AI may decide a genuine reply isn't possible (e.g. nothing useful to add,
 * thread already saturated). In that case `replyPossible: false` and reply is empty.
 */
export interface ReplyGenOutput {
  replyPossible:        boolean;
  reply:                string;
  replyType:            "comment" | "dm";
  confidenceNote:       string;     // any concern about how this will land
}

export interface ReplyGenOptions {
  /** Concurrent reply-gen calls. Default 5. */
  concurrency?: number;
  /** Minimum intent score to bother generating a reply for. Default 60. */
  threshold?:   number;
}

export interface ReplyGenOutcome {
  /** Lead URL → reply output (only for leads above threshold). */
  replies:  Array<{ url: string; output: ReplyGenOutput }>;
  /** Leads skipped because score was below threshold. */
  skipped:  number;
  failures: Array<{ url: string; error: string }>;
}
