\set ON_ERROR_STOP off
\pset tuples_only on
insert into auth.users (id,email,raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','f@x.com','{"full_name":"Farmer","role":"farmer"}'),
 ('22222222-2222-2222-2222-222222222222','g@x.com','{"full_name":"Other","role":"farmer"}'),
 ('dddddddd-dddd-dddd-dddd-dddddddddddd','a@x.com','{"full_name":"Admin","role":"farmer"}');
update public.user_roles set role='admin' where user_id='dddddddd-dddd-dddd-dddd-dddddddddddd';
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false) \gset
select public.save_farm(null,'{"name":"Shamba","county":"Kisumu","lat":-0.09,"lng":34.76,"size_ha":5,"priorities":[],"boundary":null}'::jsonb) as fid \gset
reset role;
-- the server (service role = superuser/bypass here) writes observations
insert into public.nasa_observations (farm_id,dataset,product,variable,period_start,period_end,value,unit,aggregation,kind,spatial_resolution) values
 (:'fid','POWER','p','T2M','2026-01-01','2026-01-31',21.5,'C','monthly_mean','model_derived','0.5 deg');
insert into public.nasa_sync_runs (farm_id,dataset,trigger,status) values (:'fid','POWER','manual','succeeded');
\echo '--- duplicate observation must be rejected (upsert key)'
insert into public.nasa_observations (farm_id,dataset,product,variable,period_start,period_end,value,unit,aggregation,kind,spatial_resolution) values
 (:'fid','POWER','p','T2M','2026-01-01','2026-01-31',99,'C','monthly_mean','model_derived','0.5 deg');
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false) \gset
select 'owner sees obs/runs', (select count(*) from public.nasa_observations), (select count(*) from public.nasa_sync_runs);
\echo '--- users cannot write NASA tables'
insert into public.nasa_observations (farm_id,dataset,product,variable,period_start,period_end,value,unit,aggregation,kind,spatial_resolution) values (:'fid','POWER','p','T2M','2026-02-01','2026-02-28',1,'C','monthly_mean','model_derived','x');
update public.nasa_observations set value = 0;
delete from public.nasa_observations;
insert into public.nasa_sync_runs (farm_id,dataset,trigger,status) values (:'fid','POWER','manual','succeeded');
select 'value intact', value from public.nasa_observations;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false) \gset
select 'other farmer sees obs/runs', (select count(*) from public.nasa_observations), (select count(*) from public.nasa_sync_runs);
select set_config('request.jwt.claim.sub','dddddddd-dddd-dddd-dddd-dddddddddddd',false) \gset
select 'admin sees obs/runs', (select count(*) from public.nasa_observations), (select count(*) from public.nasa_sync_runs);
reset role; set role anon;
select 'anon obs', count(*) from public.nasa_observations;
