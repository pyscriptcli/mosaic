-- Durable run records, resumable page staging, and fenced ClickUp worker claims.
create table if not exists public.echo_clickup_sync_runs (
  id uuid primary key default gen_random_uuid(),
  scope_key text not null references public.echo_clickup_connections(scope_key) on delete cascade,
  user_id text not null,
  trigger text not null check (trigger in ('manual','webhook','scheduled','write')),
  state text not null default 'queued' check (state in ('queued','running','partial','synced','failed')),
  requested_targets integer not null default 0,
  completed_targets integer not null default 0,
  failed_targets integer not null default 0,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists echo_clickup_sync_runs_owner on public.echo_clickup_sync_runs(scope_key,user_id,created_at desc);

create table if not exists public.echo_clickup_sync_run_targets (
  run_id uuid not null references public.echo_clickup_sync_runs(id) on delete cascade,
  scope_key text not null,
  list_id text not null,
  list_label text not null,
  generation bigint not null,
  state text not null default 'queued' check (state in ('queued','running','synced','failed')),
  records integer not null default 0,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key(run_id,list_id),
  foreign key(scope_key,list_id) references public.echo_clickup_sync_jobs(scope_key,list_id) on delete cascade
);
create index if not exists echo_clickup_sync_run_targets_pending on public.echo_clickup_sync_run_targets(run_id,state);

alter table public.echo_clickup_sync_jobs
  add column if not exists requested_generation bigint not null default 1,
  add column if not exists completed_generation bigint not null default 0,
  add column if not exists claim_generation bigint,
  add column if not exists claim_token uuid,
  add column if not exists progress_generation bigint,
  add column if not exists progress_page integer not null default 0,
  add column if not exists last_full_sync_at timestamptz;

create or replace function public.echo_invalidate_clickup_sync(p_scope_key text,p_list_id text default null)
returns void language plpgsql security definer set search_path=public as $$
begin
  delete from public.echo_clickup_http_cache
    where scope_key=p_scope_key and (p_list_id is null or resource_path like '%/list/'||p_list_id||'/task%');
  update public.echo_clickup_sync_jobs set
    requested_generation=requested_generation+1,
    state=case when state='running' then 'running' else 'queued' end,
    next_attempt_at=case when state='running' then next_attempt_at else now() end,
    attempts=case when state='failed' then 0 else attempts end,
    last_error=null,updated_at=now()
    where scope_key=p_scope_key and (p_list_id is null or list_id=p_list_id);
end $$;

create table if not exists public.echo_clickup_sync_staging (
  scope_key text not null,
  list_id text not null,
  generation bigint not null,
  record_id text not null,
  payload jsonb not null,
  synced_at timestamptz not null default now(),
  primary key(scope_key,list_id,generation,record_id)
);
create index if not exists echo_clickup_sync_staging_generation on public.echo_clickup_sync_staging(scope_key,list_id,generation);
create table if not exists public.echo_clickup_task_tombstones (
  scope_key text not null,
  list_id text not null,
  record_id text not null,
  generation bigint not null,
  created_at timestamptz not null default now(),
  primary key(scope_key,list_id,record_id)
);
create index if not exists echo_clickup_task_tombstones_generation on public.echo_clickup_task_tombstones(scope_key,list_id,generation);
alter table public.echo_clickup_sync_runs enable row level security;
alter table public.echo_clickup_sync_run_targets enable row level security;
alter table public.echo_clickup_sync_staging enable row level security;
alter table public.echo_clickup_task_tombstones enable row level security;
revoke all on public.echo_clickup_sync_runs,public.echo_clickup_sync_run_targets,public.echo_clickup_sync_staging,public.echo_clickup_task_tombstones from anon,authenticated;
grant all on public.echo_clickup_sync_runs,public.echo_clickup_sync_run_targets,public.echo_clickup_sync_staging,public.echo_clickup_task_tombstones to service_role;

create or replace function public.echo_enqueue_clickup_sync_run(p_scope_key text,p_user_id text,p_trigger text,p_targets jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare run_id uuid; target jsonb; list_id text; list_label text; target_generation bigint; target_count integer:=0;
begin
  if p_trigger not in ('manual','webhook','scheduled','write') or jsonb_typeof(p_targets)<>'array' then raise exception 'invalid sync request'; end if;
  if not exists(select 1 from public.echo_clickup_connections where scope_key=p_scope_key and user_id=p_user_id) then raise exception 'ClickUp connection ownership mismatch'; end if;
  insert into public.echo_clickup_sync_runs(scope_key,user_id,trigger,state) values(p_scope_key,p_user_id,p_trigger,'queued') returning id into run_id;
  for target in select value from jsonb_array_elements(p_targets) loop
    list_id:=target->>'id'; list_label:=left(coalesce(nullif(target->>'label',''),target->>'id'),120);
    if coalesce(list_id,'') !~ '^\d{4,24}$' then continue; end if;
    insert into public.echo_clickup_sync_jobs(scope_key,user_id,list_id,state,next_attempt_at,attempts,last_error)
      values(p_scope_key,p_user_id,list_id,'queued',now(),0,null)
    on conflict(scope_key,list_id) do update set
      requested_generation=public.echo_clickup_sync_jobs.requested_generation+1,
      state=case when public.echo_clickup_sync_jobs.state='running' then 'running' else 'queued' end,
      next_attempt_at=case when public.echo_clickup_sync_jobs.state='running' then public.echo_clickup_sync_jobs.next_attempt_at else now() end,
      attempts=case when public.echo_clickup_sync_jobs.state='failed' then 0 else public.echo_clickup_sync_jobs.attempts end,
      last_error=null,updated_at=now()
    returning requested_generation into target_generation;
    insert into public.echo_clickup_sync_run_targets(run_id,scope_key,list_id,list_label,generation)
      values(run_id,p_scope_key,list_id,list_label,target_generation) on conflict(run_id,list_id) do nothing;
    insert into public.echo_clickup_task_tombstones(scope_key,list_id,record_id,generation)
      select p_scope_key,list_id,task_id,target_generation from jsonb_array_elements_text(coalesce(target->'deletedTaskIds','[]'::jsonb)) as deleted(task_id)
      on conflict(scope_key,list_id,record_id) do update set generation=excluded.generation,created_at=now();
    delete from public.echo_clickup_task_tombstones tombstone where tombstone.scope_key=p_scope_key and tombstone.list_id=target->>'id'
      and tombstone.record_id in (select jsonb_array_elements_text(coalesce(target->'changedTaskIds','[]'::jsonb)));
    target_count:=target_count+1;
  end loop;
  update public.echo_clickup_sync_runs set requested_targets=target_count,state=case when target_count=0 then 'failed' else 'queued' end,
    finished_at=case when target_count=0 then now() else null end where id=run_id;
  return run_id;
end $$;

create or replace function public.echo_claim_clickup_sync_jobs_v2(p_limit integer default 2)
returns table(id bigint,scope_key text,user_id text,list_id text,encrypted_token text,claim_token uuid,generation bigint,progress_page integer,last_synced_at timestamptz,last_full_sync_at timestamptz,run_id uuid)
language plpgsql security definer set search_path=public as $$
begin
  return query with due as (
    select j.id from public.echo_clickup_sync_jobs j
    where ((j.state in ('queued','retry') and j.next_attempt_at<=now())
      or (j.state='ready' and coalesce(j.last_full_sync_at,'-infinity'::timestamptz)<now()-interval '7 days')
      or (j.state='running' and j.lease_until<now()))
    order by j.next_attempt_at,j.scope_key,j.id for update skip locked limit least(greatest(p_limit,1),5)
  ), claimed as (
    update public.echo_clickup_sync_jobs j set state='running',
      lease_until=now()+interval '2 minutes',claim_token=gen_random_uuid(),
      claim_generation=greatest(j.completed_generation+1,j.requested_generation),
      progress_page=case when j.progress_generation is distinct from greatest(j.completed_generation+1,j.requested_generation) then 0 else j.progress_page end,
      progress_generation=greatest(j.completed_generation+1,j.requested_generation),updated_at=now()
    from due where j.id=due.id returning j.id,j.scope_key,j.user_id,j.list_id,j.claim_token,j.claim_generation,j.progress_page,j.last_synced_at,j.last_full_sync_at
  ), cleaned as (
    delete from public.echo_clickup_sync_staging s using claimed c
    where s.scope_key=c.scope_key and s.list_id=c.list_id and s.generation<>c.claim_generation
    returning s.record_id
  ), started_targets as (
    update public.echo_clickup_sync_run_targets target set state='running',updated_at=now()
    from claimed c where target.scope_key=c.scope_key and target.list_id=c.list_id and target.generation=c.claim_generation and target.state='queued'
    returning target.run_id
  ), started_runs as (
    update public.echo_clickup_sync_runs run set state='running'
    where run.id in (select run_id from started_targets) returning run.id
  )
  select c.id,c.scope_key,c.user_id,c.list_id,conn.encrypted_token,c.claim_token,c.claim_generation,c.progress_page,c.last_synced_at,c.last_full_sync_at,
    (select target.run_id from public.echo_clickup_sync_run_targets target where target.scope_key=c.scope_key and target.list_id=c.list_id and target.generation<=c.claim_generation and target.state in ('queued','running') order by target.generation desc limit 1)
  from claimed c join public.echo_clickup_connections conn using(scope_key);
end $$;

create or replace function public.echo_stage_clickup_sync_page_v2(p_job_id bigint,p_claim_token uuid,p_generation bigint,p_tasks jsonb,p_next_page integer,p_done boolean,p_synced_at timestamptz,p_full boolean)
returns boolean language plpgsql security definer set search_path=public as $$
declare job public.echo_clickup_sync_jobs%rowtype;
begin
  select * into job from public.echo_clickup_sync_jobs where id=p_job_id and state='running' and claim_token=p_claim_token
    and claim_generation=p_generation and lease_until>now() for update;
  if not found then return false; end if;
  if jsonb_typeof(p_tasks)<>'array' then raise exception 'ClickUp tasks payload must be an array'; end if;
  insert into public.echo_clickup_sync_staging(scope_key,list_id,generation,record_id,payload,synced_at)
    select job.scope_key,job.list_id,p_generation,item->>'id',item,p_synced_at from jsonb_array_elements(p_tasks) item
    where coalesce(item->>'id','')<>''
    on conflict(scope_key,list_id,generation,record_id) do update set payload=excluded.payload,synced_at=excluded.synced_at;
  if p_done then
    if p_full then
      delete from public.echo_clickup_task_records where scope_key=job.scope_key and list_id=job.list_id;
    end if;
    insert into public.echo_clickup_task_records(scope_key,list_id,record_id,payload,synced_at)
      select scope_key,list_id,record_id,payload,p_synced_at from public.echo_clickup_sync_staging
      where scope_key=job.scope_key and list_id=job.list_id and generation=p_generation
    on conflict(scope_key,list_id,record_id) do update set payload=excluded.payload,synced_at=excluded.synced_at;
    delete from public.echo_clickup_task_records r using public.echo_clickup_task_tombstones t
      where t.scope_key=job.scope_key and t.list_id=job.list_id and t.generation<=p_generation
        and r.scope_key=t.scope_key and r.list_id=t.list_id and r.record_id=t.record_id;
    delete from public.echo_clickup_task_tombstones where scope_key=job.scope_key and list_id=job.list_id and generation<=p_generation;
    update public.echo_clickup_sync_jobs set completed_generation=p_generation,last_synced_at=p_synced_at,
      last_full_sync_at=case when p_full then p_synced_at else last_full_sync_at end,
      state=case when requested_generation>p_generation then 'queued' else 'ready' end,
      next_attempt_at=case when requested_generation>p_generation then now() else next_attempt_at end,
      attempts=0,last_error=null,lease_until=null,claim_token=null,claim_generation=null,progress_page=0,updated_at=now()
      where id=p_job_id;
    update public.echo_clickup_sync_run_targets set state='synced',records=(select count(*) from public.echo_clickup_sync_staging s where s.scope_key=job.scope_key and s.list_id=job.list_id and s.generation=p_generation),last_error=null,updated_at=now()
      where scope_key=job.scope_key and list_id=job.list_id and generation<=p_generation and state in ('queued','running');
    delete from public.echo_clickup_sync_staging where scope_key=job.scope_key and list_id=job.list_id and generation=p_generation;
  else
    update public.echo_clickup_sync_jobs set progress_page=p_next_page,lease_until=now()+interval '2 minutes',updated_at=now()
      where id=p_job_id and claim_token=p_claim_token;
  end if;
  update public.echo_clickup_sync_runs r set
    completed_targets=(select count(*) from public.echo_clickup_sync_run_targets t where t.run_id=r.id and t.state='synced'),
    failed_targets=(select count(*) from public.echo_clickup_sync_run_targets t where t.run_id=r.id and t.state='failed'),
    state=case when exists(select 1 from public.echo_clickup_sync_run_targets t where t.run_id=r.id and t.state in ('queued','running')) then 'running'
      when exists(select 1 from public.echo_clickup_sync_run_targets t where t.run_id=r.id and t.state='failed') then 'partial' else 'synced' end,
    finished_at=case when exists(select 1 from public.echo_clickup_sync_run_targets t where t.run_id=r.id and t.state in ('queued','running')) then null else now() end
    where r.id in (select run_id from public.echo_clickup_sync_run_targets where scope_key=job.scope_key and list_id=job.list_id and generation<=p_generation and state='synced');
  return true;
end $$;

create or replace function public.echo_release_clickup_sync_claim_v2(p_job_id bigint,p_claim_token uuid,p_error text default null,p_retry_at timestamptz default null,p_terminal boolean default false)
returns boolean language plpgsql security definer set search_path=public as $$
declare job public.echo_clickup_sync_jobs%rowtype;
begin
  select * into job from public.echo_clickup_sync_jobs where id=p_job_id and state='running' and claim_token=p_claim_token for update;
  if not found then return false; end if;
  if p_error is null then
    update public.echo_clickup_sync_jobs set state='queued',next_attempt_at=now(),lease_until=null,claim_token=null,claim_generation=null,updated_at=now() where id=p_job_id;
  else
    update public.echo_clickup_sync_run_targets set state=case when p_terminal or job.attempts+1>=12 then 'failed' else 'queued' end,
      last_error=left(p_error,300),updated_at=now()
      where scope_key=job.scope_key and list_id=job.list_id and generation=job.claim_generation and state in ('queued','running');
    update public.echo_clickup_sync_jobs set state=case when p_terminal or attempts+1>=12 then 'failed' else 'retry' end,
      next_attempt_at=coalesce(p_retry_at,now()+make_interval(secs=>least(900,15*(2^least(attempts,6))::integer))),
      attempts=attempts+1,last_error=left(p_error,300),lease_until=null,claim_token=null,claim_generation=null,updated_at=now() where id=p_job_id;
    update public.echo_clickup_sync_runs r set failed_targets=(select count(*) from public.echo_clickup_sync_run_targets t where t.run_id=r.id and t.state='failed'),
      state=case when exists(select 1 from public.echo_clickup_sync_run_targets t where t.run_id=r.id and t.state='running') then 'running'
        when exists(select 1 from public.echo_clickup_sync_run_targets t where t.run_id=r.id and t.state='queued') then 'queued' else 'partial' end,
      finished_at=case when exists(select 1 from public.echo_clickup_sync_run_targets t where t.run_id=r.id and t.state in ('queued','running')) then null else now() end
      where r.id in (select run_id from public.echo_clickup_sync_run_targets where scope_key=job.scope_key and list_id=job.list_id and generation=job.claim_generation and state in ('queued','failed'));
  end if;
  return true;
end $$;

revoke all on function public.echo_enqueue_clickup_sync_run(text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.echo_claim_clickup_sync_jobs_v2(integer) from public,anon,authenticated;
revoke all on function public.echo_stage_clickup_sync_page_v2(bigint,uuid,bigint,jsonb,integer,boolean,timestamptz,boolean) from public,anon,authenticated;
revoke all on function public.echo_release_clickup_sync_claim_v2(bigint,uuid,text,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.echo_enqueue_clickup_sync_run(text,text,text,jsonb) to service_role;
grant execute on function public.echo_claim_clickup_sync_jobs_v2(integer) to service_role;
grant execute on function public.echo_stage_clickup_sync_page_v2(bigint,uuid,bigint,jsonb,integer,boolean,timestamptz,boolean) to service_role;
grant execute on function public.echo_release_clickup_sync_claim_v2(bigint,uuid,text,timestamptz,boolean) to service_role;

create extension if not exists pg_cron;
create extension if not exists pg_net;
create table if not exists public.echo_clickup_worker_auth (
  id boolean primary key default true check (id),
  secret_hash bytea not null,
  updated_at timestamptz not null default now()
);
alter table public.echo_clickup_worker_auth enable row level security;
revoke all on public.echo_clickup_worker_auth from public,anon,authenticated,service_role;

do $$
declare worker_secret text;
begin
  if not exists(select 1 from vault.decrypted_secrets where name='mosaic_clickup_worker_bearer') then
    worker_secret:=gen_random_uuid()::text||gen_random_uuid()::text;
    insert into public.echo_clickup_worker_auth(id,secret_hash) values(true,extensions.digest(worker_secret,'sha256'))
      on conflict(id) do update set secret_hash=excluded.secret_hash,updated_at=now();
    perform vault.create_secret(worker_secret,'mosaic_clickup_worker_bearer');
  end if;
  if not exists(select 1 from vault.decrypted_secrets where name='mosaic_clickup_worker_url') then
    perform vault.create_secret('https://mosaic-workspace.online','mosaic_clickup_worker_url');
  end if;
end $$;

create or replace function public.echo_verify_clickup_worker_secret(p_secret text)
returns boolean language sql security definer set search_path=public,extensions as $$
  select exists(select 1 from public.echo_clickup_worker_auth where id=true and secret_hash=extensions.digest(coalesce(p_secret,''),'sha256'))
$$;
revoke all on function public.echo_verify_clickup_worker_secret(text) from public,anon,authenticated;
grant execute on function public.echo_verify_clickup_worker_secret(text) to service_role;

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname='mosaic-clickup-sync-worker';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule('mosaic-clickup-sync-worker','* * * * *', $job$
    select net.http_get(
      url:=(select decrypted_secret from vault.decrypted_secrets where name='mosaic_clickup_worker_url')||'/api/cron/clickup-sync',
      headers:=jsonb_build_object('x-clickup-worker-key',(select decrypted_secret from vault.decrypted_secrets where name='mosaic_clickup_worker_bearer')),
      timeout_milliseconds:=60000
    );
  $job$);
end $$;
