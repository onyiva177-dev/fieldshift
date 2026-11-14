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

Not built yet: NASA data integration, crop engine, planner, full dashboards.
No NASA or soil data is shown anywhere until those phases are connected to real sources.

## Setup

1. Install Node 20.12 or newer, then run `npm install`.
2. Create a Supabase project. In Project Settings > API, copy the Project URL and the anon public key.
3. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. In the Supabase SQL Editor, run `0001_foundation.sql`, `0002_farms.sql`, then `0003_soil.sql` (in `supabase/migrations/`).
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
