# Project Atlas

Project Atlas is a map workspace for exploring places, drawing areas, and reviewing saved location data. The repository is arranged around three things people come here to work on: the screens people use, the services that support them, and the saved project data.

## Where things live

```text
frontend/
  atlas-app/              The map editor and workspace
  kopi-saigon/            The read-only Kopi Saigon map viewer

backend/
  spatial-services/       Place search, routes, and map analysis

database/
  migrations/             Changes to saved project data and access

package.json             Shared install and run commands
```

The Atlas and Kopi Saigon web apps each keep their pages, images, and app settings together. The Python map services live separately. Database changes are kept together so they are easy to review before applying them.

## Start Atlas

From the repository root:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Start the Kopi Saigon viewer

```bash
npm run dev:kopi-viewer
```

The viewer runs separately from the editor. Its deployment root is `frontend/kopi-saigon`.

## Start the map services

```bash
cd backend/spatial-services
python -m venv .venv
```

Activate the environment, then install and start the service:

```powershell
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python run.py
```

On macOS or Linux, activate it with `source .venv/bin/activate` instead. The service is available at [http://localhost:8000](http://localhost:8000), with its interactive reference page at [http://localhost:8000/docs](http://localhost:8000/docs).

## Saved data

Atlas saves workspaces in Supabase. The SQL files in `database/migrations` describe changes to those saved workspaces and access rules. Review and apply them to the Supabase project in timestamp order.

## Configuration

Copy `frontend/atlas-app/.env.example` to `frontend/atlas-app/.env.local` for the map editor. The Kopi Saigon viewer has its own `.env.example`. Keep real credentials in local environment files; they are ignored by Git.
