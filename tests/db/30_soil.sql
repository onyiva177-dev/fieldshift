\set ON_ERROR_STOP off
\pset tuples_only on
insert into auth.users (id,email,raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','f@x.com','{"full_name":"Farmer","role":"farmer"}'),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','o1@x.com','{"full_name":"Officer1","role":"officer","organization":"KALRO","county":"Kisumu"}'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','o2@x.com','{"full_name":"Officer2","role":"officer","organization":"KALRO","county":"Kisumu"}'),
 ('cccccccc-cccc-cccc-cccc-cccccccccccc','o3@x.com','{"full_name":"Officer3","role":"officer","organization":"KALRO","county":"Kisumu"}'),
 ('dddddddd-dddd-dddd-dddd-dddddddddddd','a@x.com','{"full_name":"Admin","role":"farmer"}');
update public.agricultural_officers set verification_status='verified' where user_id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
update public.user_roles set role='admin' where user_id='dddddddd-dddd-dddd-dddd-dddddddddddd';

set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false) \gset
select public.save_farm(null,'{"name":"Shamba","county":"Kisumu","lat":-0.09,"lng":34.76,"size_ha":5,"priorities":[],"boundary":{"type":"Polygon","coordinates":[[[34.760,-0.090],[34.762,-0.090],[34.762,-0.092],[34.760,-0.092],[34.760,-0.090]]]},"boundary_source":"drawn"}'::jsonb) as fid \gset

select set_config('request.jwt.claim.sub','dddddddd-dddd-dddd-dddd-dddddddddddd',false) \gset
insert into public.farm_officer_assignments (farm_id, officer_user_id, assigned_by) values
 (:'fid','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','dddddddd-dddd-dddd-dddd-dddddddddddd'),
 (:'fid','cccccccc-cccc-cccc-cccc-cccccccccccc','dddddddd-dddd-dddd-dddd-dddddddddddd');
