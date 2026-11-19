\set ON_ERROR_STOP off
\pset tuples_only on
insert into auth.users (id,email,raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','f@x.com','{"full_name":"Farmer","role":"farmer"}'),
 ('22222222-2222-2222-2222-222222222222','g@x.com','{"full_name":"Other","role":"farmer"}'),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','o1@x.com','{"full_name":"Officer1","role":"officer","organization":"KALRO","county":"Kisumu"}'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','o2@x.com','{"full_name":"Officer2","role":"officer","organization":"KALRO","county":"Kisumu"}'),
 ('dddddddd-dddd-dddd-dddd-dddddddddddd','a@x.com','{"full_name":"Admin","role":"farmer"}'),
 ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','a2@x.com','{"full_name":"Admin2","role":"farmer"}');
update public.agricultural_officers set verification_status='verified' where user_id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
update public.user_roles set role='admin' where user_id in ('dddddddd-dddd-dddd-dddd-dddddddddddd','eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false) \gset
select public.save_farm(null,'{"name":"Shamba","county":"Kisumu","lat":-0.09,"lng":34.76,"size_ha":5,"priorities":[],"boundary":null}'::jsonb) as fid \gset
select set_config('request.jwt.claim.sub','dddddddd-dddd-dddd-dddd-dddddddddddd',false) \gset
insert into public.farm_officer_assignments (farm_id, officer_user_id, assigned_by) values (:'fid','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','dddddddd-dddd-dddd-dddd-dddddddddddd');

\echo '--- field visits'
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',false) \gset
insert into public.field_visits (farm_id, officer_user_id, visit_date, purpose) values (:'fid','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','2026-12-01','Soil sampling') returning id \gset v_
select 'assigned officer logged a visit', count(*) from public.field_visits;
update public.field_visits set status='completed' where id=:'v_id';
select 'completed_at stamped', completed_at is not null from public.field_visits where id=:'v_id';
update public.field_visits set farm_id = gen_random_uuid() where id=:'v_id';
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',false) \gset
insert into public.field_visits (farm_id, officer_user_id, visit_date, purpose) values (:'fid','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','2026-12-01','Not assigned to this farm');
select 'unassigned officer sees visits', count(*) from public.field_visits;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false) \gset
select 'farmer sees visit to own farm', count(*) from public.field_visits;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false) \gset
select 'other farmer sees visits', count(*) from public.field_visits;

\echo '--- notifications (server inserts as superuser; users read/clear their own only)'
reset role;
insert into public.notifications (user_id,title,body,link) values ('11111111-1111-1111-1111-111111111111','Soil test verified','ok','/soil/abc'),('22222222-2222-2222-2222-222222222222','Other','x','/dashboard');
insert into public.notifications (user_id,title,link) values ('11111111-1111-1111-1111-111111111111','Bad link','javascript:alert(1)');
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false) \gset
select 'farmer sees own notifications only', count(*) from public.notifications;
insert into public.notifications (user_id,title) values ('11111111-1111-1111-1111-111111111111','Self-made');
update public.notifications set title='Hacked';
update public.notifications set read_at=now();
select 'marked read', count(*) from public.notifications where read_at is not null;
update public.notifications set user_id='22222222-2222-2222-2222-222222222222';

\echo '--- rotation plans'
select public.save_rotation_plan(('{"farm_id":"'||:'fid'||'","name":"Build the soil","strategy_key":"soil","engine_version":"1.0.0","inputs":{},"metrics":{"avg":88},"seasons":[{"season_index":1,"planting_month":3,"planting_year":2027,"crop_id":"","crop_name":"Soybeans","score":92.1,"details":{}},{"season_index":2,"planting_month":10,"planting_year":2027,"crop_id":"","crop_name":"Sorghum","score":80,"details":{}}]}')::jsonb) as pid \gset
select 'plan with seasons', (select count(*) from public.rotation_plans), (select count(*) from public.rotation_plan_seasons);
select public.save_rotation_plan(('{"farm_id":"'||:'fid'||'","name":"Empty","strategy_key":"x","engine_version":"1","seasons":[]}')::jsonb);
select 'empty plan not left behind', count(*) from public.rotation_plans where name='Empty';
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false) \gset
select 'other farmer sees plans', count(*) from public.rotation_plans;
select public.save_rotation_plan(('{"farm_id":"'||:'fid'||'","name":"Intruder","strategy_key":"x","engine_version":"1","seasons":[{"season_index":1,"planting_month":3,"planting_year":2027,"crop_id":"","crop_name":"X","score":1}]}')::jsonb);
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',false) \gset
select 'assigned officer can read the plan but not delete it', (select count(*) from public.rotation_plans);
delete from public.rotation_plans;
select 'plan still there', count(*) from public.rotation_plans;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false) \gset
delete from public.rotation_plans;
select 'owner deleted plan, seasons cascade', (select count(*) from public.rotation_plans), (select count(*) from public.rotation_plan_seasons);

\echo '--- role management'
select set_config('request.jwt.claim.sub','dddddddd-dddd-dddd-dddd-dddddddddddd',false) \gset
select public.admin_set_role('11111111-1111-1111-1111-111111111111','admin');
select 'farmer promoted', role from public.user_roles where user_id='11111111-1111-1111-1111-111111111111';
select public.admin_set_role('dddddddd-dddd-dddd-dddd-dddddddddddd','farmer');
select public.admin_set_role('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','farmer');
select 'officer role unchanged', role from public.user_roles where user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select public.admin_set_role('22222222-2222-2222-2222-222222222222','officer');
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false) \gset
select public.admin_set_role('22222222-2222-2222-2222-222222222222','admin');
update public.user_roles set role='admin' where user_id='22222222-2222-2222-2222-222222222222';
select 'farmer cannot self-promote', role from public.user_roles where user_id='22222222-2222-2222-2222-222222222222';
reset role; set role anon;
select 'anon visits', count(*) from public.field_visits;
