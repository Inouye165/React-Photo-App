
# Lumina

Lumina is a full-stack photo app for uploading, browsing, and editing a personal photo library. It uses Supabase for auth/storage and an Express API for uploads and background processing. Some metadata enrichment is optional (OpenAI + LangGraph, and optional Google Places if you provide keys).

**Author:** Ron Inouye ([@Inouye165](https://github.com/Inouye165))

## What you can do

- Upload photos (including HEIC/HEIF) and browse them in a gallery.
- Open an edit page that shows derived metadata (EXIF, timestamps) and a map when GPS exists.
- Run background processing via a worker (thumbnails, EXIF extraction, optional AI enrichment).

![Edit page screenshot](docs/screenshots/edit_page.png)

## Tech stack (high level)

- Frontend: React + Vite + Tailwind, Zustand
- Backend: Node.js + Express
- Data: Postgres (Supabase or local) + Supabase Storage
- Jobs: BullMQ + Redis
- Image processing: Sharp + `heic-convert` fallback
- Tests: Vitest (web) + Jest (server) + Playwright (E2E)

## Architecture notes

The upload path is designed to avoid writing large files to server disk:

```
upload
  → stream to storage
  → enqueue background job
  → worker extracts EXIF, generates thumbnails
  → (optional) AI enrichment
```

The UI polls photo status while background work is running.

## Quick start (local dev)

### Prerequisites

- Node.js 20+ (see `engines`)
- Docker + docker-compose (recommended for local Postgres + Redis)

### Setup

```bash
# install deps
npm install
cd server && npm install && cd ..

# start local services (optional, but recommended)
docker-compose up -d db redis

# env
cp server/.env.example server/.env

# migrations
cd server && npx knex migrate:latest --knexfile knexfile.js && cd ..

# run (separate terminals)
npm run dev
cd server && npm start
cd server && npm run worker
```

Frontend: http://localhost:5173

Backend: http://localhost:3001

Notes:

- The worker is required for thumbnail generation and background enrichment.
- If Google Places keys are missing, Places-based enrichment is skipped.
- In non-test environments, the backend is configured to refuse startup if `OPENAI_API_KEY` is missing.

## Configuration

See `server/.env.example` for the full list. Commonly required values are:

- `DATABASE_URL` / `SUPABASE_DB_URL` (Postgres)
- `SUPABASE_URL` + `SUPABASE_ANON_KEY`
- `JWT_SECRET`
- `OPENAI_API_KEY` (required for non-test server startup)

## Security model (current behavior)

- API routes use Bearer tokens (`Authorization: Bearer <token>`) and do not support cookie auth.
- Image routes prefer signed URLs for `<img>` tags; they also support Bearer tokens.
- A deprecated cookie fallback exists for some image requests during transition and is intended to be removed.
- State-changing auth endpoints use Origin/Referer allowlisting.
- Supabase RLS is part of the data-isolation story when running against Supabase.

Security maintenance / secure coding notes:

- [docs/SECURITY_CODING_MAINTENANCE.md](docs/SECURITY_CODING_MAINTENANCE.md)
- [SECURITY_REMEDIATION_SUMMARY.md](SECURITY_REMEDIATION_SUMMARY.md)

## Docs

- [TESTING.md](TESTING.md)
- [docs/DEV.md](docs/DEV.md)
- [docs/ROADMAP.md](docs/ROADMAP.md)
- [server/README.md](server/README.md)

## License

MIT - see [LICENSE](LICENSE)