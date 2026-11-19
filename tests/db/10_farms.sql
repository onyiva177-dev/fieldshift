\set ON_ERROR_STOP off
insert into auth.users (id,email,raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','a@x.com','{"full_name":"Farmer A","role":"farmer"}'),
 ('22222222-2222-2222-2222-222222222222','b@x.com','{"full_name":"Farmer B","role":"admin"}'),
 ('33333333-3333-3333-3333-333333333333','o@x.com','{"full_name":"Off","role":"officer","organization":"KALRO","county":"Kisumu"}');
select 'roles' t, user_id, role from public.user_roles order by user_id;
select 'officer rows' t, count(*) from public.agricultural_officers;

set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select 'farm A id' t, public.save_farm(null, '{"name":"Shamba A","county":"Kisumu","lat":-0.09,"lng":34.76,"size_ha":2.5,"irrigation_available":true,"irrigation_type":"drip","water_sources":["borehole"],"fertilizer_practices":["manure"],"priorities":["soil_fertility","soil_fertility","drought_risk"],"notes":"","boundary":{"type":"Polygon","coordinates":[[[34.760,-0.090],[34.762,-0.090],[34.762,-0.092],[34.760,-0.092],[34.760,-0.090]]]},"boundary_source":"drawn"}'::jsonb) as id \gset
select 'priorities' t, count(*) from public.farmer_priorities;
select 'boundary area_ha' t, area_ha from public.farm_boundaries;
select 'location set' t, location is not null from public.farms;

-- self-intersecting bowtie must be rejected, and the farm update rolled back
select 'bowtie' t, public.save_farm((select id from public.farms limit 1), '{"name":"CHANGED","county":"Kisumu","lat":-0.09,"lng":34.76,"size_ha":2.5,"priorities":[],"boundary":{"type":"Polygon","coordinates":[[[34.760,-0.090],[34.762,-0.092],[34.762,-0.090],[34.760,-0.092],[34.760,-0.090]]]},"boundary_source":"drawn"}'::jsonb);
select 'name after failed save' t, name from public.farms;

-- remove boundary
select 'no boundary save' t, public.save_farm((select id from public.farms limit 1), '{"name":"Shamba A","county":"Kisumu","lat":-0.09,"lng":34.76,"size_ha":2.5,"priorities":[],"boundary":null}'::jsonb) is not null;
select 'boundaries left' t, count(*) from public.farm_boundaries;

-- another farmer cannot see or edit it
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
select 'officer sees farms' t, count(*) from public.farms;
select 'officer edit' t, public.save_farm((select id from (select id from public.farms) x limit 1), '{}'::jsonb);
reset role; set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select 'admin sees farms' t, count(*) from public.farms;
-- role escalation attempt by farmer
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
update public.user_roles set role='admin' where user_id='11111111-1111-1111-1111-111111111111';
select 'farmer role after attempt' t, role from public.user_roles where user_id='11111111-1111-1111-1111-111111111111';
-- anon blocked
reset role; set role anon;
select 'anon farms' t, count(*) from public.farms;
