# Installation Troubleshooting

- If you see dependency errors (e.g., ERESOLVE), use:
    ```bash
    npm install --legacy-peer-deps
    ```
- If you see missing package errors (e.g., 'Cannot find module'), run:
    ```bash
    npm install <package> --legacy-peer-deps
    ```
- Always check that all required environment variables are set in your `.env` file (copy from `.env.example`).

# Dependency Verification

All backend dependencies are listed in `server/package.json`. If you encounter a missing package error, please open an issue or PR to add it.
# Photo App Server

Backend server for the React Photo App that handles file uploads and saves photos to a local working directory.

## Setup

1. Install dependencies:
```bash
cd server
npm install
```

2. Start the server:
```bash
npm start
```

Or for development with auto-restart:
```bash
npm run dev
```

## Configuration

- **Port**: Default 3001 (set PORT environment variable to change)
- **Working Directory**: Default `C:/Users/<username>/working` (set PHOTO_WORKING_DIR environment variable to change)
- **File Size Limit**: 50MB per file
- **Supported Formats**: All image MIME types

## API Endpoints

- `POST /upload` - Upload a photo file
- `GET /health` - Health check and server status

## Features

- Automatic working directory creation
- Duplicate filename handling (adds counter)
- CORS enabled for localhost:5173
- File size and type validation
- Preserves original file metadata

## Asynchronous AI Processing

This project uses **BullMQ** and a **Redis** server to process all long-running AI tasks in the background. This ensures the API remains fast and responsive.

### Local Development

1.  **Start Redis:** You must have a Redis server running. The easiest way is with Docker:
    ```bash
    docker run -d -p 6379:6379 redis
    ```
2.  **Start the Web Server:**
    ```bash
    npm run dev
    ```
3.  **Start the Worker (in a separate terminal):**
    ```bash
    npm run dev:worker
    ```

You must have both the web server and the worker running for the application to be fully functional.

## Environment Variables

This server requires a `.env` file located in the `/server` directory. Copy `server/.env.example` to `server/.env` and fill in your own values. Do NOT commit `server/.env` to source control.

```text
# --- Environment ---
# Set to 'production' for production, 'development' or 'test' otherwise
NODE_ENV=development

# --- Server ---
# Port the Express server will run on
PORT=3001
# The URL of the frontend client for CORS
CLIENT_ORIGIN=http://localhost:5173

# --- Authentication ---
# A strong, random string used to sign JWTs
JWT_SECRET=your_super_secret_jwt_string
# How long tokens should last (e.g., "24h", "1d", "30m")
JWT_EXPIRES_IN=24h

# --- Supabase (Database & Storage) ---
# Your Supabase project URL
SUPABASE_URL=https://your-project-id.supabase.co
# Your Supabase project's public anon key
SUPABASE_ANON_KEY=your_public_anon_key
# Your Supabase project's service role key (for server-side admin tasks)
SUPABASE_SERVICE_ROLE_KEY=your_secret_service_role_key

# --- AI Services ---
# Your OpenAI API key for image analysis
OPENAI_API_KEY=sk-your_openai_api_key

# --- Debugging ---
# Set to 'true' in development to allow unauthenticated access to debug routes
ALLOW_DEV_DEBUG=true
```