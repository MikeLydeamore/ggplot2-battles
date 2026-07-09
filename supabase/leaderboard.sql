create table if not exists public.leaderboard_submissions (
  id uuid primary key default gen_random_uuid(),
  challenge_id text not null check (challenge_id ~ '^[a-z0-9_-]{1,80}$'),
  display_name text not null check (char_length(display_name) between 2 and 32),
  score numeric(5, 2) not null check (score >= 0 and score <= 100),
  code text not null check (char_length(code) <= 20000),
  delete_token_hash text,
  ip_hash text,
  user_agent text,
  submitted_at timestamptz not null default now()
);

alter table public.leaderboard_submissions
  add column if not exists delete_token_hash text;

alter table public.leaderboard_submissions enable row level security;

-- No public policies are added here. The Vercel API uses the Supabase
-- service role key server-side and returns only public leaderboard fields.

create index if not exists leaderboard_submissions_challenge_score_idx
  on public.leaderboard_submissions (challenge_id, score desc, submitted_at asc);

create index if not exists leaderboard_submissions_rate_limit_idx
  on public.leaderboard_submissions (challenge_id, ip_hash, submitted_at desc);

-- Supabase/PostgREST can briefly keep an old REST schema cache after DDL.
-- Reload it so newly-added columns are visible to /rest/v1 requests.
notify pgrst, 'reload schema';
