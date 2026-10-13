# IntentHunt — Knowledge Transfer

Read this first if you're new to the project — it's the map. For traps,
deployment commands, and "this will bite you if you don't know it," read
**`CLAUDE.md`** at this same root right after. This document describes what
exists and how it fits together; `CLAUDE.md` describes what goes wrong if
you don't know the non-obvious parts.

Domain is **intenthunt.io**. The product was originally built and shipped
under the name **LeadPulse**, then rebranded — a lot of internal naming
(GCP resource names, DB table names, a localStorage key, GitHub repo names)
still says LeadPulse or Paddle (an earlier, since-replaced payment
provider). This is intentional debt, not an oversight — renaming
deployed infrastructure risks real breakage for cosmetic benefit. Don't
"fix" these names.

---

## 1. What the product actually does

A user describes (or pastes a URL for) a product they sell. IntentHunt:

1. Turns that description into a structured understanding of the product —
   who buys it, what pain it solves, who else solves it, what words a real
   buyer would use.
2. Searches Reddit, LinkedIn, and Twitter/X (via Google, not each
   platform's own search) for people who sound like they're in-market.
3. Scores every post it finds, 0–100, for genuine buying intent — not
   topic relevance. A post that *mentions* the category isn't a lead; a
   post from someone *asking for a solution* is.
4. Filters out competitors posting their own product under the guise of a
   buyer (a whole signal-detection problem in its own right — see §6).
5. Drafts a suggested reply for posts that clear the bar.
6. The user works the results from an inbox: save, mark replied, discard,
   add a note.

There's a second entry point: a public **homepage trial**. A visitor pastes
their product's URL with no signup. The site reads the page, shows them a
description to confirm/edit, and — only on their explicit click — runs one
real scan. If they like what they see, signing up "claims" that scan into a
real account; nothing is re-run. See §5.3.

---

## 2. Repository layout — read this before touching anything

**There are two separate git repositories, not one monorepo.** This has
caused real, costly confusion before (see `CLAUDE.md`'s "two git repos"
note) — a commit made from the wrong working directory succeeds silently
and simply never reaches the site that's supposed to run it.

| Path | Git remote | What it is |
|---|---|---|
| `C:\Users\Hari\Desktop\IntentHunt\` (root) | `IntuntHunt.git` | Both backend services, this KT, `CLAUDE.md` |
| `C:\Users\Hari\Desktop\IntentHunt\IntentHuntFrontEnd\` | `IntentHuntFrontEnd.git` | The Next.js frontend — **this is what Netlify builds** |

Inside the root repo:

```
IntentHuntBackend/
  main-backend/       → API gateway: auth, billing, plan limits, proxying
  crawler-service/     → The actual pipeline: search + scoring + the worker
  keyword-service/      → DEAD CODE. Still deployed on Cloud Run, nothing calls it.
```

The frontend repo has two branches that matter: `main` (builds
`intenthunt.io`) and `test` (builds `tst.intenthunt.io`). They should be
kept in sync by fast-forwarding `main` to `test` after verifying changes on
test — not by developing independently on each.

---

## 3. High-level architecture

```
                         ┌─────────────────────────┐
  Browser  ───────────▶ │  IntentHuntFrontEnd      │  Netlify
                         │  (Next.js 14, App Router)│
                         └────────────┬─────────────┘
                                      │ REST (axios), same-origin cookies
                                      ▼
                         ┌─────────────────────────┐
                         │  main-backend             │  Cloud Run
                         │  (Fastify + Prisma)       │  "leadpulse-backend"
                         │  - Supabase auth proxy    │  (+ "-test" replica)
                         │  - Dodo billing/webhooks  │
                         │  - plan enforcement       │
                         │  - gateway/proxy to       │
                         │    crawler-service        │
                         └────────────┬─────────────┘
                                      │ HTTP, shared X-Internal-Key
                                      ▼
                         ┌─────────────────────────┐
                         │  crawler-service API      │  Cloud Run
                         │  (Fastify)                │  "leadpulse-crawler-api"
                         │  - /leads, /products       │
                         │  - /trial/* (homepage flow)│
                         └────────────┬─────────────┘
                                      │ writes rows; worker polls DB, no queue
                                      ▼
                         ┌─────────────────────────┐
                         │  crawler-service worker    │  GCE VM
                         │  (same image, `npm run     │  "leadpulse-worker"
                         │   worker` instead of api)  │
                         │  - orchestrator poller      │
                         │  - process-lead poller      │
                         │  - reply-gen poller         │
                         └────────────┬─────────────┘
                                      │
                    ┌─────────────────┼───────────────────┐
                    ▼                 ▼                    ▼
              OpenAI (gpt-4o /   Serper.dev          ScrapeCreators /
              gpt-4o-mini)       (Google search)      Apify (content fetch)

         All three backend pieces share one Supabase Postgres database
         (via Prisma) and one Supabase Auth instance. There is no message
         queue — an earlier BullMQ/Redis design was replaced by plain DB
         polling (see CLAUDE.md).
```

**Why there's a worker VM instead of everything running in Cloud Run
request handlers:** a full pipeline run (search → fetch → score → reply)
takes minutes and makes dozens of external calls. Cloud Run request handlers
aren't meant to hold a connection open that long. So `POST /find-leads`
just creates a `SearchRun` row and returns immediately; the worker, running
continuously on a cheap always-on VM, notices the new row (polling, not a
push queue) and does the actual work over however long it takes. The
frontend watches progress via Supabase Realtime subscriptions on the
`leads` table, with a polling fallback.

---

## 4. The frontend (`IntentHuntFrontEnd/`)

**Stack:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS v4,
Zustand (auth state), TanStack Query (server state/caching), `lucide-react`
icons, `@supabase/supabase-js` (Realtime only — auth goes through
main-backend, not Supabase's client SDK directly), Zod isn't used here (it's
server-side in both backends).

**Route structure:**

```
src/app/
  page.tsx                    → Marketing homepage (hero, trial funnel, sections)
  (dashboard)/dashboard/       → The real app, behind auth
  auth/                        → login, signup, verify, callback, password reset
  pricing/  features/  under-the-hood/  contact/  privacy/  terms/  refund/
  checkout/success/  checkout/canceled/
  sitemap.ts  robots.ts  icon.tsx  apple-icon.tsx  opengraph-image.tsx
```

**Key components:**

- `components/landing/` — everything on the marketing pages. Notably
  `HeroProductPreview.tsx` (the hero's interactive dashboard mockup — click
  a fixture lead, see the real scoring UI) and `HottestLeadsPreview.tsx`
  (a second interactive mockup further down the page). Both are built from
  hardcoded fixture data, deliberately mirroring the real dashboard's
  components/copy rather than inventing a separate visual language — see
  the comments in those files for why (notably: they do **not** fake-gate
  any feature behind a "book a demo" wall the way some competitor sites do,
  because nothing in the real product is gated that way either).
- `components/dashboard/` — the actual product UI once logged in:
  `LeadList`, `LeadDetail`, `LeadInboxSidebar`, `Sidebar`, etc.
- `components/Logo.tsx` — the one shared brand mark component (see
  `CLAUDE.md` for why this matters: it used to be 13 hand-copied instances).
- `src/config/site.ts` — SEO/brand config, single source for canonical URL,
  title, description, and the `isProductionSite` flag that drives noindex
  behavior on non-prod domains.
- `src/config/plans.ts` / `src/config/leads.ts` — plan feature tables and
  the `HOT_LEAD_SCORE` threshold (80) — **mirrored, not shared, across all
  three codebases**; see CLAUDE.md, this has drifted before.

**Auth model:** Supabase handles the actual identity (email/password,
magic links, OAuth), but the frontend never talks to Supabase for auth
directly — it goes through main-backend's `/auth/*` routes, which proxy to
Supabase server-side and hand back a session the frontend stores via
Zustand (`store/auth.store.ts`, persisted under the `leadpulse-auth` key —
deliberately not renamed, see CLAUDE.md).

**Billing UI:** the pricing page reads `NEXT_PUBLIC_DODO_PRO_MONTHLY_ID` /
`_ANNUAL_ID` from env and posts the chosen one to main-backend's
`/billing/checkout`, which creates a Dodo hosted-checkout session and
redirects there. See §7 for why there are two full sets of these IDs.

---

## 5. main-backend (`IntentHuntBackend/main-backend/`)

**Stack:** Fastify, Prisma (own schema, its own `Profile`/`Product` models —
note `Product` is **duplicated** across main-backend's and crawler-service's
Prisma schemas, both pointing at the same physical `products` table; this
is deliberate so each service only needs the columns it actually uses, not
an accident), Zod for validation, `standardwebhooks` for Dodo's Svix-format
webhook verification, `jsonwebtoken`.

**Role:** the single front door for the frontend. Owns:

1. **Auth** (`auth.routes.ts`, `auth.service.ts`) — signup, login, magic
   link verification, OAuth (Google), password reset. Thin proxy over
   Supabase Auth; the value-add is session handling and keeping Supabase
   credentials server-side.
2. **Profile** (`profile.routes.ts`) — the logged-in user's own record.
3. **Billing** (`billing.routes.ts`, `dodo.client.ts`,
   `dodo-events.handler.ts`) — Dodo Payments checkout session creation and
   webhook handling. `dodo-events.handler.ts` is idempotent against retries
   (tracked in the `paddle_events` table — name kept from the old
   provider). `plan-enforcement.ts` is where "what can this plan see" is
   decided: `visibleLeads`, `visibleSources` (which platforms), per-plan
   product/scan limits.
4. **Contact** (`contact.routes.ts`) — the public contact form. Writes to
   `contact_messages` and nothing else — **no email is sent anywhere by
   this app**, to the user or to you. You have to query the table. See
   CLAUDE.md's "Known open issues."
5. **Gateway** (`gateway.routes.ts`) — everything else: CRUD for products,
   find-leads trigger, lead list/update/delete, and proxying the right
   subset of requests through to crawler-service with the plan's
   visibility limits attached as query params. This is also where the
   trial-claim endpoint lives (`POST /trial/:scanId/claim`) — claiming
   needs an authenticated user, unlike the rest of the trial flow, so it's
   here rather than in crawler-service's own `trial.routes.ts`.

**Two deployed copies**, `leadpulse-backend` (prod) and
`leadpulse-backend-test` (test) — see §7, this is entirely about Dodo's
test/live split, not about code differing.

---

## 6. crawler-service (`IntentHuntBackend/crawler-service/`)

This is where the actual product happens. One codebase, one Docker image,
deployed two ways:

- **As an API** (`npm run api`) on Cloud Run (`leadpulse-crawler-api`) —
  serves `find-leads.routes.ts` (products/leads CRUD the gateway proxies
  to) and `trial.routes.ts` (the public homepage flow).
- **As a worker** (`npm run worker`) on a GCE VM (`leadpulse-worker`) —
  three polling loops that do the actual pipeline work. The API and worker
  share all the same pipeline code; the API just creates `SearchRun` rows,
  the worker is what processes them.

### 6.1 The six-step pipeline (`src/pipeline/`)

| # | Step | File | Model | What it does |
|---|---|---|---|---|
| 1 | Keyword engine | `step1-keyword-engine.ts` | gpt-4o | Description → `ProductIntelligence` (audience, pains, triggers, competitors) + a `QueryBundle` of per-platform search queries |
| 2 | Google search | `step2-google-search.ts` | — | Runs the query bundle through Serper.dev, builds `site:`-scoped Google queries per platform |
| 3 | Pre-score | `step3-pre-score.ts` | gpt-4o-mini | Cheap first pass on title+snippet only, to kill obvious noise before spending a real content fetch |
| 4 | Content fetch | `lib/scrapecreators.ts` | — | Pulls the full post (and top comments, for Reddit) via ScrapeCreators |
| 5 | Deep score | `step4-5-process-lead.ts` | gpt-4o-mini | The real scoring judgment — buying intent 0–100, competitor-post detection, reasoning, suggested angle |
| 6 | Reply generation | `step6-reply-gen.ts` | gpt-4o | Drafts an actual reply for leads that cleared the bar |

**The product description is read exactly once**, at step 1, and distilled
into the `intelligence` JSON blob stored on the product. Every later step
scores against that blob, never the raw description again. This is the
single most important thing to understand about why results are good or
bad for a given product — see CLAUDE.md's "How scoring actually works."

**Competitor detection** (inside step 5) is its own small subsystem: three
independent signals (pain-then-pivot, first-person-singular promotion,
first-person-plural corporate announcement), because vendor marketing copy
and genuine buyer pain use nearly identical vocabulary — topic matching
alone can't tell them apart, only *voice* can. See CLAUDE.md for the exact
incident that drove this design.

### 6.2 The worker (`src/worker/`, `src/workers/`)

Three independent polling loops (`poller.ts` is the shared polling
primitive), each claiming unclaimed rows with a timestamp-based lease so
two worker instances (or a crashed-and-restarted one) can't double-process
the same row:

- **`orchestrator.worker.ts`** — picks up pending `SearchRun`s, runs steps
  1–2, creates `Lead` rows for every URL found (after dedup against
  `seen_urls`), hands off to the next poller.
- **`process-lead.worker.ts`** — picks up leads needing steps 3–5
  (pre-score → fetch → deep score).
- **`reply-gen.worker.ts`** — picks up leads that cleared the score bar and
  need step 6.

### 6.3 The homepage trial flow (`trial.routes.ts`)

A parallel, cost-conscious path for unauthenticated visitors:

- `POST /trial/analyze` — free. Fetches the page
  (`lib/website.ts`: plain HTTP fetch first, falling back to Apify's
  headless-browser crawler only if the plain fetch comes back too thin —
  Apify costs real money per call, so this fallback is deliberately the
  exception). Derives a description, with a guard against trusting a
  framework's unreplaced boilerplate meta description (see CLAUDE.md —
  this bit twice, once via the plain-fetch path and once via Apify's own
  independent metadata read).
- `POST /trial/:scanId/scan` — the expensive step: runs the real pipeline
  (steps 1–6) against the confirmed/edited description. Rate-limited
  harder than `/analyze` since this is where money gets spent.
- The same URL pasted twice is a cache hit by default — but a scan can
  become stale (checked against a 3-day window) or the description can be
  edited, either of which allows a genuine re-run. A **claimed** scan
  (someone signed up and it became a real product) is permanently exempt
  from this — an anonymous visitor re-pasting a claimed product's URL must
  never be able to silently rewrite a real account's live data.
- `trial-fixtures.ts` holds canned lead data used only when
  `MOCK_PIPELINE=true` — lets you exercise the whole UI flow locally
  without spending Serper/OpenAI/ScrapeCreators credits. Never queues
  anything for the real worker to pick up.

### 6.4 `keyword-service/` — dead code

Still deployed (`leadpulse-keyword` on Cloud Run), still costing nothing to
leave running, but nothing in the codebase calls it. An older copy of the
keyword-engine prompt lives there; editing it does nothing. Confirmed via
grep, not assumption — don't trust this claim blindly either; re-check if
it matters.

---

## 7. Billing (Dodo Payments)

Replaced an earlier Paddle integration — DB columns are still literally
named `paddle_customer_id` etc. to avoid a migration; they hold Dodo IDs
now, the app treats them as opaque strings either way.

`DODO_MODE` (`test` | `live`) is a single env var per deployed instance,
deciding whether that instance talks to Dodo's test or live API — one
instance cannot serve both. That's the entire reason
`leadpulse-backend-test` exists as a separate Cloud Run service from
`leadpulse-backend`: same code, same database, different `DODO_MODE` and
different Dodo API keys/webhook secret/product IDs.

The **product IDs live in the frontend's env vars**, not in backend code —
the pricing page is handed whichever pair matches the site it's built for
(`NEXT_PUBLIC_DODO_PRO_MONTHLY_ID`/`_ANNUAL_ID`), and posts that straight
through. The backend's `PRODUCT_ID_TO_PLAN` map deliberately holds *both*
modes' IDs so the same backend image works regardless of which mode it's
running in — but all three (frontend's product ID, backend's `DODO_MODE`,
backend's own key/secret) have to agree per environment or checkout fails.

As of the last verified check (see CLAUDE.md's "Known open issues" for the
exact date and specifics): prod is confirmed running in live mode, and test
mode was independently verified end-to-end (checkout → webhook → signature
→ plan update). Treat anything older than that check as needing
re-verification, not as settled fact.

---

## 8. Data model — the short version

Full schemas are in `IntentHuntBackend/main-backend/prisma/schema.prisma`
and `IntentHuntBackend/crawler-service/prisma/schema.prisma` — both point
at the same Supabase Postgres database, each defining only the tables/
columns it actually touches.

| Table | Owned by (schema) | What it is |
|---|---|---|
| `profiles` | main-backend | Extends Supabase's `auth.users` with plan/billing state |
| `products` | both (same table, two partial views) | A description + its derived `intelligence`/`queries` |
| `search_runs` | crawler-service | One row per "Find Leads" click; progress counters the frontend polls/subscribes to |
| `leads` | crawler-service | One row per URL found; the full pipeline state machine lives in its timestamp columns (`contentFetchedAt`, `deepScoredAt`, `replyGeneratedAt` — see the model comment for the exact state meanings) |
| `seen_urls` | crawler-service | Dedup — a URL already processed for a product is never re-fetched |
| `trial_scans` | crawler-service | The homepage flow's own record, keyed by URL (not by user — there's no user yet) |
| `contact_messages` | main-backend | Contact form submissions, nobody notified |
| `paddle_events` | main-backend | Dodo webhook idempotency tracking (name kept from the old provider) |

---

## 9. External services this product depends on

| Service | What for | Where configured |
|---|---|---|
| **Supabase** | Postgres database, Auth, Realtime | `DATABASE_URL`/`DIRECT_URL` + Supabase project keys, both backends |
| **OpenAI** | gpt-4o (steps 1, 6), gpt-4o-mini (steps 3, 5) | crawler-service env |
| **Serper.dev** | Google search (step 2) — not named on public pages, the search method is pitched as proprietary | crawler-service env |
| **ScrapeCreators** | Full post content fetch (step 4) | crawler-service env |
| **Apify** | Fallback website crawler for the trial flow's URL extraction, and nothing else | crawler-service env |
| **Dodo Payments** | Subscription billing | both backends, see §7 |
| **Netlify** | Frontend hosting, auto-deploy on push | frontend repo, `main`/`test` branches |
| **Google Cloud Platform** | Both backends (Cloud Run) + the worker (GCE VM) | project `aristotle-452112`, region `asia-south2` |
| **Google Search Console** | SEO monitoring/indexing for intenthunt.io | verified via DNS TXT as a Domain property (covers tst.intenthunt.io too) |

---

## 10. Environments

| | Frontend | Backend | DB | Dodo mode |
|---|---|---|---|---|
| **Prod** | intenthunt.io (Netlify, `main`) | `leadpulse-backend` | *same Supabase project as test* | `live` |
| **Test** | tst.intenthunt.io (Netlify, `test`) | `leadpulse-backend-test` | *same Supabase project as prod* | `test` |

**Test and prod share one database and one worker VM, deliberately** — the
worker polls a single queue of `SearchRun` rows; splitting the database
would leave test's scans queued forever with nothing to process them. The
real cost of this: a test scan spends real Serper/ScrapeCreators/OpenAI
credits, and test signups create rows next to real user data. `tst.
intenthunt.io` is noindexed in search engines (see `isProductionSite` in
§4), but it is **not** sandboxed from real cost or real data — be as
careful running things there as on prod.

`crawler-service` has only **one** deployment total, shared by both
frontend environments via each main-backend's `CRAWLER_SERVICE_URL` — there
is no "test crawler-service."

---

## 11. Where to go next

- **`CLAUDE.md`** (same directory as this file) — gotchas, exact deploy
  commands, SSH quirks, and the running list of known-open issues (plan
  limit mismatch, billing renewal date to check, dark-mode color gaps,
  LinkedIn/Twitter lead quality, no email notifications, no blog/content
  marketing yet).
- Each service's own prompt/pipeline files have detailed comments
  explaining *why*, not just *what* — `step1-keyword-engine.ts` and
  `step4-5-process-lead.ts` especially reward a close read before changing
  either.
- If something in this document turns out to be stale, fix it here rather
  than trusting it blindly next time — this file, like `CLAUDE.md`, is a
  point-in-time map, not a live system.
