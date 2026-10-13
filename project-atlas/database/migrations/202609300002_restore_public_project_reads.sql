-- Preserve Atlas' existing public, read-only project browser while keeping writes server-side.
grant select on public.map_projects to anon, authenticated;
drop policy if exists map_projects_public_read on public.map_projects;
create policy map_projects_public_read
  on public.map_projects
  for select
  to anon, authenticated
  using (true);
