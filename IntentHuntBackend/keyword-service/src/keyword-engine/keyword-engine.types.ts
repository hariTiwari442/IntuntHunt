export interface ProductIntelligence {
  productName:  string;
  category:     string;
  problem:      string;
  audience:     string;
  pains:        string[];
  alternatives: string[];
  triggers:     string[];
}

export interface PlatformQueries {
  redditGlobal:    string[];   // Keywords for global Reddit search (1 API hit each)
  redditSubreddit: string[];   // Keywords to search inside specific subreddits
  hackernews:      string[];
  linkedin:        string[];   // Keywords for LinkedIn post search via Apify (2 max)
}

export interface KeywordEngineResult {
  intelligence: ProductIntelligence;
  queries:      PlatformQueries;
  subreddits:   string[];
}
