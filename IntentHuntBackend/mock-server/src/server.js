import express from 'express';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

// ── Load fixtures ─────────────────────────────────────────
const redditPosts   = JSON.parse(readFileSync(join(__dirname, 'fixtures/reddit-posts.json'), 'utf8'));
const hnPosts       = JSON.parse(readFileSync(join(__dirname, 'fixtures/hn-posts.json'), 'utf8'));
const linkedinPosts = JSON.parse(readFileSync(join(__dirname, 'fixtures/linkedin-posts.json'), 'utf8'));
const intelligence  = JSON.parse(readFileSync(join(__dirname, 'fixtures/openai-intelligence.json'), 'utf8'));

// ── Helpers ───────────────────────────────────────────────
function randomId() {
  return 'mock-' + Math.random().toString(36).slice(2, 10);
}

function pickRandom(arr, count) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, arr.length));
}

const STRATEGIES = [
  'Reply to the post',
  'Join the discussion',
  'Target the commenters',
  'Share as a resource',
  'DM the author',
];

// ── OpenAI Mock (/v1/chat/completions) ────────────────────
app.post('/v1/chat/completions', (req, res) => {
  const prompt = req.body?.messages?.find(m => m.role === 'user')?.content ?? '';

  let responseContent;

  // Keyword generation — intelligence extraction
  if (prompt.includes('productName') && prompt.includes('category') && prompt.includes('pains')) {
    // Return product intelligence with dynamic name from prompt
    const descMatch = prompt.match(/Product description:\n(.+)/s);
    const desc = descMatch?.[1]?.trim() ?? 'Unknown Product';
    responseContent = JSON.stringify({
      ...intelligence,
      productName: desc.split(' ').slice(0, 3).join(' '),
    });
  }
  // Keyword generation — queries
  else if (prompt.includes('redditGlobal') && prompt.includes('redditSubreddit') && prompt.includes('hackernews')) {
    responseContent = JSON.stringify({
      redditGlobal:    ['cold email tool', 'email outreach platform', 'Apollo alternative', 'Lemlist alternative', 'need outreach tool', 'cold email software'],
      redditSubreddit: ['email outreach', 'cold email', 'Apollo', 'Instantly'],
      hackernews:      ['cold email', 'email outreach startup', 'Apollo', 'Lemlist', 'outbound sales tool'],
      linkedin:        ['looking for email outreach tool', 'switched from apollo'],
    });
  }
  // Keyword generation — subreddits
  else if (prompt.includes('subreddits') && prompt.includes('r/ prefix')) {
    responseContent = JSON.stringify({
      subreddits: ['sales', 'SaaS', 'entrepreneur', 'startups', 'marketing', 'coldoutreach'],
    });
  }
  // Intent scoring
  else if (prompt.includes('BUYING INTENT') && prompt.includes('SCORE each post')) {
    const postsMatch = prompt.match(/Posts:\n([\s\S]+)\n\nReturn exactly/);
    let postCount = 8;
    try {
      const items = JSON.parse(postsMatch?.[1] ?? '[]');
      postCount = items.length;
    } catch {}

    const results = Array.from({ length: postCount }, () => ({
      score: Math.floor(Math.random() * 60) + 40,  // 40-100 range
      strategy: STRATEGIES[Math.floor(Math.random() * STRATEGIES.length)],
    }));
    // Make a few high-intent
    if (results.length > 0) results[0].score = 92;
    if (results.length > 1) results[1].score = 88;
    if (results.length > 2) results[2].score = 45;

    responseContent = JSON.stringify({ results });
  }
  // Reply generation
  else if (prompt.includes('SUGGESTED REPLY') && prompt.includes('non-spammy')) {
    const postsMatch = prompt.match(/Posts:\n([\s\S]+)\n\nReturn exactly/);
    let postCount = 2;
    try {
      const items = JSON.parse(postsMatch?.[1] ?? '[]');
      postCount = items.length;
    } catch {}

    const replies = [
      "I had the exact same problem with deliverability last month. What worked for me was rotating sending domains and using a proper warm-up schedule. I've been using MockProduct for this and the built-in warming has been solid.",
      "Totally feel your pain on juggling multiple tools. I consolidated everything into one platform recently and it cut our workflow time in half. MockProduct handles prospecting, sequences, and follow-ups in one place if you want to check it out.",
      "Great question! For a team your size, you probably don't need an enterprise solution. I switched from Outreach to something simpler and our reply rates actually improved. MockProduct has been working well for us — simple but effective.",
      "The new Gmail guidelines are no joke. We had to completely rethink our sending infrastructure. Found that MockProduct's domain rotation and engagement tracking helped us stay compliant without sacrificing volume.",
      "I went through the same evaluation process last quarter. The key differentiator for us was AI personalization that doesn't sound robotic. MockProduct nailed that — every email feels hand-written but takes seconds to generate.",
    ];

    const results = Array.from({ length: postCount }, (_, i) => ({
      reply: replies[i % replies.length],
    }));

    responseContent = JSON.stringify({ results });
  }
  // Fallback
  else {
    responseContent = JSON.stringify({ message: 'Mock response' });
  }

  res.json({
    id: `chatcmpl-${randomId()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: req.body?.model ?? 'gpt-4o-mini',
    choices: [{
      index: 0,
      message: { role: 'assistant', content: responseContent },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  });

  console.log(`[OpenAI] ${prompt.slice(0, 80)}...`);
});

// ── ScrapeCreators Reddit Mock ────────────────────────────

// Global search: GET /v1/reddit/search
app.get('/v1/reddit/search', (req, res) => {
  const query = req.query.query ?? 'unknown';
  const posts = pickRandom(redditPosts.posts, 5).map(p => ({
    ...p,
    id: `${p.id}_${randomId()}`,
    created_utc: Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 86400 * 7),
  }));

  console.log(`[ScrapeCreators] Global search: "${query}" → ${posts.length} posts`);
  res.json({ success: true, posts });
});

// Subreddit search: GET /v1/reddit/subreddit/search
app.get('/v1/reddit/subreddit/search', (req, res) => {
  const query     = req.query.query ?? 'unknown';
  const subreddit = req.query.subreddit ?? 'unknown';
  const posts = pickRandom(redditPosts.posts, 4).map(p => ({
    ...p,
    id: `${p.id}_${randomId()}`,
    subreddit,
    created_utc: Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 86400 * 7),
  }));

  console.log(`[ScrapeCreators] Subreddit search: r/${subreddit} "${query}" → ${posts.length} posts`);
  res.json({ success: true, posts, comments: [] });
});

// ── Algolia HN Mock ───────────────────────────────────────
app.get('/api/v1/search', (req, res) => {
  const query = req.query.query ?? 'unknown';
  const hits = pickRandom(hnPosts.hits, 3).map(h => ({
    ...h,
    objectID: `${h.objectID}_${randomId()}`,
    created_at: new Date(Date.now() - Math.random() * 86400000 * 7).toISOString(),
  }));

  console.log(`[HN Algolia] Search: "${query}" → ${hits.length} hits`);
  res.json({ ...hnPosts, hits, nbHits: hits.length });
});

// ── Apify Mock ────────────────────────────────────────────

// Start actor run: POST /v2/acts/:actorId/runs
app.post('/v2/acts/:actorId/runs', (req, res) => {
  const runId    = randomId();
  const datasetId = `dataset-${randomId()}`;
  const keyword  = req.body?.keyword ?? 'unknown';

  console.log(`[Apify] Actor run started for keyword: "${keyword}" → run=${runId}, dataset=${datasetId}`);
  res.status(201).json({
    id: runId,
    actId: req.params.actorId,
    status: 'SUCCEEDED',
    defaultDatasetId: datasetId,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  });
});

// Get dataset items: GET /v2/datasets/:datasetId/items
app.get('/v2/datasets/:datasetId/items', (req, res) => {
  const posts = pickRandom(linkedinPosts, 4).map(p => ({
    ...p,
    activity_id: `${p.activity_id}_${randomId()}`,
    posted_at: {
      ...p.posted_at,
      date: new Date(Date.now() - Math.random() * 86400000 * 5).toISOString().replace('T', ' ').slice(0, 19),
      timestamp: Date.now() - Math.floor(Math.random() * 86400000 * 5),
    },
  }));

  console.log(`[Apify] Dataset ${req.params.datasetId} → ${posts.length} LinkedIn posts`);
  res.json(posts);
});

// ── Health check ──────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'mock-server' });
});

// ── Start ─────────────────────────────────────────────────
const PORT = process.env.PORT || 3333;
app.listen(PORT, () => {
  console.log(`\n=== Mock Server running on http://localhost:${PORT} ===`);
  console.log('Mocking: OpenAI, ScrapeCreators, Algolia HN, Apify\n');
});
