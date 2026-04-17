import type { JobStatus, SourceType, TaskStatus } from './job.types.js';

// ---- POST /api/v1/jobs ----

export interface CreateJobRequest {
  queries: {
    redditGlobal:    string[];
    redditSubreddit: string[];
    hackernews:      string[];
  };
  subreddits: string[];
}

export interface CreateJobResponse {
  jobId:     string;
  status:    JobStatus;
  taskCount: number;
  createdAt: string;
}

// ---- GET /api/v1/jobs/:jobId ----

export interface JobDetailResponse {
  jobId:        string;
  userId:       string;
  keywords:     string[];
  sources:      SourceType[];
  status:       JobStatus;
  createdAt:    string;
  startedAt:    string | null;
  completedAt:  string | null;
  errorMessage: string | null;
  metadata:     Record<string, unknown>;
  progress: {
    total:     number;
    pending:   number;
    running:   number;
    completed: number;
    failed:    number;
    dead:      number;
  };
  resultCount: number;
}

// ---- GET /api/v1/jobs ----

export interface ListJobsQuery {
  userId:  string;
  status?: JobStatus;
  page?:   number;
  limit?:  number;
}

export interface ListJobsResponse {
  jobs:  JobSummary[];
  total: number;
  page:  number;
  limit: number;
}

export interface JobSummary {
  jobId:       string;
  keywords:    string[];
  sources:     SourceType[];
  status:      JobStatus;
  createdAt:   string;
  resultCount: number;
  taskCount:   number;
}

// ---- DELETE /api/v1/jobs/:jobId ----

export interface CancelJobResponse {
  jobId:  string;
  status: 'cancelled';
}

// ---- GET /api/v1/posts ----

export interface ListPostsQuery {
  jobId?:          string | undefined;
  source?:         SourceType | undefined;
  keyword?:        string | undefined;
  minIntentScore?: number | undefined;
  page?:           number | undefined;
  limit?:          number | undefined;
  sortBy?:         'intent_score' | 'posted_at' | 'score' | undefined;
  sortDir?:        'asc' | 'desc' | undefined;
}

export interface ListPostsResponse {
  posts: PostSummary[];
  total: number;
  page:  number;
  limit: number;
}

export interface PostSummary {
  id:           string;
  jobId:        string;
  source:       SourceType;
  keyword:      string;
  title:        string;
  content:      string | null;
  author:       string | null;
  url:          string | null;
  score:        number | null;
  commentCount: number | null;
  subreddit:    string | null;
  postedAt:     string | null;
  fetchedAt:    string;
  intentScore:    number | null;
  suggestedReply: string | null;
  strategy:       string | null;
}

// ---- Standard error response ----

export interface ApiError {
  statusCode: number;
  error:      string;
  message:    string;
  requestId:  string;
}
