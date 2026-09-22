/**
 * Local mock for every paid third-party API the pipeline calls.
 *
 * Point the service at this with `.env.mock` (see npm run api:mock /
 * worker:mock) and a full scan costs nothing — no Serper queries, no
 * ScrapeCreators credits, no OpenAI spend.
 *
 * IMPORTANT: the OpenAI branches below key off distinctive phrases in the
 * real prompts. If you edit a prompt in crawler-service/src/pipeline/, check
 * the matching marker here still hits — otherwise the call silently falls
 * through to the generic response and fails Zod validation downstream. The
 * markers are deliberately chosen from headings that are unlikely to be
 * reworded casually.
 */

import express from 'express';

const app = express();
app.use(express.json({ limit: '5mb' }));

const PORT = process.env.PORT ?? 3333;

// ── Helpers ─────────────────────────────────────────────────────────────────

const randomId = () => 'mock-' + Math.random().toString(36).slice(2, 10);
const pick = (arr, i) => arr[i % arr.length];

function log(area, detail) {
  console.log(`[mock] ${area}${detail ? ' — ' + detail : ''}`);
}

// ── Fixture content ─────────────────────────────────────────────────────────
// Deliberately varied: a couple of obvious buyers, a vendor ad (so competitor
// detection has something to catch), and some noise. That makes a mock run
// exercise the same branches a real one does.

const MOCK_POSTS = [
  {
    title: 'What do you use to get business cards into your CRM?',
    body: "Just got back from a trade show with about 200 cards. Last year I typed them all in by hand and it took a full weekend. There has to be something better — what are people actually using? Budget isn't a huge deal, I just want it to be accurate.",
    subreddit: 'sales',
    author: 'mock_buyer_1',
  },
  {
    title: 'Tired of manually entering contact details after every event',
    body: "Every conference I come back with a stack of cards and they just sit on my desk. By the time I get round to them the conversation has gone cold. Looking for something that scans and syncs straight to HubSpot.",
    subreddit: 'smallbusiness',
    author: 'mock_buyer_2',
  },
  {
    title: "We're excited to announce our brand new card scanner",
    body: "Introducing our new app! It's the fastest and most accurate card scanner available anywhere — perfect for conferences, networking events, or finally tackling that pile of cards on your desk. Available now on iOS and Android.",
    subreddit: 'startups',
    author: 'mock_vendor',
  },
  {
    title: 'Best practices for trade show booth design?',
    body: "Planning our first booth next quarter. Looking for advice on layout, signage and giveaways that actually get people to stop and talk.",
    subreddit: 'marketing',
    author: 'mock_noise_1',
  },
  {
    title: 'Anyone found a good CamCard alternative?',
    body: "CamCard just raised their prices and the OCR has been getting worse on non-standard layouts. Looking for something that handles odd card designs and exports cleanly. What's everyone switched to?",
    subreddit: 'sales',
    author: 'mock_buyer_3',
  },
];

// ── OpenAI (/v1/chat/completions) ───────────────────────────────────────────

