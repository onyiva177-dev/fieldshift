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

\echo '--- farmer reads crops, cannot write them'
select 'farmer sees crops/rules/requirements', (select count(*) from public.crops),(select count(*) from public.crop_rotation_rules),(select count(*) from public.crop_requirements);
update public.crops set review_status='reviewed';
delete from public.crop_rotation_rules;
update public.scoring_config set weights='{"soil":100}';
select 'farmer calling save_crop' , public.save_crop(null, '{"crop":{},"requirement":{}}'::jsonb);
select 'still draft', count(*) from public.crops where review_status='draft';

\echo '--- admin adds a crop and edits it'
select set_config('request.jwt.claim.sub','dddddddd-dddd-dddd-dddd-dddddddddddd',false) \gset
select public.save_crop(null, '{"crop":{"slug":"pigeon_peas","name":"Pigeon peas","aliases":["pigeon pea","mbaazi"],"scientific_name":"Cajanus cajan","family":"Fabaceae","crop_group":"legume","cycle_days_min":150,"cycle_days_max":270,"planting_seasons":["short_rains"],"drought_tolerance":"high","n_demand":"low","p_demand":"low","k_demand":"low","n_fixation_min":"40","n_fixation_max":"100","root_type":"taproot","root_depth_cm":"200","shared_risks":["root rots","nematodes"],"reference_list":[{"title":"Test ref"}],"notes":"","review_status":"draft","is_active":true},"requirement":{"temp_abs_min":15,"temp_opt_min":20,"temp_opt_max":30,"temp_abs_max":38,"rain_abs_min":300,"rain_opt_min":400,"rain_opt_max":800,"rain_abs_max":1500,"ph_abs_min":4.5,"ph_opt_min":5.5,"ph_opt_max":7.0,"ph_abs_max":8.0,"textures_suitable":["loam"],"textures_marginal":[],"drainage_suitable":["well"],"depth_min_cm":"50","ec_max_dsm":"","region_note":""}}'::jsonb) as cid \gset
select 'crops now', count(*) from public.crops;
select 'edit keeps one default requirement', public.save_crop(:'cid', '{"crop":{"slug":"pigeon_peas","name":"Pigeon peas v2","aliases":[],"scientific_name":"Cajanus cajan","family":"Fabaceae","crop_group":"legume","cycle_days_min":150,"cycle_days_max":270,"planting_seasons":[],"drought_tolerance":"high","n_demand":"low","p_demand":"low","k_demand":"low","n_fixation_min":"","n_fixation_max":"","root_type":"taproot","root_depth_cm":"","shared_risks":[],"reference_list":[],"notes":"","review_status":"reviewed","is_active":false},"requirement":{"temp_abs_min":15,"temp_opt_min":20,"temp_opt_max":30,"temp_abs_max":38,"rain_abs_min":300,"rain_opt_min":400,"rain_opt_max":800,"rain_abs_max":1500,"ph_abs_min":4.5,"ph_opt_min":5.5,"ph_opt_max":7.0,"ph_abs_max":8.0,"textures_suitable":["loam"],"textures_marginal":[],"drainage_suitable":["well"],"depth_min_cm":"","ec_max_dsm":"","region_note":""}}'::jsonb) is not null;
select 'requirements for it', count(*) from public.crop_requirements where crop_id=:'cid';
\echo '--- bad ranges rejected by the database'
select public.save_crop(null, '{"crop":{"slug":"bad_crop","name":"Bad","aliases":[],"scientific_name":"x y","family":"Fam","crop_group":"cereal","cycle_days_min":50,"cycle_days_max":60,"planting_seasons":[],"drought_tolerance":"low","n_demand":"low","p_demand":"low","k_demand":"low","root_type":"x","shared_risks":[],"reference_list":[],"notes":"","review_status":"draft","is_active":true},"requirement":{"temp_abs_min":30,"temp_opt_min":20,"temp_opt_max":25,"temp_abs_max":38,"rain_abs_min":300,"rain_opt_min":400,"rain_opt_max":800,"rain_abs_max":1500,"ph_abs_min":4.5,"ph_opt_min":5.5,"ph_opt_max":7.0,"ph_abs_max":8.0,"textures_suitable":[],"textures_marginal":[],"drainage_suitable":["well"]}}'::jsonb);
select 'bad crop not left behind', count(*) from public.crops where slug='bad_crop';
\echo '--- inactive crop hidden from farmers'
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false) \gset
select 'farmer sees pigeon peas (inactive)?', count(*) from public.crops where slug='pigeon_peas';

\echo '--- recommendations snapshot'
insert into public.recommendations (farm_id,requested_by,planting_month,weights,inputs,results,confidence,engine_version) values (:'fid','11111111-1111-1111-1111-111111111111',3,'{}','{}','{"ranked":[]}','{"level":"low"}','1.0.0') returning id \gset r_
update public.recommendations set summary='Plain explanation', summary_source='rules' where id=:'r_id';
select 'summary updated', summary from public.recommendations where id=:'r_id';
update public.recommendations set results='{"ranked":["tampered"]}' where id=:'r_id';
select 'results intact', results from public.recommendations where id=:'r_id';
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false) \gset
insert into public.recommendations (farm_id,requested_by,planting_month,weights,inputs,results,confidence,engine_version) values (:'fid','22222222-2222-2222-2222-222222222222',3,'{}','{}','{}','{}','1.0.0');
select 'other farmer sees recs', count(*) from public.recommendations;
reset role; set role anon;
select 'anon crops', count(*) from public.crops;
