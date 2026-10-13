# KOPI SAIGON Competitor Viewer

Standalone, read-only presentation for the KOPI SAIGON project in Atlas. It lives in its own folder so it can be deployed separately from the Atlas editor.

## Deploy to Vercel

Create a new Vercel project connected to this repository and set **Root Directory** to `frontend/kopi-saigon`. The app loads only the KOPI SAIGON project from the existing Supabase `map_projects` table and does not include editing or save controls. Add these environment variables if the Atlas defaults are not suitable:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

After deployment, assign `kopi.saigon.competitorscheck.vercel.app` in Vercel's Domains settings. Apply `database/migrations/202609300003_restore_pre_viewer_project_saving.sql` from the repository root to restore the project-table read permission used by this viewer as well as Atlas editing.

Navigation is generated from the project's saved search-area labels and place categories, alongside an Overview. The viewer polls the same project every 15 seconds so edits saved in Atlas appear without reloading. Basemap, saved camera, layer visibility, and project features follow the current Atlas project. Atlas remains the only place to edit project data.

## Local development

From the repository root, run `npm install`, then `npm run dev:kopi-viewer`. The viewer uses Atlas's public Supabase project/key defaults unless overridden in `.env.local` using `.env.example` as a guide.