app.post('/v1/chat/completions', (req, res) => {
  const prompt = req.body?.messages?.find((m) => m.role === 'user')?.content ?? '';
  let content;

  // Step 1 — keyword engine
  if (prompt.includes('lead-finding bundle') || prompt.includes('PRODUCT-TYPE CLASSIFICATION')) {
    log('openai', 'step 1 keyword engine');
    const descMatch = prompt.match(/PRODUCT DESCRIPTION:\s*\n([\s\S]*?)\n\n/);
    const desc = (descMatch?.[1] ?? 'Mock Product').trim();
    const name = desc.split(/[.\n]/)[0].split(' ').slice(0, 3).join(' ') || 'Mock Product';

    content = JSON.stringify({
      intelligence: {
        productName:   name,
        productType:   'b2b_saas',
        category:      'business card scanning tool',
        problem:       'I need to digitise business cards from events without typing them in',
        audience:      'Sales reps and founders who collect cards at trade shows',
        pains: [
          'Manually typing contact details is slow and error-prone',
          'Cards pile up after every event and never get followed up',
          'Current scanner app does not sync with my CRM',
          'OCR accuracy is poor on non-standard card layouts',
          'Leads go cold before they are entered anywhere',
        ],
        alternatives:  ['CamCard', 'ScanBizCards', 'ABBYY Business Card Reader', 'Sansan'],
        triggers: [
          'Just got back from a trade show with a stack of cards',
          'Current scanning app raised prices',
          'Moving the team onto a new CRM',
        ],
        searchPhrases: [
          'business card scanner app',
          'scan business cards to CRM',
          'CamCard alternative',
          'digitise business cards',
          'business card OCR',
        ],
      },
      queries: {
        redditGlobal:    ['business card scanner', 'CamCard alternative', 'scan cards to CRM'],
        redditSubreddit: { sales: ['business card scanner'], smallbusiness: ['digitise business cards'] },
        linkedin:        ['trade show business cards', 'digitize business cards'],
        twitter:         ['business card scanner app'],
        producthunt:     ['business card scanner'],
        indiehackers:    [],
      },
    });
  }

  // Step 3 — pre-score (batch of search results)
  else if (prompt.includes('SCORING RUBRIC') || prompt.includes('POSTS TO SCORE')) {
    log('openai', 'step 3 pre-score');
    const indices = [...prompt.matchAll(/^\[(\d+)\]/gm)].map((m) => Number(m[1]));
    const results = (indices.length ? indices : [0]).map((index, i) => ({
      index,
      // Spread across the threshold so some survive and some are filtered,
      // exercising both paths.
      score: [85, 70, 55, 25, 60][i % 5],
    }));
    content = JSON.stringify({ results });
  }

  // Step 5 — deep score (single post)
  else if (prompt.includes('COMPETITOR / BUILDER CHECK')) {
    log('openai', 'step 5 deep score');
    const body = (prompt.match(/- Post body: ([\s\S]*?)\n- Score:/)?.[1] ?? '').toLowerCase();

    // Honour the real Signal C so mock runs still produce competitor rows.
    const isVendor =
      body.includes("we're excited to announce") ||
      body.includes('introducing our') ||
      body.includes('available now on');

    const isStrongBuyer =
      body.includes('what are people actually using') ||
      body.includes('looking for something') ||
      body.includes("what's everyone switched to");

    content = JSON.stringify(
      isVendor
        ? {
            intentScore:        5,
            leadType:           'not_a_lead',
            reasoning:          'Corporate announcement of a competing product, not a buyer.',
            replyOpportunity:   'none',
            suggestedAngle:     '',
            isCompetitorThread: true,
          }
        : {
            intentScore:        isStrongBuyer ? 85 : 62,
            leadType:           isStrongBuyer ? 'hot' : 'warm',
            reasoning:          isStrongBuyer
              ? 'Author is explicitly asking for a tool in this exact category.'
              : 'Author describes the pain this product solves but has not asked for a tool.',
            replyOpportunity:   'comment',
            suggestedAngle:     'Share how the product handles this, alongside one alternative.',
            isCompetitorThread: false,
          },
    );
  }

  // Step 6 — reply generation
  else if (prompt.includes('PLATFORM RULES') || prompt.includes('replyPossible')) {
    log('openai', 'step 6 reply gen');
    content = JSON.stringify({
      replyPossible:  true,
      reply:          "Had the same pile-of-cards problem after our last conference. What finally worked was scanning them on the spot rather than saving it for later — the OCR ones that sync straight to a CRM save the retyping entirely. Happy to share what we compared if useful.",
      replyType:      'comment',
      confidenceNote: 'Mock reply — generic but on-topic.',
    });
  }

  else {
    log('openai', 'UNMATCHED PROMPT — check markers in mock-server/src/server.js');
    content = JSON.stringify({ message: 'Mock response' });
  }

  res.json({
    id:      `chatcmpl-${randomId()}`,
    object:  'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model:   req.body?.model ?? 'gpt-4o-mini',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage:   { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 },
  });
});

// ── Serper (Google search) ──────────────────────────────────────────────────
// serper.ts posts to SERPER_BASE_URL directly, so this handles the root path.

