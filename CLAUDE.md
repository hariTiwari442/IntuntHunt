# IntentHunt — working notes

Read this before touching the pipeline or deploying. It records things that are
**not** discoverable from the code alone, plus the traps that have already cost
time at least once.

Domain is **intenthunt.io**. Older code, DB rows and GCP resource names still say
**LeadPulse** — same product, renamed. Don't "fix" the GCP names; deploys target them.

---

## What the product does

You describe a product. It searches Reddit, LinkedIn and Twitter/X via Google for
people who sound like buyers, scores each post 0-100 for buying intent, and drafts
a reply. Users work the results from an inbox.

---

## Repo layout

| Path | What it is | Deploys to |
|---|---|---|
| `IntentHuntBackend/main-backend/` | API gateway, auth, billing | Cloud Run `leadpulse-backend` (prod) + `leadpulse-backend-test` (test) |
| `IntentHuntBackend/crawler-service/` | Pipeline API **and** worker (one image, two commands) | Cloud Run `leadpulse-crawler-api` + GCE VM `leadpulse-worker` |
| `IntentHuntBackend/keyword-service/` | **DEAD CODE** — see below | Cloud Run `leadpulse-keyword` (still running, unused) |
| `IntentHuntFrontEnd/` | Next.js 14 App Router | Netlify, auto-deploy on push to `main` |

### Two main-backends, one per payment mode

`DODO_MODE` is a single env var deciding whether the service talks to
`live.dodopayments.com` or `test.dodopayments.com`, so one service cannot serve
both. Hence a replica:

| Service | `DODO_MODE` | Frontend | Dodo product IDs |
|---|---|---|---|
| `leadpulse-backend` | `live` | intenthunt.io | live pair |
| `leadpulse-backend-test` | `test` | test.intenthunt.io | test pair |

**The product IDs live in Netlify, not in the backend.** The pricing page reads
`NEXT_PUBLIC_DODO_PRO_MONTHLY_ID` / `_ANNUAL_ID` and posts whichever it was given
to `/billing/checkout`. The backend's `PRODUCT_ID_TO_PLAN` map
(`services/dodo.client.ts`) holds **both** modes' IDs deliberately, so the same
image works either way — but all three must agree per environment. A test product
ID sent to a live-mode backend fails at Dodo with "no such product", surfacing as
"Couldn't open checkout".

Both replicas share **one database and one worker VM**. That's deliberate: the
worker polls a single queue, so pointing test at its own DB would leave test scans
queued forever. The cost is that test scans spend real Serper/ScrapeCreators/
OpenAI credits and test signups create rows beside real users. Set
`MOCK_PIPELINE=true` on the test service if that matters.

To clone prod into test after an env change, export and patch rather than
retyping secrets — but note `gcloud run services replace` needs the Cloud
Resource Manager API, which is **disabled** on this project. Use
`gcloud run deploy --image <digest> --env-vars-file` instead, and delete the
env file afterwards; it contains the database password.

**`keyword-service/` has no caller.** `KEYWORD_SERVICE_URL` appears only as an
unused default in `main-backend/src/config/env.ts`. It contains an older copy of
the keyword prompt — editing it changes nothing. Verify with a grep before
believing otherwise.

---

## The pipeline

Six steps, in `crawler-service/src/pipeline/`. Four use OpenAI; two don't.

| # | Step | File | Model |
|---|---|---|---|
| 1 | Keyword engine | `step1-keyword-engine.ts` | gpt-4o |
| 2 | Google search (Serper) | `step2-google-search.ts` | — no AI — |
| 3 | Pre-score | `step3-pre-score.ts` | gpt-4o-mini |
| 4 | Content fetch (ScrapeCreators) | `lib/scrapecreators.ts` | — no AI — |
| 5 | Deep score | `step4-5-process-lead.ts` | gpt-4o-mini |
| 6 | Reply generation | `step6-reply-gen.ts` | gpt-4o |

Models are centralised in `src/lib/openai.ts`. All four prompts are dumped for
review in `crawler-service/docs/PROMPTS.md` (generated — edit the source files,
not that doc).

### How scoring actually works — important

**The product description is sent to the AI exactly once**, at step 1
(`orchestrator.worker.ts` → `runKeywordEngine(product.description)`). Step 1
distils it into a `ProductIntelligence` JSON blob stored on `products.intelligence`:

```
{ productName, productType, category, problem, audience,
  pains[], alternatives[], triggers[], searchPhrases[] }
```

Every later stage scores against **that blob, not the description**. Pre-score,
deep-score and reply-gen select only `intelligence` from the DB. So:

- Step 1 is a single point of failure for scoring quality. A wrong `category` or
  generic `pains` poisons every lead for that product, and nothing downstream can
  notice because nothing downstream can see the original description.
- Scoring is prose-vs-prose judgment by an LLM. There are no embeddings and no
  similarity math anywhere.
