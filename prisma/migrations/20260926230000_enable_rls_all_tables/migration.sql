-- Security audit finding: every public table had Row Level Security disabled,
-- and Supabase's Data API (PostgREST) is live and reachable. With RLS off,
-- any request carrying a valid anon/authenticated API key can read or write
-- every row in every table directly, bypassing this app's own backend
-- entirely. That key has never been distributed to any client (this app only
-- ever talks to Postgres directly, never through supabase-js), so this isn't
-- actively exploited today — but it's one leaked key away from the whole
-- database being world-readable/writable.
--
-- Enabling RLS with zero policies makes PostgREST's anon/authenticated roles
-- get denied by default on every table (no policy = no access). The
-- `postgres` role this app's own DATABASE_URL/DIRECT_URL connects as is a
-- superuser, which bypasses RLS entirely — the backend's own queries are
-- completely unaffected.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "auth_identities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bills" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_candidates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fx_rates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_billers" ENABLE ROW LEVEL SECURITY;
