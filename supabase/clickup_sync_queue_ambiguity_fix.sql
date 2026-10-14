-- Fix PL/pgSQL name collisions that caused enqueue RPCs and scheduled claims to fail.
create or replace function public.echo_enqueue_clickup_sync_run(
  p_scope_key text,
  p_user_id text,
  p_trigger text,
  p_targets jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid;
  v_target jsonb;
  v_list_id text;
  v_list_label text;
  v_target_generation bigint;
  v_target_count integer := 0;
begin
  if p_trigger not in ('manual','webhook','scheduled','write') or jsonb_typeof(p_targets) <> 'array' then
    raise exception 'invalid sync request';
  end if;
  if not exists (
    select 1 from public.echo_clickup_connections connection
    where connection.scope_key = p_scope_key and connection.user_id = p_user_id
  ) then
    raise exception 'ClickUp connection ownership mismatch';
  end if;

  insert into public.echo_clickup_sync_runs(scope_key,user_id,trigger,state)
  values(p_scope_key,p_user_id,p_trigger,'queued') returning id into v_run_id;

  for v_target in select value from jsonb_array_elements(p_targets) loop
    v_list_id := v_target->>'id';
    v_list_label := left(coalesce(nullif(v_target->>'label',''),v_list_id),120);
    if coalesce(v_list_id,'') !~ '^[0-9]{4,24}$' then continue; end if;

    insert into public.echo_clickup_sync_jobs(scope_key,user_id,list_id,state,next_attempt_at,attempts,last_error)
    values(p_scope_key,p_user_id,v_list_id,'queued',now(),0,null)
    on conflict(scope_key,list_id) do update set
      requested_generation = public.echo_clickup_sync_jobs.requested_generation + 1,
      state = case when public.echo_clickup_sync_jobs.state = 'running' then 'running' else 'queued' end,
      next_attempt_at = case when public.echo_clickup_sync_jobs.state = 'running' then public.echo_clickup_sync_jobs.next_attempt_at else now() end,
      attempts = case when public.echo_clickup_sync_jobs.state = 'failed' then 0 else public.echo_clickup_sync_jobs.attempts end,
      last_error = null, updated_at = now()
    returning requested_generation into v_target_generation;

    insert into public.echo_clickup_sync_run_targets(run_id,scope_key,list_id,list_label,generation)
    values(v_run_id,p_scope_key,v_list_id,v_list_label,v_target_generation)
    on conflict(run_id,list_id) do nothing;

    insert into public.echo_clickup_task_tombstones(scope_key,list_id,record_id,generation)
    select p_scope_key,v_list_id,deleted.task_id,v_target_generation
    from jsonb_array_elements_text(coalesce(v_target->'deletedTaskIds','[]'::jsonb)) as deleted(task_id)
    on conflict(scope_key,list_id,record_id) do update
      set generation = excluded.generation, created_at = now();

    delete from public.echo_clickup_task_tombstones tombstone
    where tombstone.scope_key = p_scope_key and tombstone.list_id = v_list_id
      and tombstone.record_id in (
        select changed.task_id
        from jsonb_array_elements_text(coalesce(v_target->'changedTaskIds','[]'::jsonb)) as changed(task_id)
      );
    v_target_count := v_target_count + 1;
  end loop;

  update public.echo_clickup_sync_runs sync_run
  set requested_targets = v_target_count,
      state = case when v_target_count = 0 then 'failed' else 'queued' end,
      finished_at = case when v_target_count = 0 then now() else null end
  where sync_run.id = v_run_id;
  return v_run_id;
end;
$$;

create or replace function public.echo_claim_clickup_sync_jobs_v2(p_limit integer default 2)
returns table(id bigint,scope_key text,user_id text,list_id text,encrypted_token text,claim_token uuid,generation bigint,progress_page integer,last_synced_at timestamptz,last_full_sync_at timestamptz,run_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query with due as (
    select j.id from public.echo_clickup_sync_jobs j
    where ((j.state in ('queued','retry') and j.next_attempt_at <= now())
      or (j.state = 'ready' and coalesce(j.last_full_sync_at,'-infinity'::timestamptz) < now() - interval '7 days')
      or (j.state = 'running' and j.lease_until < now()))
    order by j.next_attempt_at,j.scope_key,j.id
    for update skip locked limit least(greatest(p_limit,1),5)
  ), claimed as (
    update public.echo_clickup_sync_jobs j set state = 'running',
      lease_until = now() + interval '2 minutes', claim_token = gen_random_uuid(),
      claim_generation = greatest(j.completed_generation+1,j.requested_generation),
      progress_page = case when j.progress_generation is distinct from greatest(j.completed_generation+1,j.requested_generation) then 0 else j.progress_page end,
      progress_generation = greatest(j.completed_generation+1,j.requested_generation), updated_at = now()
    from due where j.id = due.id
    returning j.id,j.scope_key,j.user_id,j.list_id,j.claim_token,j.claim_generation,j.progress_page,j.last_synced_at,j.last_full_sync_at
  ), cleaned as (
    delete from public.echo_clickup_sync_staging s using claimed c
    where s.scope_key = c.scope_key and s.list_id = c.list_id and s.generation <> c.claim_generation
    returning s.record_id
  ), started_targets as (
    update public.echo_clickup_sync_run_targets target set state = 'running', updated_at = now()
    from claimed c
    where target.scope_key = c.scope_key and target.list_id = c.list_id
      and target.generation = c.claim_generation and target.state = 'queued'
    returning target.run_id
  ), started_runs as (
    update public.echo_clickup_sync_runs sync_run set state = 'running'
    where sync_run.id in (select started_targets.run_id from started_targets)
    returning sync_run.id
  )
  select c.id,c.scope_key,c.user_id,c.list_id,connection.encrypted_token,c.claim_token,c.claim_generation,c.progress_page,c.last_synced_at,c.last_full_sync_at,
    (select target.run_id from public.echo_clickup_sync_run_targets target
      where target.scope_key = c.scope_key and target.list_id = c.list_id
        and target.generation <= c.claim_generation and target.state in ('queued','running')
      order by target.generation desc limit 1)
  from claimed c join public.echo_clickup_connections connection on connection.scope_key = c.scope_key;
end;
$$;

revoke all on function public.echo_enqueue_clickup_sync_run(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.echo_enqueue_clickup_sync_run(text,text,text,jsonb) to service_role;
revoke all on function public.echo_claim_clickup_sync_jobs_v2(integer) from public,anon,authenticated;
grant execute on function public.echo_claim_clickup_sync_jobs_v2(integer) to service_role;
