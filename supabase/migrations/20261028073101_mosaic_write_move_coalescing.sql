alter table public.mosaic_sync_outbox
  add column if not exists coalesced_count integer not null default 0;

create or replace function public.echo_stage_mosaic_request(
  p_request_id uuid, p_owner_user_id text, p_scope_key text, p_domain text, p_record_id text,
  p_list_id text, p_record_data jsonb, p_operation text, p_http_method text,
  p_resource_path text, p_request_body jsonb
) returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare staged_job_id bigint;
begin
  if coalesce(trim(p_owner_user_id), '') = '' or coalesce(trim(p_scope_key), '') = '' then raise exception 'owner and ClickUp scope are required'; end if;
  if p_operation not in ('create','update','delete') then raise exception 'unsupported operation'; end if;
  if p_http_method not in ('POST','PUT','DELETE') then raise exception 'unsupported HTTP method'; end if;
  if p_resource_path !~ '^/(task/[A-Za-z0-9_-]+(/(field/[A-Za-z0-9_-]+|tag(/private)?|comment))?|list/[0-9]+/task(/[A-Za-z0-9_-]+)?|space/[0-9]+/list)$' then raise exception 'unsupported ClickUp resource path'; end if;
  if p_domain !~ '^[a-z][a-z0-9_-]{0,63}$' or p_record_id = '' then raise exception 'invalid record identity'; end if;

  insert into public.mosaic_staged_records(owner_user_id,scope_key,domain,record_id,list_id,record_data,sync_state,is_deleted,last_sync_error,updated_at)
  values (p_owner_user_id,p_scope_key,p_domain,p_record_id,nullif(p_list_id,''),coalesce(p_record_data,'{}'::jsonb),'pending',p_operation='delete',null,now())
  on conflict(scope_key,domain,record_id) do update set owner_user_id=excluded.owner_user_id,
    list_id=coalesce(excluded.list_id,public.mosaic_staged_records.list_id),record_data=excluded.record_data,
    sync_state='pending',is_deleted=excluded.is_deleted,last_sync_error=null,updated_at=now();

  select id into staged_job_id from public.mosaic_sync_outbox where request_id=p_request_id;
  if staged_job_id is not null then return staged_job_id; end if;

  with candidate as (
    select id from public.mosaic_sync_outbox
    where scope_key=p_scope_key and domain=p_domain and record_id=p_record_id
      and state='queued' and attempts=0
    order by id desc for update skip locked limit 1
  )
  update public.mosaic_sync_outbox q set request_id=p_request_id,owner_user_id=p_owner_user_id,
    operation=p_operation,http_method=p_http_method,resource_path=p_resource_path,
    request_body=coalesce(p_request_body,'{}'::jsonb),next_attempt_at=now(),last_error=null,
    coalesced_count=q.coalesced_count+1,updated_at=now()
  from candidate where q.id=candidate.id returning q.id into staged_job_id;
  if staged_job_id is not null then return staged_job_id; end if;

  insert into public.mosaic_sync_outbox(request_id,owner_user_id,scope_key,domain,record_id,operation,http_method,resource_path,request_body,state,next_attempt_at)
  values (p_request_id,p_owner_user_id,p_scope_key,p_domain,p_record_id,p_operation,p_http_method,p_resource_path,coalesce(p_request_body,'{}'::jsonb),'queued',now())
  on conflict(request_id) do nothing returning id into staged_job_id;
  if staged_job_id is null then select id into staged_job_id from public.mosaic_sync_outbox where request_id=p_request_id; end if;
  return staged_job_id;
end;
$$;

revoke all on function public.echo_stage_mosaic_request(uuid,text,text,text,text,text,jsonb,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.echo_stage_mosaic_request(uuid,text,text,text,text,text,jsonb,text,text,text,jsonb) to service_role;
