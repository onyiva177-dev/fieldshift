# Field Shift

Crop rotation decision support for farmers in Kenya and East Africa, built for the 2026 NASA Space Apps Challenge
(Field Shift: Adapting Farms with NASA Data).

Stack: Next.js 15 (TypeScript), Tailwind CSS, Supabase (Postgres, PostGIS, Auth), Vercel.

## Status

Phase 1 (foundation): landing page, registration, login, roles (farmer, officer, admin), officer verification,
audit log, Row Level Security.

Phase 2 (farms): farm registration with map pin, GPS and boundary drawing or GeoJSON upload, farm profiles,
farmer priorities, crop history. Run `supabase/migrations/0002_farms.sql` after 0001.

Phase 3 (soil): officer assignment by admins, sampling points, soil sample submission with measurements and
lab report or photo uploads, admin verification workflow, append-only history. Run `supabase/migrations/0003_soil.sql`.

Phase 4 (NASA): server-side integration with NASA POWER (weather, modelled soil wetness), GPM IMERG rainfall (via POWER),
SMAP soil moisture and MODIS NDVI/EVI (via NASA AppEEARS). Monthly values are cached per farm with source, resolution,
unit, retrieval date and a label saying whether they are satellite-observed, a satellite estimate or model-derived.
Run `supabase/migrations/0004_nasa.sql`.

Phase 5 (crop intelligence): crop knowledge base with per-region requirements, rotation rules, an administrator
interface for crops, rules and scoring weights, and a transparent rule-based recommendation engine. Each crop is scored
on soil, climate, water, nutrients, rotation and farmer priorities, with the breakdown, risks, data sources and a
confidence level shown. An optional AI service only rewrites the engine's results in plain language, and its output is
rejected if it contains numbers the engine did not produce. Run `supabase/migrations/0005_crops.sql`.
The seeded crop values are DRAFT indicative ranges: have an agronomist review them under Administration, Crops.

Phase 6 (planner and dashboards): a multi-season rotation planner that compares five strategies and explains each season;
farmer, officer and administrator dashboards (alerts, farm map, environment and soil summaries, field visits, platform
statistics); in-app notifications; user role management. Run `supabase/migrations/0006_planner_dashboards.sql`.

Not built yet: final testing and production hardening (Phase 7).
No NASA or soil data is shown anywhere until those phases are connected to real sources.

## Setup

1. Install Node 20.12 or newer, then run `npm install`.
2. Create a Supabase project. In Project Settings > API, copy the Project URL and the anon public key.
3. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. In the Supabase SQL Editor, run `0001_foundation.sql`, `0002_farms.sql`, `0003_soil.sql`, then `0004_nasa.sql`, then `0005_crops.sql`, then `0006_planner_dashboards.sql` (in `supabase/migrations/`).
5. In Authentication > URL Configuration, set Site URL to `http://localhost:3000` and add
   `http://localhost:3000/auth/callback` to Redirect URLs. Add your Vercel URL the same way after deploying.
6. For quick local testing you may turn off Authentication > Providers > Email > Confirm email.
   Turn it back on for production.
7. `npm run dev`, open http://localhost:3000, and register.
8. To create the first administrator, register normally, then run `supabase/promote_admin.sql` in the SQL Editor
   with your email.

## Security model

- Row Level Security is enabled on every table. Users can read only their own records; admins have
  controlled access; roles cannot be changed from the app.
- The app uses only the anon key. No service-role key is used in this phase. When added later, it stays server-side.
- Admins are never self-assigned: sign-up can only request farmer or officer.

## Push to GitHub

    git init
    git add .
    git commit -m "Phase 1: foundation"
    git branch -M main
    git remote add origin https://github.com/YOUR-USER/field-shift.git
    git push -u origin main

`.env.local` is git-ignored. Never commit it.

## Deploy to Vercel

1. Import the GitHub repository in Vercel.
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. After the first deploy, add the Vercel URL to Supabase Site URL and Redirect URLs (`/auth/callback`).

## NASA data setup

| Item | Needed for | Where |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Saving any NASA data | Supabase > Project Settings > API |
| `CRON_SECRET` | The daily job at `/api/cron/nasa-sync` (see `vercel.json`) | Any long random string |
| `EARTHDATA_USERNAME`, `EARTHDATA_PASSWORD` | SMAP and MODIS only | Free account at urs.earthdata.nasa.gov |

- NASA POWER and IMERG need no account. SMAP and MODIS go through NASA AppEEARS and are asynchronous: the first sync
  submits a request, and a later sync (daily, or the Refresh button) collects the result.
- The first fetch for a new farm starts in the background when the farm is saved. Pages only read cached values.
- Administrators can see configuration status and recent sync runs under Data sync.
- Satellite and model values are never mixed with officer-verified soil tests.
