-- Return the incremented attempt count so task-create retries can be deduplicated
-- against ClickUp before a second POST is attempted.
drop function if exists public.echo_claim_mosaic_sync_requests(integer);
create function public.echo_claim_mosaic_sync_requests(p_limit integer default 10)
returns table(id bigint,request_id uuid,owner_user_id text,scope_key text,domain text,record_id text,
  operation text,http_method text,resource_path text,request_body jsonb,clickup_id text,attempts integer)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return query
  with due as (
    select q.id from public.mosaic_sync_outbox q
    where ((q.state in ('queued','retry') and q.next_attempt_at <= now()) or (q.state='running' and q.lease_until < now()))
      and not exists (select 1 from public.mosaic_sync_outbox older
        where older.scope_key=q.scope_key and older.domain=q.domain and older.record_id=q.record_id
          and older.id<q.id and older.state in ('queued','retry','running'))
    order by q.next_attempt_at,q.id for update skip locked limit least(greatest(p_limit,1),25)
  )
  update public.mosaic_sync_outbox q set state='running',attempts=q.attempts+1,lease_until=now()+interval '2 minutes',updated_at=now()
  from due where q.id=due.id
  returning q.id,q.request_id,q.owner_user_id,q.scope_key,q.domain,q.record_id,q.operation,q.http_method,q.resource_path,q.request_body,q.clickup_id,q.attempts;
end;
$$;
revoke all on function public.echo_claim_mosaic_sync_requests(integer) from public,anon,authenticated;
grant execute on function public.echo_claim_mosaic_sync_requests(integer) to service_role;
