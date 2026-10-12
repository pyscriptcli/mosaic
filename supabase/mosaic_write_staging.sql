-- Durable Supabase-first staging for Mosaic records projected to ClickUp.
-- Existing domain-owned Supabase tables remain canonical where they already exist.
-- Media bytes must never be placed in these tables.

create table if not exists public.mosaic_staged_records (
  owner_user_id text not null,
  scope_key text not null,
  domain text not null,
  record_id text not null,
  list_id text,
  record_data jsonb not null default '{}'::jsonb,
  sync_state text not null default 'pending' check (sync_state in ('pending','synced','failed')),
  is_deleted boolean not null default false,
  clickup_id text,
  last_sync_error text,
  updated_at timestamptz not null default now(),
  primary key (scope_key, domain, record_id)
);
create index if not exists mosaic_staged_records_owner_updated on public.mosaic_staged_records (owner_user_id, updated_at desc);
create index if not exists mosaic_staged_records_pending on public.mosaic_staged_records (sync_state, updated_at desc) where sync_state <> 'synced';

create table if not exists public.mosaic_sync_outbox (
  id bigint generated always as identity primary key,
  request_id uuid not null unique,
  owner_user_id text not null,
  scope_key text not null,
  domain text not null,
  record_id text not null,
  operation text not null check (operation in ('create','update','delete')),
  http_method text not null default 'POST' check (http_method in ('POST','PUT','DELETE')),
  resource_path text not null check (resource_path ~ '^/(task/[A-Za-z0-9_-]+(/(field/[A-Za-z0-9_-]+|tag(/private)?|comment))?|list/[0-9]+/task(/[A-Za-z0-9_-]+)?|space/[0-9]+/list)$'),
  request_body jsonb not null default '{}'::jsonb,
  state text not null default 'queued' check (state in ('queued','running','retry','synced','failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  clickup_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (scope_key, domain, record_id) references public.mosaic_staged_records(scope_key, domain, record_id) on delete cascade
);
create index if not exists mosaic_sync_outbox_due on public.mosaic_sync_outbox (state, next_attempt_at, id) where state in ('queued','retry','running');
create index if not exists mosaic_sync_outbox_owner on public.mosaic_sync_outbox (owner_user_id, created_at desc);
create index if not exists mosaic_sync_outbox_record on public.mosaic_sync_outbox (scope_key, domain, record_id);

alter table public.mosaic_staged_records enable row level security;
alter table public.mosaic_sync_outbox enable row level security;
revoke all on public.mosaic_staged_records, public.mosaic_sync_outbox from public, anon, authenticated;
grant all on public.mosaic_staged_records, public.mosaic_sync_outbox to service_role;
grant usage, select on sequence public.mosaic_sync_outbox_id_seq to service_role;

create or replace function public.echo_stage_mosaic_write(
  p_request_id uuid, p_owner_user_id text, p_scope_key text, p_domain text, p_record_id text,
  p_list_id text, p_record_data jsonb, p_operation text, p_resource_path text, p_request_body jsonb
) returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare staged_job_id bigint;
begin
  if coalesce(trim(p_owner_user_id), '') = '' or coalesce(trim(p_scope_key), '') = '' then raise exception 'owner and ClickUp scope are required'; end if;
  if p_operation not in ('create','update','delete') then raise exception 'unsupported operation'; end if;
  if p_resource_path !~ '^/(task/[A-Za-z0-9_-]+|list/[0-9]+/task)$' then raise exception 'unsupported ClickUp resource path'; end if;
  if p_domain !~ '^[a-z][a-z0-9_-]{0,63}$' or p_record_id = '' then raise exception 'invalid record identity'; end if;

  insert into public.mosaic_staged_records(owner_user_id,scope_key,domain,record_id,list_id,record_data,sync_state,last_sync_error,updated_at)
  values (p_owner_user_id,p_scope_key,p_domain,p_record_id,nullif(p_list_id,''),coalesce(p_record_data,'{}'::jsonb),'pending',null,now())
  on conflict(scope_key,domain,record_id) do update set
    owner_user_id=excluded.owner_user_id,list_id=coalesce(excluded.list_id,public.mosaic_staged_records.list_id),
    record_data=excluded.record_data,sync_state='pending',is_deleted=(p_operation='delete'),last_sync_error=null,updated_at=now();

  insert into public.mosaic_sync_outbox(request_id,owner_user_id,scope_key,domain,record_id,operation,resource_path,request_body,state,next_attempt_at)
  values (p_request_id,p_owner_user_id,p_scope_key,p_domain,p_record_id,p_operation,p_resource_path,coalesce(p_request_body,'{}'::jsonb),'queued',now())
  on conflict(request_id) do nothing returning id into staged_job_id;
  if staged_job_id is null then select id into staged_job_id from public.mosaic_sync_outbox where request_id=p_request_id; end if;
  return staged_job_id;
end;
$$;

create or replace function public.echo_claim_mosaic_sync_writes(p_limit integer default 10)
returns table(id bigint,request_id uuid,owner_user_id text,scope_key text,domain text,record_id text,operation text,resource_path text,request_body jsonb,clickup_id text)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return query
  with due as (
    select q.id from public.mosaic_sync_outbox q
    where (q.state in ('queued','retry') and q.next_attempt_at <= now()) or (q.state='running' and q.lease_until < now())
    order by q.next_attempt_at,q.id for update skip locked limit least(greatest(p_limit,1),25)
  )
  update public.mosaic_sync_outbox q set state='running',attempts=q.attempts+1,lease_until=now()+interval '2 minutes',updated_at=now()
  from due where q.id=due.id
  returning q.id,q.request_id,q.owner_user_id,q.scope_key,q.domain,q.record_id,q.operation,q.resource_path,q.request_body,q.clickup_id;
end;
$$;

create or replace function public.echo_complete_mosaic_sync_write(p_job_id bigint,p_clickup_id text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare q public.mosaic_sync_outbox%rowtype;
begin
  update public.mosaic_sync_outbox set state='synced',clickup_id=coalesce(p_clickup_id,clickup_id),lease_until=null,last_error=null,updated_at=now()
  where id=p_job_id and state='running' returning * into q;
  if not found then raise exception 'sync lease is no longer valid'; end if;
  update public.mosaic_staged_records set sync_state='synced',clickup_id=coalesce(p_clickup_id,clickup_id),last_sync_error=null,updated_at=now()
    ,is_deleted=(q.operation='delete')
  where scope_key=q.scope_key and domain=q.domain and record_id=q.record_id;
end;
$$;

create or replace function public.echo_fail_mosaic_sync_write(p_job_id bigint,p_error text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare failed_row public.mosaic_sync_outbox%rowtype;
begin
  update public.mosaic_sync_outbox set state=case when attempts >= 12 or coalesce(p_error,'') like '[permanent]%' then 'failed' else 'retry' end,
    next_attempt_at=now()+make_interval(secs => least(21600, 15 * (2 ^ least(attempts,10))::integer)),
    lease_until=null,last_error=left(coalesce(p_error,'ClickUp sync failed'),1000),updated_at=now()
  where id=p_job_id and state='running' returning * into failed_row;
  if not found then return; end if;
  update public.mosaic_staged_records set sync_state=case when failed_row.attempts >= 12 or coalesce(failed_row.last_error,'') like '[permanent]%' then 'failed' else 'pending' end,
    last_sync_error=left(coalesce(p_error,'ClickUp sync failed'),1000),updated_at=now()
  where scope_key=failed_row.scope_key and domain=failed_row.domain and record_id=failed_row.record_id;
end;
$$;

revoke all on function public.echo_stage_mosaic_write(uuid,text,text,text,text,text,jsonb,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.echo_claim_mosaic_sync_writes(integer) from public,anon,authenticated;
revoke all on function public.echo_complete_mosaic_sync_write(bigint,text) from public,anon,authenticated;
revoke all on function public.echo_fail_mosaic_sync_write(bigint,text) from public,anon,authenticated;
grant execute on function public.echo_stage_mosaic_write(uuid,text,text,text,text,text,jsonb,text,text,jsonb) to service_role;
grant execute on function public.echo_claim_mosaic_sync_writes(integer) to service_role;
grant execute on function public.echo_complete_mosaic_sync_write(bigint,text) to service_role;
grant execute on function public.echo_fail_mosaic_sync_write(bigint,text) to service_role;

-- The request form stores the original HTTP verb separately because several ClickUp
-- task updates use POST (custom fields) rather than PUT.
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

  insert into public.mosaic_sync_outbox(request_id,owner_user_id,scope_key,domain,record_id,operation,http_method,resource_path,request_body,state,next_attempt_at)
  values (p_request_id,p_owner_user_id,p_scope_key,p_domain,p_record_id,p_operation,p_http_method,p_resource_path,coalesce(p_request_body,'{}'::jsonb),'queued',now())
  on conflict(request_id) do nothing returning id into staged_job_id;
  if staged_job_id is null then select id into staged_job_id from public.mosaic_sync_outbox where request_id=p_request_id; end if;
  return staged_job_id;
end;
$$;

create or replace function public.echo_claim_mosaic_sync_requests(p_limit integer default 10)
returns table(id bigint,request_id uuid,owner_user_id text,scope_key text,domain text,record_id text,operation text,http_method text,resource_path text,request_body jsonb,clickup_id text,attempts integer)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return query
  with due as (
    select q.id from public.mosaic_sync_outbox q
    where ((q.state in ('queued','retry') and q.next_attempt_at <= now()) or (q.state='running' and q.lease_until < now()))
      and not exists (
        select 1 from public.mosaic_sync_outbox older
        where older.scope_key=q.scope_key and older.domain=q.domain and older.record_id=q.record_id
          and older.id<q.id and older.state in ('queued','retry','running')
      )
    order by q.next_attempt_at,q.id for update skip locked limit least(greatest(p_limit,1),25)
  )
  update public.mosaic_sync_outbox q set state='running',attempts=q.attempts+1,lease_until=now()+interval '2 minutes',updated_at=now()
  from due where q.id=due.id
  returning q.id,q.request_id,q.owner_user_id,q.scope_key,q.domain,q.record_id,q.operation,q.http_method,q.resource_path,q.request_body,q.clickup_id,q.attempts;
end;
$$;

revoke all on function public.echo_stage_mosaic_request(uuid,text,text,text,text,text,jsonb,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.echo_claim_mosaic_sync_requests(integer) from public,anon,authenticated;
grant execute on function public.echo_stage_mosaic_request(uuid,text,text,text,text,text,jsonb,text,text,text,jsonb) to service_role;
grant execute on function public.echo_claim_mosaic_sync_requests(integer) to service_role;
