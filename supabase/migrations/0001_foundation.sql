-- Field Shift: Phase 1 foundation
-- Run in Supabase: SQL Editor > New query > paste > Run. Safe to run once on a new project.

create extension if not exists postgis with schema extensions;

-- Enums ---------------------------------------------------------------
create type public.app_role as enum ('farmer', 'officer', 'admin');
create type public.officer_verification as enum ('pending', 'verified', 'rejected');

-- Tables --------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'farmer',
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_lower text not null unique,
  created_at timestamptz not null default now()
);

create table public.agricultural_officers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id),
  professional_role text not null,
  contact_email text,
  contact_phone text,
  county text not null,
  sub_county text,
  verification_status public.officer_verification not null default 'pending',
  verified_by uuid references auth.users (id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index agricultural_officers_status_idx on public.agricultural_officers (verification_status, created_at);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text not null,
  details jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id);

-- Helpers -------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger officers_updated before update on public.agricultural_officers
  for each row execute function public.set_updated_at();

-- security definer so policies can check the role without recursing into user_roles' own policy
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin');
$$;

-- New sign-ups: create profile, role and (for officers) a pending officer record.
-- Only 'farmer' or 'officer' can be requested. Admins are promoted manually (see promote_admin.sql).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  final_role public.app_role :=
    case when meta->>'role' = 'officer' then 'officer'::public.app_role else 'farmer'::public.app_role end;
  org_name text := coalesce(nullif(trim(meta->>'organization'), ''), 'Unspecified');
  org_id uuid;
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(nullif(trim(meta->>'full_name'), ''), split_part(new.email, '@', 1)),
    nullif(trim(meta->>'phone'), '')
  );

  insert into public.user_roles (user_id, role) values (new.id, final_role);

  if final_role = 'officer' then
    insert into public.organizations (name, name_lower)
    values (org_name, lower(org_name))
    on conflict (name_lower) do update set name = public.organizations.name
    returning id into org_id;

    insert into public.agricultural_officers
      (user_id, organization_id, professional_role, contact_email, contact_phone, county, sub_county)
    values (
      new.id,
      org_id,
      coalesce(nullif(trim(meta->>'professional_role'), ''), 'Officer'),
      new.email,
      nullif(trim(meta->>'phone'), ''),
      coalesce(nullif(trim(meta->>'county'), ''), 'Unspecified'),
      nullif(trim(meta->>'sub_county'), '')
    );
  end if;

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row Level Security --------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.organizations enable row level security;
alter table public.agricultural_officers enable row level security;
alter table public.audit_logs enable row level security;

-- profiles: own row or admin; users may edit their own name and phone
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- user_roles: read-only for users. No insert/update/delete policies, so roles cannot be self-assigned.
create policy user_roles_select on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- organizations: readable by signed-in users; written only by the sign-up trigger
create policy organizations_select on public.organizations for select to authenticated
  using (true);

-- officers: own record or admin; only admins change verification
create policy officers_select on public.agricultural_officers for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy officers_admin_update on public.agricultural_officers for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- audit logs: anyone signed in can record their own actions; only admins can read
create policy audit_insert on public.audit_logs for insert to authenticated
  with check (actor_id = auth.uid());
create policy audit_select on public.audit_logs for select to authenticated
  using (public.is_admin());

-- Never expose these tables to unauthenticated visitors
revoke all on public.profiles, public.user_roles, public.organizations,
  public.agricultural_officers, public.audit_logs from anon;
