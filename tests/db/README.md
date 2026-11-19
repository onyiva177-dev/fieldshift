# Database security tests

These scripts replay realistic scenarios as different users (farmer, officer, admin, outsider, signed-out visitor) and
print what each can see or change. Read the output: every "must fail" step should show an error or zero rows.

    bash scripts/test-db.sh        # needs a local PostgreSQL with PostGIS and a superuser connection (PG* env vars)

They run on a throwaway database built from `00_stubs.sql` plus every file in `supabase/migrations/`. They never
touch your real Supabase project. The inputs are made-up test users and values.
