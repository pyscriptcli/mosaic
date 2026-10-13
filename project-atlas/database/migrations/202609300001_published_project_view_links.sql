create table if not exists public.project_view_links (
  project_id text primary key,
  token text not null unique check (token ~ '^[a-f0-9]{64}$'),
  project_name text not null,
  snapshot jsonb not null,
  navigation jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists project_view_links_active_token_idx
  on public.project_view_links(token) where revoked_at is null;

alter table public.project_view_links enable row level security;
revoke all on public.project_view_links from public, anon, authenticated;
grant all on public.project_view_links to service_role;

-- Browser clients must not bypass the signed editor session through the public key.
alter table public.map_projects enable row level security;
revoke all on public.map_projects from public, anon, authenticated;
grant all on public.map_projects to service_role;
