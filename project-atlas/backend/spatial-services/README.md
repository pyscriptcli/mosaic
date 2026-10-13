# Map Services

This service supports the Atlas workspace with place data, road routes, and travel-area analysis.

## Run locally

From this folder, create a Python virtual environment and install the service packages:

```bash
python -m venv .venv
```

Activate the environment, then install and start the service:

```powershell
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python run.py
```

On macOS or Linux, activate it with `source .venv/bin/activate` instead.

The service runs at `http://localhost:8000`; its interactive reference page is at `/docs`.

## Run with Docker

From the repository root:

```bash
docker build -t atlas-map-services backend/spatial-services
docker run --rm -p 8000:8000 atlas-map-services
```