- The blob is **cached** and reused across scans. `PATCH /products/:id`
  (`main-backend/src/api/routes/gateway.routes.ts`) clears `intelligence` and
  `queries` when `description` changes, so the next scan regenerates both.
  Editing the description is often a faster fix for bad results than prompt tuning.

### Competitor detection — why it's shaped the way it is

Vendor marketing copy and genuine buyer pain use nearly identical vocabulary,
because the vendor is deliberately describing the same buyer. **Topic matching
cannot separate them; only voice can.** The deep-score prompt therefore has three
independent competitor signals, any one sufficient:

- **A** — post opens as buyer pain then pivots into a specific product's features.
- **B** — first-person *singular* promotion ("I built", "my tool"), needs 2+ cues.
- **C** — first-person *plural* corporate announcement ("we're excited to
  announce", "introducing X", "our new app").

Signal C was added 2026-09-18 after a Clay ad scored **70/warm** with
`isCompetitorThread: false`. It opened "We're excited to announce our brand new
business card scanner" — no pain hook (A missed), plural not singular (B missed).
The AI's own reasoning showed it had *recognised* the post as promotion but had no
rule authorising rejection. Signal C also tells the model to weight the opening
frame over the pain-flavoured sentences that follow, since marketing pads the
second half with lines like "no more manual entry!".

If competitor detection regresses, check that the `isCompetitorThread = true if
ANY of these is true` gate hasn't been narrowed back to requiring multiple signals.

### deepScoreLead is the single source of truth

`step4-5-process-lead.ts` exports `deepScoreLead()`, used by both the worker and
the CLI test path. The worker previously kept its own inline copy of the ~160-line
prompt and **the two silently drifted apart**. Do not reintroduce a second copy.

---

## Facts that surprise people

- **There is no cron.** No scheduler exists anywhere. Scans are user-triggered
  only. Any UI or copy promising "recurring scans" is wrong.
- **Re-running a scan will not re-score existing leads.** `orchestrator.worker.ts`
  filters Google results against the `seen_urls` table before processing, so a
  known URL is skipped entirely. To re-evaluate existing leads you must re-score
  them directly from stored `content` (cheap: one gpt-4o-mini call each, zero
  ScrapeCreators credits).
- **Nothing re-scores leads automatically.** A prompt fix only affects leads
  scored *after* it ships. Old bad scores persist in the inbox forever.
- **The inbox only shows leads scoring 80+.** Applied in
  `gateway.routes.ts` (`GET /products` counts) and in the product page's
  `minRelevancy` default. Change one without the other and counts disagree.
- **ScrapeCreators' Twitter endpoint returns no author.** With `trim=true` the
  response has no handle/username field at all, so `lead.author` is NULL for every
  Twitter lead. Don't build rules that depend on it.
- **A failed content fetch writes the Google snippet into `content`**
  (`process-lead.worker.ts` `onItemFailed`) but does *not* score it, so the lead
  stays at `intentScore: 0` — invisible, not a false positive. Before 2026-09-15
  the pipeline scored from snippets *by design*, which produced a batch of badly
  wrong 85-HOT vendor ads; those have been re-scored.

---

## Deploying

### `gcloud` is not on PATH (Windows)

```
& "C:\Users\Hari\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd" ...
```

A bare `gcloud` fails with `CommandNotFoundException` every time.

Project `aristotle-452112`, region `asia-south2`.

### Backend (Cloud Run)

From `IntentHuntBackend/main-backend/`:

```
gcloud run deploy leadpulse-backend --source . --region asia-south2 --project aristotle-452112
```

### Worker (GCE VM `leadpulse-worker`)

Build from `IntentHuntBackend/crawler-service/`:

```
gcloud builds submit \
  --tag asia-south2-docker.pkg.dev/aristotle-452112/cloud-run-source-deploy/leadpulse-crawler-worker:latest \
  --project aristotle-452112 --region asia-south2 .
```

Then SSH to the VM (browser SSH is fine) and restart the container.

**SSH user is `haritiwari442`** — not `Hari`. `/home/Hari/` does not exist.

**Never paste `set -e` or a bare `exit` into that session.** It is an interactive
login shell: `set -e` drops the connection on the first non-zero return, and
`exit` closes it outright. Wrap scripts in `( ... )` so both stay in a subshell.

Run docker **without `sudo`** — on Container-Optimized OS
`sudo docker-credential-gcr configure-docker` fails with a read-only `/root`.

Safest restart, copying env out of the running container rather than hunting for
an env file:

```bash
(
set -e
IMAGE=asia-south2-docker.pkg.dev/aristotle-452112/cloud-run-source-deploy/leadpulse-crawler-worker
OLD=$(docker ps -q --filter "ancestor=$IMAGE" | head -1)
[ -n "$OLD" ] || { echo "ABORT: no container"; exit 1; }
docker inspect "$OLD" --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -vE '^(PATH|NODE_VERSION|YARN_VERSION)=' > ~/worker.env
chmod 600 ~/worker.env
docker pull "$IMAGE:latest"
docker rm -f "$OLD"
docker run -d --name leadpulse-worker --restart unless-stopped \
  --env-file ~/worker.env "$IMAGE:latest" npm run worker
sleep 5
docker logs --tail 40 leadpulse-worker
)
```

**`npm run worker` at the end is mandatory.** The image's default CMD is
`npm run api`. Omit the override and you get a second API server that looks
healthy in the logs while processing zero leads.

Healthy worker logs show three pollers ready (`orchestrator`, `process-lead`,
`reply-gen`) and `Worker health endpoint listening port: 3001`. Fastify on 8080
means the override was dropped.

### Frontend

Push to `main` in `IntentHuntFrontEnd`; Netlify builds automatically.

---

## Local gotchas

- **`npm run build` in crawler-service is `tsc --noEmit` and currently FAILS** on
  pre-existing errors in `src/lib/url-parser.ts`, `src/workers/reply-gen.worker.ts`
  and the old `tests/unit/crawlers/*` files (which import deleted modules). The
  Docker image never runs `tsc` — it runs `tsx` at runtime — so builds and deploys
  pass regardless. Don't be alarmed; don't assume you broke it.
- **Prisma needs `directUrl`.** Supabase's pgbouncer can't run schema-engine
  prepared statements. `prisma db push` may still fail on cross-schema
  `auth.users` (P4002); apply such changes with raw
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` instead.
- **Scratch scripts are not gitignored.** Anything named `scratch-*` at the
  crawler-service root will show up in `git status` — delete when done.
- **Module resolution follows the script's location**, so a throwaway script that
  imports `@prisma/client` must live inside `crawler-service/`, not in a temp dir.

---

## Frontend gotchas

- **React hydration strips `data-theme` in production builds, not in dev.**
  The boot script in `app/layout.tsx` sets it on `<html>` before first paint;
  `<html>` is an element React renders, so a production hydration removes the
  attribute because the client render doesn't produce it. `suppressHydration
  Warning` silences the warning but does NOT prevent the removal. The page
  then falls through to `prefers-color-scheme` and a saved theme looks
  ignored. `components/ThemeGuard.tsx` re-applies it on mount — don't remove
  it. Symptom to recognise: `localStorage.getItem('theme')` returns a value
  while `document.documentElement.dataset.theme` is `undefined`, on the live
  site only.

- **The root background is painted inline by the boot script**, because the
  dark tokens live in an external stylesheet that a hard refresh re-fetches —
  without it, dark-mode users get a white flash. That means the hex values
  are duplicated in `layout.tsx` and `ThemeToggle.tsx`; both must stay in step
  with `--color-bg-primary` in `globals.css`.

## Known open issues

- **Form submissions notify nobody.** The contact form and the API-access
  waitlist both write to `contact_messages` and stop there — you have to open
  the table to see them. There is no transactional email capability in this
  codebase at all: the only mail that gets sent is Supabase's own auth
  links (signup, password reset), which can't send arbitrary messages.
  Wiring notifications needs a provider (Resend is the least work) plus its
  API key, and the destination address. Hari is supplying an official
  IntentHunt address for this.

- **Twitter fetcher sometimes stores empty content.** At least one lead has
  `contentFetchedAt` set with `content` length 0 (a `?lang=tl` URL). It scored
  correctly off its title by luck. Unfixed.
- **LinkedIn produces volume but no quality** — on one product, 30 leads and 0
  scoring 80+. Step 1's own prompt admits Google's LinkedIn index is sparse.
  Not investigated.
- **~21 hardcoded light-only colours in the dashboard** (`bg-red-50`,
  `bg-amber-100`, …) have no `dark:` variant. Structural colours are tokens and
  flip correctly, so nothing breaks, but those chips glare in dark mode.
- **Starter plan limit contradicts itself, user-visibly.**
  `IntentHuntFrontEnd/src/config/plans.ts` sets `productsPerMonth: 3` and the
  dashboard banner renders it ("You're on the Starter plan (3 products/month)"),
  but `main-backend`'s `plan-enforcement.ts` has
  `starter: { productsPerMonth: 1 }`. A starter user is told 3 and blocked at 1.
  Decide which is right and make both agree.
- **`NEXT_PUBLIC_SITE_URL`** must be set in Netlify (+ DNS) for intenthunt.io, or
  SEO metadata falls back to a placeholder.
- **Prod is still on `DODO_MODE=test`.** `intenthunt.io` is launched and taking
  signups, but its backend points at Dodo's test environment, so Upgrade charges
  nobody. Flipping it needs the **live** API key and a live webhook secret from
  Dodo's live dashboard, set together with the live product IDs in Netlify —
  changing one without the other breaks checkout. Trusted users are granted plans
  manually in the DB meanwhile.

---

## Conventions

- Don't name Serper or ScrapeCreators on public marketing pages — the pitch is
  that the method is proprietary.
- Prefer fixing a product's `description` (which regenerates `intelligence`) over
  tuning prompts when one product's results look wrong. Prompts are global;
  intelligence is per-product.
- When changing the deep-score prompt, re-score a known-bad lead from stored
  content to verify before assuming it worked.
