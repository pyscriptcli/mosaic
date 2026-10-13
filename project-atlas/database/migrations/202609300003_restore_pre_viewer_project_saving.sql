-- Roll back the viewer-link database changes and restore Atlas's previous
-- browser-based project persistence, which uses the public Supabase key.
drop table if exists public.project_view_links;

alter table public.map_projects disable row level security;
grant select, insert, update, delete on table public.map_projects to anon, authenticated;
