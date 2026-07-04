# LeadPulse — Frontend

Next.js 14 app for LeadPulse. Finds buyers across Reddit, LinkedIn & Twitter.

## Stack

- Next.js 14 (App Router)
- React 18 + TypeScript
- Tailwind CSS 4
- TanStack Query (data fetching)
- Zustand (auth store)
- Supabase Realtime (live lead inbox updates)

## Local setup

```bash
# 1. Install dependencies
npm install

# 2. Copy env template and fill in values
cp .env.example .env.local

# 3. Run the dev server
npm run dev
```

The app runs on **http://localhost:8080**.

## Environment variables

See `.env.example` for the full list:

| Var | What it is |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend gateway URL (defaults to `http://localhost:3000`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key (safe to expose) |

## Scripts

```bash
npm run dev     # dev server on :8080
npm run build   # production build
npm run start   # serve production build on :8080
npm run lint    # ESLint
```

## Backend

This frontend talks to two backend services (kept in a separate repo):

- **main-backend** — auth + product/lead gateway (port 3000)
- **crawler-service** — search pipeline + workers (port 3001)

Both must be running for the app to function end-to-end.
