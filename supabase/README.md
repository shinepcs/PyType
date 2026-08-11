# Supabase ranking setup

`schema.sql` is the source of truth for the MVP leaderboard. It stores only the
public nickname and the minimum Quick Play result needed for ranking. Skill
progress, mistakes, and local history are never uploaded.

## Apply

1. Create a Supabase project and enable **Anonymous Sign-Ins** under
   Authentication settings.
2. Open the SQL editor and run `schema.sql`. The script is safe to run again.
3. Copy `js/config.example.js` to `js/config.js` and set `enabled: true`, the
   HTTPS Project URL, and the public publishable key.
4. Never place a secret/service-role key, database password, or personal access
   token in a web asset. Every GitHub Pages file is public.

The browser has column-limited `INSERT` access only. It cannot choose `id` or
`created_at`, and it has no raw-table `SELECT`, `UPDATE`, or `DELETE` grant.
Leaderboard reads use narrow security-definer RPCs which fix `search_path`,
validate parameters, and do not return `user_id` or `session_id`.

The dependency-free auth client keeps the minimal refreshable anonymous session
under `pythonTypingSurvival:supabase-auth:v1`. This is an authentication
credential cache, separate from the single `pythonTypingSurvival:v1` learning
data root. Tokens are never rendered or logged. Clearing browser data loses this
anonymous identity, as it does with the official client.

## Required live verification

Run these checks against a separate test project before production use:

1. With only the public key and no user JWT, direct insert is rejected.
2. After anonymous sign-in, inserting a valid row with the caller's `user_id`
   succeeds.
3. That user cannot insert a row for a different `user_id`.
4. Direct update and delete fail for anonymous and authenticated clients.
5. Out-of-range score, accuracy, WPM, time, problem count, combo, mode,
   nickname, and version values fail database checks.
6. Reusing the same `(user_id, session_id)` produces unique violation `23505`;
   the web service treats this as an idempotent success.
7. `get_global_ranking`, `get_today_ranking`, `get_my_best`, and `get_my_rank`
   filter `game_mode = 'quick'` and the requested content version. Verify the
   documented tie order and UTC boundary with multiple users and duplicate runs.
8. Raw `ranking_entries` reads and attempts to provide `created_at` fail, while
   RPC responses contain no owner or session identifiers.

The Today RPC uses the PostgreSQL server clock and UTC day boundary. Global and
Today select each user's best eligible row before applying the top-100 limit.

## Security limitation

MVP scores are calculated in the public browser client. RLS and constraints
prevent cross-user mutation and obvious invalid values, but cannot prove that a
normal-looking score was earned honestly. Treat the board as educational and
friendly competition until score validation moves behind an Edge Function or
another trusted service.

Public anonymous sign-up can also be abused to create database users. Supabase
applies an IP rate limit and recommends CAPTCHA/Turnstile for higher-risk public
deployments; that abuse-control UI is outside this MVP and should be enabled if
traffic warrants it.
