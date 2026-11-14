-- Make an existing account an administrator.
-- 1. Register normally in the app (and confirm the email if confirmation is on).
-- 2. Replace the email below, then run in the Supabase SQL Editor.
update public.user_roles
set role = 'admin'
where user_id = (select id from auth.users where email = 'YOUR-EMAIL@example.com');
