-- ============================================================
-- IntentHunt — Complete Database Setup
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================


-- ══════════════════════════════════════════════════════════
-- 1. ENUMS
-- ══════════════════════════════════════════════════════════

CREATE TYPE "JobStatus"  AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');
CREATE TYPE "TaskStatus" AS ENUM ('pending', 'running', 'completed', 'failed', 'dead');
CREATE TYPE "SourceType" AS ENUM ('reddit', 'hackernews');


-- ══════════════════════════════════════════════════════════
-- 2. PROFILES (replaces old "users" table)
--    Linked to Supabase auth.users via UUID
-- ══════════════════════════════════════════════════════════

CREATE TABLE public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT UNIQUE NOT NULL,
  name       TEXT,
  avatar_url TEXT,
  plan       TEXT NOT NULL DEFAULT 'starter',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX profiles_email_idx ON public.profiles(email);

-- Auto-create profile when a new user signs up in Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Auto-update updated_at on profile changes
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();


-- ══════════════════════════════════════════════════════════
-- 3. CRAWL JOBS
-- ══════════════════════════════════════════════════════════

CREATE TABLE crawl_jobs (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL,
  keywords        TEXT[],
  sources         "SourceType"[],
  status          "JobStatus" NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at      TIMESTAMP(3),
  completed_at    TIMESTAMP(3),
  error_message   TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT crawl_jobs_pkey PRIMARY KEY (id)
);

CREATE INDEX crawl_jobs_user_id_idx    ON crawl_jobs(user_id);
CREATE INDEX crawl_jobs_status_idx     ON crawl_jobs(status);
CREATE INDEX crawl_jobs_created_at_idx ON crawl_jobs(created_at DESC);


-- ══════════════════════════════════════════════════════════
-- 4. CRAWL TASKS
-- ══════════════════════════════════════════════════════════

CREATE TABLE crawl_tasks (
  id              TEXT NOT NULL,
  job_id          TEXT NOT NULL,
  source          "SourceType" NOT NULL,
  keyword         TEXT NOT NULL,
  status          "TaskStatus" NOT NULL DEFAULT 'pending',
  attempts        INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 3,
  last_attempt_at TIMESTAMP(3),
  next_attempt_at TIMESTAMP(3),
  result_count    INTEGER,
  error_message   TEXT,
  bullmq_job_id   TEXT,
  created_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at    TIMESTAMP(3),
  CONSTRAINT crawl_tasks_pkey PRIMARY KEY (id)
);

CREATE INDEX  crawl_tasks_job_id_idx ON crawl_tasks(job_id);
CREATE INDEX  crawl_tasks_status_idx ON crawl_tasks(status);
CREATE UNIQUE INDEX crawl_tasks_job_id_source_keyword_key ON crawl_tasks(job_id, source, keyword);


-- ══════════════════════════════════════════════════════════
-- 5. POSTS
-- ══════════════════════════════════════════════════════════

CREATE TABLE posts (
  id              TEXT NOT NULL,
  job_id          TEXT NOT NULL,
  task_id         TEXT NOT NULL,
  source          "SourceType" NOT NULL,
  external_id     TEXT NOT NULL,
  keyword         TEXT NOT NULL,
  title           TEXT NOT NULL,
  content         TEXT,
  author          TEXT,
  url             TEXT,
  score           INTEGER,
  comment_count   INTEGER,
  subreddit       TEXT,
  posted_at       TIMESTAMP(3),
  fetched_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  intent_score    DECIMAL(5,2),
  suggested_reply TEXT,
  raw_data        JSONB NOT NULL,
  CONSTRAINT posts_pkey PRIMARY KEY (id)
);

CREATE INDEX  posts_job_id_intent_score_idx  ON posts(job_id, intent_score DESC);
CREATE INDEX  posts_source_fetched_at_idx    ON posts(source, fetched_at DESC);
CREATE INDEX  posts_keyword_idx              ON posts(keyword);
CREATE UNIQUE INDEX posts_job_id_source_external_id_key ON posts(job_id, source, external_id);


-- ══════════════════════════════════════════════════════════
-- 6. FOREIGN KEYS
-- ══════════════════════════════════════════════════════════

ALTER TABLE crawl_jobs  ADD CONSTRAINT crawl_jobs_user_id_fkey  FOREIGN KEY (user_id)  REFERENCES public.profiles(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE crawl_tasks ADD CONSTRAINT crawl_tasks_job_id_fkey  FOREIGN KEY (job_id)   REFERENCES crawl_jobs(id)       ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE posts       ADD CONSTRAINT posts_job_id_fkey        FOREIGN KEY (job_id)   REFERENCES crawl_jobs(id)       ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE posts       ADD CONSTRAINT posts_task_id_fkey       FOREIGN KEY (task_id)  REFERENCES crawl_tasks(id)      ON DELETE RESTRICT ON UPDATE CASCADE;


-- ══════════════════════════════════════════════════════════
-- 7. ROW LEVEL SECURITY (profiles)
-- ══════════════════════════════════════════════════════════

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Service role full access"
  ON public.profiles FOR ALL
  USING (auth.role() = 'service_role');


-- ══════════════════════════════════════════════════════════
-- SETUP INSTRUCTIONS (manual steps in Supabase Dashboard)
-- ══════════════════════════════════════════════════════════
--
-- 1. Authentication → Providers:
--    • Email: Enable, turn on "Confirm email"
--    • Google: Enable, add Client ID + Secret from Google Cloud Console
--    • GitHub: Enable, add Client ID + Secret from GitHub OAuth App
--
-- 2. Authentication → URL Configuration:
--    • Site URL: http://localhost:3000
--    • Redirect URLs: http://localhost:3000/auth/callback
--
-- 3. Settings → API:
--    • Copy JWT Secret     → .env JWT_SECRET
--    • Copy anon key       → .env SUPABASE_ANON_KEY
--    • Copy service_role   → .env SUPABASE_SERVICE_ROLE_KEY