\echo '--- 1 assignment by a non-admin must fail'
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',false) \gset
insert into public.farm_officer_assignments (farm_id, officer_user_id, assigned_by) values (:'fid','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

\echo '--- 2 sampling point: inside OK, 1 km away rejected'
insert into public.farm_sampling_points (farm_id,label,lat,lng,created_by) values (:'fid','P1',-0.091,34.761,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') returning id \gset sp_
insert into public.farm_sampling_points (farm_id,label,lat,lng,created_by) values (:'fid','FAR',-0.100,34.770,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select 'point1', :'sp_id' as pid;

\echo '--- 3 submit sample (assigned verified officer)'
select public.submit_soil_sample(('{"farm_id":"'||:'fid'||'","sampling_point_id":"'||:'sp_id'||'","sampled_on":"2026-10-01","sample_depth_cm":20,"measurements":[
 {"parameter":"ph","value_num":6.2,"unit":"pH","method":"Water 1:2.5","measured_on":"2026-10-05","source":"laboratory","responsible_party":"KALRO Lab"},
 {"parameter":"nitrogen_total","value_num":null,"value_text":null,"unit":null,"source":"laboratory","responsible_party":"KALRO Lab"},
 {"parameter":"soil_texture","value_text":"clay_loam","source":"field_test","responsible_party":"Officer1"}]}')::jsonb) as s1 \gset
select 'sample1', :'s1' as sid;
\echo '--- 3b future date / no values must fail'
select public.submit_soil_sample(('{"farm_id":"'||:'fid'||'","sampling_point_id":"'||:'sp_id'||'","sampled_on":"2099-01-01","measurements":[]}')::jsonb);
select public.submit_soil_sample(('{"farm_id":"'||:'fid'||'","sampling_point_id":"'||:'sp_id'||'","sampled_on":"2026-10-01","measurements":[{"parameter":"ph","source":"laboratory","responsible_party":"KALRO Lab"}]}')::jsonb);
select 'samples after failures', count(*) from public.soil_samples;
\echo '--- 3c negative value rejected by db'
insert into public.soil_measurements (sample_id,parameter,value_num,unit,source,responsible_party) values (:'s1','extra',-1,'mg/kg','laboratory','x');

\echo '--- 4 unverified (O3) and unassigned (O2) cannot submit'
select set_config('request.jwt.claim.sub','cccccccc-cccc-cccc-cccc-cccccccccccc',false) \gset
select public.submit_soil_sample(('{"farm_id":"'||:'fid'||'","sampling_point_id":"'||:'sp_id'||'","sampled_on":"2026-10-01","measurements":[{"parameter":"ph","value_num":6,"unit":"pH","source":"laboratory","responsible_party":"x1"}]}')::jsonb);
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',false) \gset
select public.submit_soil_sample(('{"farm_id":"'||:'fid'||'","sampling_point_id":"'||:'sp_id'||'","sampled_on":"2026-10-01","measurements":[{"parameter":"ph","value_num":6,"unit":"pH","source":"laboratory","responsible_party":"x1"}]}')::jsonb);
select 'O2 sees farms/samples/points', (select count(*) from public.farms),(select count(*) from public.soil_samples),(select count(*) from public.farm_sampling_points);
select set_config('request.jwt.claim.sub','cccccccc-cccc-cccc-cccc-cccccccccccc',false) \gset
select 'O3 (unverified) sees farms', count(*) from public.farms;

\echo '--- 5 farmer sees the sample, officer1 sees the farm'
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false) \gset
select 'farmer sees samples/measurements', (select count(*) from public.soil_samples),(select count(*) from public.soil_measurements);
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',false) \gset
select 'O1 sees farms', count(*) from public.farms;

\echo '--- 6 officer cannot edit/delete measurements or change status'
update public.soil_measurements set value_num = 9 where sample_id=:'s1';
delete from public.soil_measurements where sample_id=:'s1';
update public.soil_samples set verification_status='verified' where id=:'s1';
select 'ph still', value_num from public.soil_measurements where sample_id=:'s1' and parameter='ph';
select 'status still', verification_status from public.soil_samples where id=:'s1';

\echo '--- 7 attachments: good path ok, bad path rejected'
insert into public.soil_attachments (sample_id,storage_path,file_name,mime_type,size_bytes,kind,uploaded_by) values (:'s1', :'fid'||'/'||:'s1'||'/a.pdf','a.pdf','application/pdf',1000,'lab_report','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into public.soil_attachments (sample_id,storage_path,file_name,mime_type,size_bytes,kind,uploaded_by) values (:'s1','other/path/b.pdf','b.pdf','application/pdf',1000,'lab_report','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into public.soil_attachments (sample_id,storage_path,file_name,mime_type,size_bytes,kind,uploaded_by) values (:'s1', :'fid'||'/'||:'s1'||'/c.exe','c.exe','application/x-msdownload',1000,'lab_report','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

\echo '--- 8 storage object policies'
insert into storage.objects (bucket_id,name) values ('soil-attachments', :'fid'||'/'||:'s1'||'/a.pdf');
insert into storage.objects (bucket_id,name) values ('soil-attachments', 'not-a-uuid/x/a.pdf');
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',false) \gset
insert into storage.objects (bucket_id,name) values ('soil-attachments', :'fid'||'/'||:'s1'||'/evil.pdf');
select 'O2 sees objects', count(*) from storage.objects;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false) \gset
select 'farmer sees objects', count(*) from storage.objects;

\echo '--- 9 review: officer cannot; admin needs note for non-verified; then reviewed is final'
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',false) \gset
select public.review_soil_sample(:'s1','verified',null);
select set_config('request.jwt.claim.sub','dddddddd-dddd-dddd-dddd-dddddddddddd',false) \gset
select public.review_soil_sample(:'s1','needs_correction','');
select public.review_soil_sample(:'s1','needs_correction','Nitrogen missing; please re-test.');
select public.review_soil_sample(:'s1','verified',null);
update public.soil_samples set sampled_on='2026-01-01' where id=:'s1';
select 'status', verification_status, (select count(*) from public.soil_verification_records) as records from public.soil_samples where id=:'s1';

\echo '--- 10 correction: officer submits replacement; late attachment to reviewed sample blocked'
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',false) \gset
select public.submit_soil_sample(('{"farm_id":"'||:'fid'||'","sampling_point_id":"'||:'sp_id'||'","sampled_on":"2026-10-01","supersedes_sample_id":"'||:'s1'||'","measurements":[{"parameter":"ph","value_num":6.3,"unit":"pH","source":"laboratory","responsible_party":"KALRO Lab"}]}')::jsonb) as s2 \gset
select 'replacement', :'s2' as sid, (select count(*) from public.soil_samples) as total_samples;
insert into public.soil_attachments (sample_id,storage_path,file_name,mime_type,size_bytes,kind,uploaded_by) values (:'s1', :'fid'||'/'||:'s1'||'/late.pdf','late.pdf','application/pdf',1000,'lab_report','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
\echo '--- 10b superseding a pending sample must fail'
select public.submit_soil_sample(('{"farm_id":"'||:'fid'||'","sampling_point_id":"'||:'sp_id'||'","sampled_on":"2026-10-02","supersedes_sample_id":"'||:'s2'||'","measurements":[{"parameter":"ph","value_num":6.3,"unit":"pH","source":"laboratory","responsible_party":"KALRO Lab"}]}')::jsonb);
reset role; set role anon;
select 'anon samples', count(*) from public.soil_samples;
