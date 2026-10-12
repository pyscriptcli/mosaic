-- Replace provisional Mosaic task ids and links in staged views after ClickUp
-- accepts the create request. The staged record remains the durable read model.
create or replace function public.echo_complete_mosaic_sync_write(p_job_id bigint,p_clickup_id text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  q public.mosaic_sync_outbox%rowtype;
  resolved_clickup_id text;
  task_url text;
begin
  update public.mosaic_sync_outbox
    set state='synced',clickup_id=coalesce(p_clickup_id,clickup_id),lease_until=null,last_error=null,updated_at=now()
    where id=p_job_id and state='running' returning * into q;
  if not found then raise exception 'sync lease is no longer valid'; end if;

  resolved_clickup_id := coalesce(p_clickup_id, q.clickup_id, q.record_id);
  task_url := 'https://app.clickup.com/t/' || resolved_clickup_id;
  update public.mosaic_staged_records
    set sync_state='synced',
      clickup_id=coalesce(p_clickup_id,clickup_id),
      record_data=case when q.operation='delete' then record_data else
        jsonb_set(
          case when record_data ? 'url' then jsonb_set(record_data,'{url}',to_jsonb(task_url),true) else record_data end,
          '{id}',to_jsonb(resolved_clickup_id),true
        )
      end,
      last_sync_error=null,
      updated_at=now(),
      is_deleted=(q.operation='delete')
    where scope_key=q.scope_key and domain=q.domain and record_id=q.record_id;

  update public.mosaic_staged_records
    set record_data=case
      when record_data ? 'clickUpUrl' then jsonb_set(
        case when record_data ? 'clickUpTaskId' then jsonb_set(record_data,'{clickUpTaskId}',to_jsonb(resolved_clickup_id),true) else record_data end,
        '{clickUpUrl}',to_jsonb(task_url),true)
      when record_data ? 'clickUpTaskId' then jsonb_set(record_data,'{clickUpTaskId}',to_jsonb(resolved_clickup_id),true)
      else record_data end,
      updated_at=now()
    where scope_key=q.scope_key and domain=q.domain and record_id=q.record_id and q.operation<>'delete';
end;
$$;

revoke all on function public.echo_complete_mosaic_sync_write(bigint,text) from public,anon,authenticated;
grant execute on function public.echo_complete_mosaic_sync_write(bigint,text) to service_role;
