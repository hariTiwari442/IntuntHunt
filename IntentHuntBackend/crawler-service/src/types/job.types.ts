// ---- Domain Enums ----

export type JobStatus  = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'dead';
export type SourceType = 'reddit' | 'hackernews' | 'linkedin';

// ---- BullMQ Queue Names ----

export const QueueName = {
  ORCHESTRATE:  'crawler-orchestrate',
  REDDIT:       'crawler-reddit',
  HN:           'crawler-hn',
  LINKEDIN:     'crawler-linkedin',
  POST_PROCESS: 'crawler-postprocess',
  DLQ:          'crawler-dlq',
} as const;

export type QueueName = (typeof QueueName)[keyof typeof QueueName];

// ---- BullMQ Job Payloads ----

/** Enqueued when a CrawlJob is created — orchestrator fans it out into tasks */
export interface JobCreatedPayload {
  crawlJobId:        string;
  userId:            string;
  redditGlobal:      string[];   // keywords for global Reddit search (1 API hit each)
  redditSubreddit:   string[];   // keywords to search inside specific subreddits
  hackernews:        string[];   // keywords for HN search (free)
  linkedin:          string[];   // keywords for LinkedIn post search via Apify
  subreddits:        string[];   // subreddits to scope redditSubreddit keywords into
}

/** One unit of work: crawl a single keyword from a single source */
export interface CrawlTaskPayload {
  crawlJobId:  string;
  crawlTaskId: string;
  userId:      string;
  keyword:     string;
  source:      SourceType;
  subreddit:   string | null;  // null = global search, string = scoped to this subreddit
  attempt:     number;
}

/** Enqueued after a task fetches posts — triggers dedup, storage, and completion check */
export interface PostProcessPayload {
  crawlJobId:  string;
  crawlTaskId: string;
  postIds:     string[];
}

/** Written to DLQ when a task exhausts all retry attempts */
export interface DLQPayload {
  originalQueue:   QueueName;
  originalPayload: CrawlTaskPayload;
  failedAt:        string;  // ISO timestamp
  finalError:      string;
  totalAttempts:   number;
}
