-- Cover the staged-record foreign key so record cleanup and joins stay indexed.
create index if not exists mosaic_sync_outbox_record
  on public.mosaic_sync_outbox (scope_key, domain, record_id);
