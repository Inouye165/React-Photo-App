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