alter table public.map_projects
  add column if not exists workspace_type text not null default 'standalone',
  add column if not exists mosaic_project_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.map_projects'::regclass
      and conname = 'map_projects_workspace_scope_check'
  ) then
    alter table public.map_projects
      add constraint map_projects_workspace_scope_check
      check (
        (workspace_type = 'mosaic_project' and mosaic_project_id is not null and length(trim(mosaic_project_id)) > 0)
        or (workspace_type in ('standalone', 'mosaic') and mosaic_project_id is null)
      );
  end if;
end
$$;

create index if not exists map_projects_workspace_scope_updated_at_idx
  on public.map_projects (workspace_type, mosaic_project_id, updated_at desc);

create unique index if not exists map_projects_one_per_mosaic_project_idx
  on public.map_projects (mosaic_project_id)
  where workspace_type = 'mosaic_project';
