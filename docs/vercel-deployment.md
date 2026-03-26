# Vercel Deployment

## Architecture

- Frontend: Vite static build served by Vercel
- Backend: FastAPI served by `api/index.py` through Vercel Python functions
- Database: external PostgreSQL such as Neon, Supabase, or Vercel Postgres

## Required Vercel Environment Variables

Set these in the Vercel project settings:

```env
OPENROUTER_API_KEY=...
MODEL=google/gemini-3-flash-preview
ENABLE_DATABASE=true
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:PORT/DBNAME
ROLLUP_IDLE_INTERVAL_SECONDS=0
CORS_ORIGINS=https://your-domain.vercel.app,https://your-custom-domain.com
```

Optional:

```env
UPLOAD_DIR=/tmp/cadence-ai-uploads
```

Notes:

- `ROLLUP_IDLE_INTERVAL_SECONDS=0` is recommended on Vercel because serverless functions should not run background loops.
- `UPLOAD_DIR` defaults to a temp directory automatically, so you usually do not need to set it.
- If your frontend and backend are served from the same Vercel project, CORS is mostly a safety fallback.

## First-Time Database Setup

Run these commands locally against the remote PostgreSQL database before or right after the first deploy:

```powershell
cd c:\Users\neuron\Desktop\cadence-ai\backend
$env:ENABLE_DATABASE="true"
$env:DATABASE_URL="postgresql+psycopg://USER:PASSWORD@HOST:PORT/DBNAME"
python -m db.init_db
python -m db.seed_mall
```

This will:

- create the schema
- seed the current mall baseline data

## Deploy Flow

1. Push the latest code to the Git branch connected to Vercel.
2. Confirm the Vercel deployment finishes successfully.
3. Verify the following URLs:
   - `/health`
   - homepage
   - chat flow
   - dining recommendation flow
   - any database-backed pages you rely on

## Common Failure Modes

### API deploy fails on Vercel

Check:

- root `requirements.txt` includes all backend dependencies
- `OPENROUTER_API_KEY` is set
- `DATABASE_URL` is valid

### App deploys but database-backed features do not work

Check:

- `ENABLE_DATABASE=true`
- remote schema has been initialized
- seed data has been written

### Upload and ingestion fail in production

Check:

- the deployment is using temp storage, not the source directory
- `UPLOAD_DIR` points to `/tmp/...` if you override it