function serperHandler(req, res) {
  const q = req.body?.q ?? '';
  log('serper', q.slice(0, 60));

  // Derive the platform from the site: operator so each platform's fetcher
  // gets exercised.
  const platform = q.includes('linkedin.com') ? 'linkedin' : q.includes('x.com') || q.includes('twitter.com') ? 'twitter' : 'reddit';

  const organic = MOCK_POSTS.map((p, i) => {
    const link =
      platform === 'linkedin'
        ? `https://www.linkedin.com/posts/mock-${i}-activity-${1000000 + i}-abcd`
        : platform === 'twitter'
          ? `https://x.com/mockuser/status/${1900000000000 + i}`
          : `https://www.reddit.com/r/${p.subreddit}/comments/mock${i}/${p.title.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40)}/`;

    return {
      title:    p.title,
      link,
      snippet:  p.body.slice(0, 160),
      position: i + 1,
    };
  });

  res.json({ organic });
}

app.post('/search', serperHandler);
app.post('/', serperHandler);

// ── ScrapeCreators ──────────────────────────────────────────────────────────

/** Map a mock URL back to its fixture, so content is consistent per URL. */
function fixtureFor(url = '') {
  const m = url.match(/mock[-/]?(\d+)/) ?? url.match(/status\/19000000000(\d+)/);
  const idx = m ? Number(m[1]) : 0;
  return pick(MOCK_POSTS, isNaN(idx) ? 0 : idx);
}

app.get('/v1/reddit/post/comments', (req, res) => {
  const p = fixtureFor(req.query.url);
  log('scrapecreators', `reddit ${String(req.query.url).slice(0, 60)}`);
  res.json({
    post: {
      id:           randomId(),
      title:        p.title,
      selftext:     p.body,
      author:       p.author,
      subreddit:    p.subreddit,
      score:        42,
      ups:          42,
      num_comments: 3,
      created_utc:  Math.floor(Date.now() / 1000) - 3600,
      url:          req.query.url,
    },
    comments: [
      { body: 'We switched last year and it cut the admin time massively.', author: 'mock_c1', score: 12 },
      { body: 'Depends how odd your card layouts are — OCR still struggles with some.', author: 'mock_c2', score: 7 },
      { body: 'Following, same problem here.', author: 'mock_c3', score: 2 },
    ],
  });
});

app.get('/v1/linkedin/post', (req, res) => {
  const p = fixtureFor(req.query.url);
  log('scrapecreators', `linkedin ${String(req.query.url).slice(0, 60)}`);
  // Mirrors the real response: body lives in `description`, NOT `post.text`.
  res.json({
    success:       true,
    url:           req.query.url,
    datePublished: new Date(Date.now() - 86400000).toISOString(),
    description:   `${p.title}\n\n${p.body}`,
    author:        { name: p.author, url: `https://linkedin.com/in/${p.author}` },
    likeCount:     18,
    commentCount:  4,
    comments:      [{ text: 'This is exactly the problem we had at our last expo.' }],
  });
});

app.get('/v1/twitter/tweet', (req, res) => {
  const p = fixtureFor(req.query.url);
  log('scrapecreators', `twitter ${String(req.query.url).slice(0, 60)}`);
  res.json({
    success: true,
    rest_id: randomId(),
    legacy: {
      full_text:      `${p.title} ${p.body}`.slice(0, 280),
      created_at:     new Date(Date.now() - 7200000).toUTCString(),
      favorite_count: 9,
      reply_count:    2,
      retweet_count:  1,
      quote_count:    0,
    },
  });
});

// ── Apify (website content crawler) ─────────────────────────────────────────

app.post('/v2/acts/:actorId/runs', (req, res) => {
  log('apify', `run ${req.params.actorId}`);
  res.json({ data: { id: randomId(), status: 'SUCCEEDED', defaultDatasetId: 'mock-dataset' } });
});

app.get('/v2/datasets/:datasetId/items', (req, res) => {
  log('apify', 'dataset items');
  res.json([
    {
      text: 'Mock Product — the fastest way to turn business cards into CRM contacts. Scan a card, get a clean contact, follow up before the lead goes cold.',
      metadata: { title: 'Mock Product', description: 'Turn business cards into CRM contacts instantly.' },
    },
  ]);
});

// ── Health ──────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'mock-server' }));

app.listen(PORT, () => {
  console.log(`[mock] listening on http://localhost:${PORT}`);
  console.log('[mock] mocking: OpenAI, Serper, ScrapeCreators (reddit/linkedin/twitter), Apify');
});
