import type { SourceType } from './job.types.js';

// ---- Raw Reddit API response shapes (legacy — kept for reference) ----

export interface RedditSearchResponse {
  data: {
    children: Array<{ data: RedditPost }>;
    after:    string | null;
  };
}

export interface RedditPost {
  id:           string;
  title:        string;
  selftext:     string;
  author:       string;
  subreddit:    string;
  score:        number;
  num_comments: number;
  permalink:    string;
  url:          string;
  created_utc:  number;
  is_self:      boolean;
}

// ---- ScrapeCreators Reddit response shapes ----

export interface SCRedditSearchResponse {
  success: boolean;
  posts:   SCRedditPost[];
  after?:  string;
}

export interface SCRedditPost {
  id:            string;
  title:         string;
  author:        string;
  subreddit:     string;
  ups:           number;
  num_comments:  number;
  created_utc:   number;
  url:           string;
  selftext?:     string;
  permalink?:    string;
  is_self?:      boolean;
  score?:        number;
  upvote_ratio?: number;
}

// ---- ScrapeCreators Reddit Subreddit Search response ----

export interface SCSubredditSearchResponse {
  success:  boolean;
  posts:    SCSubredditSearchPost[];
  comments: SCSubredditSearchComment[];
  cursor?:  string;
}

export interface SCSubredditSearchPost {
  title:         string;
  url:           string;
  ups:           number;
  num_comments:  number;
  created_utc:   number;
  subreddit:     string;
  author?:       string;
  selftext?:     string;
  id?:           string;
}

export interface SCSubredditSearchComment {
  author:  string;
  body:    string;
  ups:     number;
  post_title?: string;
}

// ---- Raw HN Algolia API response shapes ----

export interface HNSearchResponse {
  hits:        HNHit[];
  nbHits:      number;
  page:        number;
  nbPages:     number;
  hitsPerPage: number;
}

export interface HNHit {
  objectID:     string;
  title:        string;
  story_text:   string | null;
  author:       string;
  points:       number;
  num_comments: number;
  url:          string | null;
  created_at:   string;
  _tags:        string[];
}

// ---- Normalized post — source-agnostic, written to DB ----

export interface NormalizedPost {
  source:       SourceType;
  externalId:   string;
  keyword:      string;
  title:        string;
  content:      string | null;
  author:       string | null;
  url:          string | null;
  score:        number | null;
  commentCount: number | null;
  subreddit:    string | null;
  postedAt:     Date | null;
  rawData:         Record<string, unknown>;
  intentScore?:    number;
  suggestedReply?: string | null;
  strategy?:       string | null;
}
