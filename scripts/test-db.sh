#!/usr/bin/env bash
# Builds a scratch database from the migrations and replays the security scenarios in tests/db/.
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${TEST_DB:-fieldshift_test}"
psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f tests/db/00_stubs.sql
for m in supabase/migrations/*.sql; do echo "applying $m"; psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$m"; done
for t in tests/db/[1-9]*.sql; do
  echo; echo "=== $t"
  # each scenario starts from a clean set of test users
  psql -q -d "$DB" -c "truncate auth.users cascade; delete from public.crops where slug in ('pigeon_peas','bad_crop')" >/dev/null 2>&1 || true
  psql -d "$DB" -f "$t" 2>&1 | grep -v '^$' | grep -v '^SET$\|^RESET$\|^INSERT\|^UPDATE\|^DELETE' | sed 's#psql:[^ ]*:[0-9]*: ##' | cut -c1-170
done
echo; echo "Done. Review the output above: forbidden actions must show errors or zero rows."
