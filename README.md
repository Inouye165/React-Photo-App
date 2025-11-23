# Quick Start

## Security headers (Helmet)

This app uses [Helmet](https://helmetjs.github.io/) to set HTTP security headers for the Express backend. Helmet helps protect against XSS, clickjacking, and MIME-sniffing attacks by setting Content Security Policy (CSP), X-Frame-Options, Referrer-Policy, and other headers.

- **Where:** Helmet is mounted early in the Express app (see `server/server.js`), before routes and static files.
- **CSP:** The Content Security Policy is strict in production, but slightly looser in development to support hot-reload and local API/image proxying.
- **Headers set:**
   - `Content-Security-Policy` (CSP)
   - `X-Content-Type-Options: nosniff`
   - `Referrer-Policy: no-referrer`
   - `X-Frame-Options: SAMEORIGIN` or via CSP `frame-ancestors 'none'`
- **How to verify:**
   - Run backend tests: `cd server && npm test -- tests/security.test.js -i`
   - Or start the server and inspect headers on any route (e.g., `/health`).
   - See `server/tests/security.test.js` for automated header checks.

**Dev note:** If CSP blocks frontend hot-reload or local API calls in development, adjust the CSP in `server/middleware/security.js` (see comments) or set `NODE_ENV=development`.

For more details and a full log of the enablement process, see `HELMET_ENABLE_LOG.md`.

---

## Engineering Log

See `PROBLEM_LOG.md` for a chronological log of major bugs or problems found during the development, with root cause, solution, and learnings. This log helps current and future devs troubleshoot more efficiently and avoid prior mistakes.

---

1. Clone the repository:
   ```bash
   git clone https://github.com/Inouye165/React-Photo-App.git
   cd React-Photo-App
   ```


3. Install backend dependencies:
   ```bash
   cd server
   npm install --legacy-peer-deps
   cd ..
   ```

4. Copy `.env.example` to `.env` in both the root and `server/` directories and fill in all required values.
   **Note:** You must configure a Postgres database (e.g., Supabase) in `server/.env`. The application requires Postgres and does not support SQLite.

5. Start the backend:
   ```bash
   cd server
   npm start
   ```

6. Start the frontend (in a new terminal):
   ```bash
   npm run dev
   ```

# Troubleshooting

- **Migrations failing on start:** The application requires a Postgres database. Ensure `SUPABASE_DB_URL` is set correctly in `server/.env`. SQLite is not supported.
-
- **Dependency errors:** If you see errors about conflicting dependencies (e.g., ERESOLVE), always use `npm install --legacy-peer-deps`.
- **Missing libraries:** If you see errors like "Cannot find module 'zustand'" or '@supabase/supabase-js', run `npm install <package> --legacy-peer-deps` in the correct directory (root for frontend, `server/` for backend).
- **Missing environment variables:** If you see errors about missing environment variables, ensure you have copied `.env.example` to `.env` and filled in all required values in both root and `server/`.
- **Wrong install directory:** Always run frontend installs in the project root and backend installs in the `server/` directory.
- **ImageMagick not found:** Make sure ImageMagick is installed and available in your system PATH for HEIC/HEIF fallback support.

# Dependency Verification

All required libraries are listed in the appropriate `package.json` files:
- Frontend dependencies: `package.json` (project root)
- Backend dependencies: `server/package.json`


   ## 🔐 Security Configuration

   **CRITICAL: Your Supabase storage bucket MUST be private.**

   This application is designed to be secure by serving all images and thumbnails through a server-side authentication endpoint (`/display/...`). This ensures that only logged-in users can access photos.

   ### Centralized Log Redaction (2025)

   **All server logs are automatically redacted to prevent accidental leakage of secrets, tokens, passwords, or API keys.**
   - Sensitive keys (`token`, `password`, `secret`, `authorization`, `apiKey`, `access_token`, `refresh_token`) are masked in all logs, including query parameters, headers, and deeply nested JSON objects.
   - The redaction is enforced at the logger and global `console` level, so even direct `console.log` or middleware logs are sanitized.
   - See `server/logger.js` for implementation and `server/tests/logs.redaction.test.js` for regression tests.
   - **No action is required by developers or operators.**
   - This closes the P0 vulnerability where tokens could leak via query params in logs (see `server/middleware/imageAuth.js`).

   **How to verify:**
   - Run: `cd server && npm test tests/logs.redaction.test.js`
   - Manually check logs for any sensitive data after requests with tokens or secrets in URLs or payloads.

   **This feature is now complete and enforced by default.**

   If your Supabase **`photos`** storage bucket is left "Public", it creates a major security hole that allows anyone on the internet to access your photos if they guess the URL, bypassing all application-level security.

   **How to Fix:**
   1.  Go to your project's dashboard at **Supabase.com**.
   2.  Navigate to the **Storage** section.
   3.  Find your **`photos`** bucket and click **"Edit bucket"**.
   4.  Ensure the **"Public bucket"** toggle is **OFF** (unchecked).
   5.  Save your changes.

   The application will work correctly *only* when the bucket is private.

    ### Developer Hooks & CI secret-scan

    To prevent accidental credential leaks, the repository includes a lightweight secret-scan and a pre-commit hook.

    - Install dev hooks locally (one-time):

       ```powershell
       # from project root (Windows PowerShell)
       npm install --legacy-peer-deps
       npm run prepare
       ```

    - What this does:
       - Installs Husky hooks so the `scripts/secret-scan.cjs` runs on every commit and blocks commits that match common secret patterns (OpenAI, Supabase, AWS, GitHub tokens, private key blocks).
       - CI also runs the same secret-scan on PRs to `main` to catch leaks before merge.

    - If the secret-scan flags a false positive you can:
       1. Inspect the staged changes and remove the sensitive value before committing.
       2. Use an environment variable or `.env` (never commit `.env`) instead of inlining secrets.

    - NOTE: If any keys have already been committed or pushed, rotate them immediately. See `SECRET_ROTATION.md` for a short checklist.

If you encounter a missing package error, please open an issue or PR to add it to the correct `package.json`.

# Environment Variables

# React Photo Filtering App

[![Tests](https://img.shields.io/badge/tests-86%20passing-brightgreen.svg)](https://github.com/Inouye165/React-Photo-App)
[![Security](https://img.shields.io/badge/security-JWT%20Auth-blue.svg)](https://jwt.io/)
[![HEIC Support](https://img.shields.io/badge/HEIC-Auto%20Convert-orange.svg)](https://en.wikipedia.org/wiki/High_Efficiency_Image_Format)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.0-646cff.svg)](https://vitejs.dev/)
[![Testing](https://img.shields.io/badge/Testing-Vitest%20%2B%20Jest-6e9f18.svg)](https://vitest.dev/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A full-screen React application for filtering, browsing, and uploading photos by date range, with a secure Node.js Express backend featuring JWT authentication, automatic HEIC conversion, and AI-powered metadata extraction. Features comprehensive testing with 86 tests covering authentication, security, and advanced image processing.

**Author:** Ron Inouye

## Table of Contents

 - [Integration runner (developer tool)](#integration-runner-developer-tool)

## 🆕 What's New (October 2025)

### 🔐 Authentication & Security System

### 🖼️ Advanced HEIC Support  

### Testing & Quality Enhancement

### Image Processing Improvements

### UX Improvements

### Developer Experience  

## Key Features (2025 Update)

### 🔐 Security & Authentication

### 📸 Advanced Photo Management

### 🤖 AI & Processing

- The backend routes every AI operation (router, scenery narrative, collectible appraisal) through OpenAI vision-capable models by default. Overrides are accepted, but they are automatically coerced to a known image-aware model so requests that include `image_url` payloads never hit schema errors again.
- When we introduce text-only AI workflows in the future, the model selector will branch on the request payload and allow text-only models for those flows. Until that feature lands, assume all jobs carry images and must target a vision model.
- Processed metadata is written back to the database together with the effective model names so operators can audit which models ran each job.
- **Dynamic model catalog** — the server now exposes `GET /photos/models`, a signed-in endpoint backed by a live OpenAI allowlist (with fallbacks). The frontend `ModelSelect` component consumes it at runtime so new model releases or account-specific fine-tunes appear automatically without redeploying the UI.

### 🎨 User Interface

### 🧪 Quality Assurance
  - **Frontend**: 66 tests with Vitest + React Testing Library covering user interactions, state management, error handling, accessibility, and authentication utilities  
  - **Backend**: 20+ tests with Jest + Supertest covering API endpoints, database operations, file upload handling, authentication flows, security middleware, and HEIC conversion
  - **Integration**: Complete end-to-end authentication and image access workflows
  - **Security Testing**: Validation of JWT flows, CORS configuration, and security headers
  - **Regression Prevention**: Tests specifically designed to prevent previously encountered issues
  - **Test Isolation**: Proper DOM cleanup between tests and comprehensive mocking strategies

## Usage (2025)

1. Start the backend server (`cd server && npm start`).
2. Start the frontend (`npm run dev`).
3. In the app, click "Select Folder for Upload" to pick a local folder.
4. Filter/select photos by date, then upload to the backend.
5. The backend view shows all photos, metadata, privileges, and hash info. No duplicates are stored.
6. If a file fails AI processing (shows 'AI processing failed'), POST to `/debug/reset-ai-retry` and click "Recheck Inprogress AI" to retry.
7. The upload panel is now flush with the viewport edges, matching other views. The file list is compact and readable.

## File Hashing & Deduplication


## Technical Stack

### Frontend
   - **Authentication Utilities**: Secure token handling and authenticated image URL generation
   - **PhotoUploadForm.jsx**: Upload panel with compact file list, flush-edge layout
   - **ImageCanvasEditor.jsx**: Interactive canvas editor for positioning captions on images
   - **EditPage.jsx**: Photo editing interface with canvas, metadata forms, and authenticated image access

### Backend

- **Dynamic AI model endpoint**: authenticated clients can call `GET /photos/models` to receive the current allowlisted OpenAI model IDs. The server refreshes this list from the OpenAI API with safe fallbacks so the frontend selects only supported models.
- Routes enforce the same allowlist for overrides supplied through `/photos/:id/run-ai` and `/photos/:id/recheck-ai`, guaranteeing consistent validation across the stack.

## File Structure

```
photo-app/
├── public/
├── src/
│   ├── App.jsx                # Main application component with photo filtering logic
│   ├── EditPage.jsx           # Photo editing interface with canvas and metadata forms
│   ├── ImageCanvasEditor.jsx  # Interactive canvas for positioning captions on images
│   ├── PhotoUploadForm.jsx    # Upload panel with compact file list
│   ├── PhotoGallery.jsx       # Photo gallery display component
│   ├── Toolbar.jsx            # Fixed navigation toolbar
│   ├── api.js                 # Backend API communication utilities
│   ├── test/
│   │   └── setup.js           # Global test configuration and mocks
│   ├── *.test.jsx             # Component test suites (54 tests total)
│   ├── index.css              # Tailwind CSS imports
│   └── main.jsx               # React entry point
├── server/                     # Backend Node.js server
│   ├── server.js              # Express server with upload endpoints
│   ├── tests/
│   │   ├── uploads.test.js    # API endpoint tests (9 tests)
│   │   └── db.test.js         # Database operation tests
│   ├── package.json           # Server dependencies
│   └── README.md              # Server documentation
├── tailwind.config.js         # Tailwind configuration
├── postcss.config.js          # PostCSS configuration
├── vite.config.js             # Vite configuration
├── package.json               # Frontend dependencies and scripts
└── README.md                  # This documentation
```

## Getting Started

### Prerequisites

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Inouye165/React-Photo-App.git
   cd React-Photo-App
   ```

2. Install frontend dependencies:
   ```bash
   npm install
   ```

3. Install backend dependencies:
   ```bash
   cd server
   npm install
   cd ..
   ```

### Development

1. Start the backend server:
   ```bash
   cd server
   npm start
   ```
   Server will run on `http://localhost:3001`

2. Start the frontend development server (in new terminal):
   ```bash
   npm run dev
   ```
   Frontend will be available at `http://localhost:5173`

## Docker containers

This project uses a small set of optional but recommended Docker containers during development. The only container required by the default codebase is Redis (used by BullMQ for background AI and image-processing jobs). Other containers you may see on your machine (for example `qdrant`, local `photo-ai` services, or other leftover images) are NOT required by this repository unless you have intentionally re-wired the AI/vector-store adapters.

Summary:

- Required (recommended for normal dev):
   - `redis` / any container exposing port 6379 — used by `server/queue` (BullMQ). When Redis is available the server enqueues AI processing work and the worker processes it in the background. If Redis is not available the server will fall back to synchronous processing (slower and may block requests).

- Optional / Not required by default:
   - `qdrant` (vector DB) — there are no references to Qdrant in this repo. Start it only if you have custom changes that use a vector DB.
   - `photo-ai` or other local LLM services — the project uses OpenAI via LangChain by default (`server/ai/langchain/agents.js`). A local `photo-ai` container is only needed if you replaced the OpenAI adapters to call your local model.

Quick commands (PowerShell)

List containers on your machine:
```powershell
docker ps -a --format "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
```

Start the recommended Redis container (example used in developer docs):
```powershell
# run a lightweight Redis container
docker run -d --name photo-app-redis -p 6379:6379 redis:7.2-alpine

# if an existing stopped container named `photo-app-redis` already exists, start it instead:
docker start photo-app-redis
```

If you want to start all stopped containers on your machine (careful — this may start unrelated services):
```powershell
docker start $(docker ps -a -q)
```

Stop and remove a container when you're done:
```powershell
docker stop photo-app-redis
docker rm photo-app-redis
```

Notes and recommendations

- Keep a single Redis instance running while developing the app to get background processing and avoid synchronous fallbacks.
- Do not start unrelated `qdrant` containers unless you intend to add vector DB functionality; they consume memory and are unnecessary for the current codebase.
- If Redis fails to start, inspect logs with `docker logs photo-app-redis --tail 200` and recreate the container if necessary (`docker rm` then `docker run`).

If you'd like, I can also add a short note to `server/README.md` with the same commands and a link to this top-level README section.

### Authentication Setup

The application requires user authentication for all image operations. On first run:

1. **Register a new account**: Navigate to the login page and create an account with username, email, and password
2. **Login**: Use your credentials to obtain a JWT token (valid for 24 hours)
3. **Session cookie**: After login the server sets an httpOnly cookie named `authToken`. The frontend should make API and image requests to the API origin (VITE_API_URL) with credentials included (fetch/axios: `credentials: 'include'`) so the browser sends the cookie automatically. Do not place JWTs in URLs or localStorage.
4. **Multi-device support**: Login on multiple machines with the same account for seamless multi-machine workflows

**Security Features:**

### Environment Configuration

The frontend uses environment variables for configuration:


To override for production or different environments, create a `.env` file in the root directory:

```bash
VITE_API_URL=https://your-production-api.com
```

This allows easy deployment to different environments without code changes.

## Environment Variables (template)
 Copy `.env.example` to `.env` in both the root and `server/` directories.
 Fill in all required values before running the app.
 Do not commit `.env` files to source control.
 **Robust Environment Handling:** The app is designed to work across different machines and CI environments. If an environment variable (like `VITE_API_URL`) is missing, the app will fall back to a safe default (`http://localhost:3001`) and warn you. This prevents crashes when switching between desktop, laptop, or CI.
 **Tip:** Always check `.env.example` for required variables after pulling new changes or switching machines.
# Frontend (Vite)
 **Dependency errors:** If you see errors about conflicting dependencies (e.g., ERESOLVE), always use `npm install --legacy-peer-deps`.
 **Missing libraries:** If you see errors like "Cannot find module 'zustand'" or '@supabase/supabase-js', run `npm install <package> --legacy-peer-deps` in the correct directory (root for frontend, `server/` for backend).
 **Missing environment variables:** If you see errors about missing environment variables, ensure you have copied `.env.example` to `.env` and filled in all required values in both root and `server/`.
 **Wrong install directory:** Always run frontend installs in the project root and backend installs in the `server/` directory.
 **ImageMagick not found:** Make sure ImageMagick is installed and available in your system PATH for HEIC/HEIF fallback support.
 **Environment switching:** If you move between machines (desktop, laptop, CI), always copy `.env.example` to `.env` and review the values. The app will use safe defaults if variables are missing, but some features may require explicit configuration.
# Map keys and map styling

- `VITE_GOOGLE_MAPS_API_KEY` - (Required for Google maps in the front-end) Add a browser key restricted to `http://localhost:5173/*` (or your dev host) and enable the **Maps JavaScript API**. Place this key in the root `.env` and **do not** commit it.
- `VITE_GOOGLE_MAPS_MAP_ID` - (Optional) Map ID if you're using a custom Google Maps style or `AdvancedMarker` which may require a specific mapId. You can fetch or create this ID in the Google Cloud console under Maps Platform → Map Management → Map IDs.

If `VITE_GOOGLE_MAPS_API_KEY` is missing, the UI will show a fallback OpenStreetMap preview automatically when the selected photo contains GPS coordinates. To get a full Google Maps experience (AdvancedMarker, styled map), set `VITE_GOOGLE_MAPS_API_KEY` and `VITE_GOOGLE_MAPS_MAP_ID`.
# OPENAI_API_KEY=sk-your_openai_api_key
```
Do not commit `.env` to source control. Add it to `.gitignore`.

### Build

```bash
```

Preview the production build:
```bash
Run the test suite:
```bash
npm run test:run

npm run test:coverage

# Backend tests (Jest) - 20+ tests
cd server
npm test

# Quick test validation across all components
node test-runner.js
```

The project includes comprehensive testing across frontend and backend:

#### Frontend Tests (66 tests with Vitest + React Testing Library)
- **Component Testing**: All React components (App, PhotoGallery, PhotoUploadForm, Toolbar, EditPage)
- **Authentication Testing**: JWT token handling, secure URL generation, multi-source authentication
- **User Interaction Testing**: Clicks, form inputs, navigation, drag-and-drop
- **State Management Testing**: Photo loading, filtering, uploads, authentication state
- **Error Handling Testing**: API failures, validation errors, authentication failures
- **Accessibility Testing**: ARIA attributes, keyboard navigation
- **E2E Testing**: Complete upload workflow from folder selection to backend storage
- **Security Testing**: Token validation, URL security, localStorage error handling
- **Mock Integration**: External dependencies (APIs, file systems, authentication)

#### Backend Tests (20+ tests with Jest + Supertest)
- **Authentication Testing**: JWT validation, login/register flows, token expiration
- **Security Testing**: Rate limiting, input validation, CORS configuration, security headers
- **API Endpoint Testing**: Authenticated upload endpoints, error handling, file validation
- **Image Processing Testing**: HEIC conversion, Sharp/ImageMagick fallbacks, thumbnail generation
- **Database Testing**: SQLite operations, schema constraints, CRUD operations, user management
- **Integration Testing**: Complete authenticated request/response cycles
- **Error Scenarios**: Permission errors, disk issues, invalid files, authentication failures
- **Multi-machine Testing**: File sync scenarios, graceful degradation

**Total: 86 tests with robust coverage of authentication, security, and HEIC functionality**

## Usage

1. Open the application in a modern web browser
2. Click "Select Folder for Upload" - the folder picker will open in your Pictures folder (on supported browsers)
3. The application will scan and display all supported image files in chronological order
4. Use the "Start Date" and "End Date" inputs to filter photos by date taken
5. The list updates instantly as you change dates, showing the filtered count
6. Click "Upload" to send filtered photos to the backend
7. The backend view shows all photos, metadata, privileges, and hash info
8. Click on a photo to edit it - the interactive canvas editor allows you to position captions on the image:
   - Drag the text to reposition it anywhere on the image
   - Use the controls to adjust font size and color
   - Edit the caption text directly in the editor
   - Click "Save Captioned Image" to persist your text positioning and styling
9. If a file fails AI processing (shows 'AI processing failed'), POST to `/debug/reset-ai-retry` and click "Recheck Inprogress AI" to retry

## Thumbnails

- **Automatic thumbnail generation**: The backend generates thumbnails for every image in the `working` folder and serves them from `/thumbnails/<hash>.jpg` so the frontend can display fast previews without re-reading original files.
- **HEIC/HEIF support and fallback**: Thumbnails are generated with `sharp` when possible. If `sharp`/libvips lacks HEIF/HEIC support, the server will attempt a fallback conversion using ImageMagick (the `magick` command) to create thumbnails. Install ImageMagick with HEIF delegates on your system to enable the fallback.

## HEIC/HEIF AI Processing Support
- HEIC/HEIF files are now supported for AI processing. If the backend cannot convert HEIC using sharp, it will automatically use ImageMagick as a fallback.
- If a file fails AI processing (shows 'AI processing failed'), you can reset its retry count by POSTing to `/debug/reset-ai-retry` and then clicking 'Recheck Inprogress AI' in the frontend to retry processing.
- For new HEIC files, no manual intervention is needed.

## Troubleshooting
- **HEIC/HEIF 'bad seek' errors**: These are expected when Sharp can't decode certain HEIC variants. The system automatically falls back to ImageMagick - no action needed.
- **ImageMagick not found**: Make sure ImageMagick is installed and available in your system PATH for HEIC/HEIF fallback support.
- **AI processing failures**: Check the backend logs. You can reset retry counts via `/debug/reset-ai-retry` and click 'Recheck Inprogress AI'.
- **Test failures**: Run `npm test` to see detailed error messages. Ensure all dependencies are installed and environment is properly configured.

## Known Limitations

- **Browser Security**: Only works with locally selected files due to browser security restrictions
- **Performance**: Large folders may take time to process initially  
- **EXIF Dependency**: EXIF data reading depends on photo metadata being present
- **Date Fallback**: Falls back to file modification date if EXIF date is unavailable
- **API Requirements**: File System Access API requires user gesture and HTTPS in production
- **Browser Support**: Modern browsers required for full feature set (Chrome, Edge recommended)

## Testing & Quality Assurance

### Test Coverage (86 Tests Total)

#### Frontend (66 tests - Vitest + React Testing Library)
- **Component Testing**: All React components (App, PhotoGallery, PhotoUploadForm, Toolbar, EditPage)
- **Authentication Testing**: JWT token handling, secure URL generation, multi-source authentication
- **User Interaction Testing**: Clicks, form inputs, navigation, drag-and-drop
- **State Management Testing**: Photo loading, filtering, uploads, authentication state
- **Error Handling Testing**: API failures, validation errors, authentication failures
- **Accessibility Testing**: ARIA attributes, keyboard navigation
- **E2E Testing**: Complete upload workflow from folder selection to backend storage
- **Security Testing**: Token validation, URL security, localStorage error handling
- **Mock Integration**: External dependencies (APIs, file systems, authentication)

#### Backend (20+ tests - Jest + Supertest)
- **Authentication Testing**: JWT validation, login/register flows, token expiration
- **Security Testing**: Rate limiting, input validation, CORS configuration, security headers
- **API Endpoint Testing**: Authenticated upload endpoints, error handling, file validation
- **Image Processing Testing**: HEIC conversion, Sharp/ImageMagick fallbacks, thumbnail generation
- **Database Testing**: SQLite operations, schema constraints, CRUD operations, user management
- **Integration Testing**: Complete authenticated request/response cycles
- **Error Scenarios**: Permission errors, disk issues, invalid files, authentication failures
- **Multi-machine Testing**: File sync scenarios, graceful degradation

**Total: 86 tests with robust coverage of authentication, security, and HEIC functionality**

## Usage

1. Open the application in a modern web browser
2. Click "Select Folder for Upload" - the folder picker will open in your Pictures folder (on supported browsers)
3. The application will scan and display all supported image files in chronological order
4. Use the "Start Date" and "End Date" inputs to filter photos by date taken
5. The list updates instantly as you change dates, showing the filtered count
6. Click "Upload" to send filtered photos to the backend
7. The backend view shows all photos, metadata, privileges, and hash info
8. Click on a photo to edit it - the interactive canvas editor allows you to position captions on the image:
   - Drag the text to reposition it anywhere on the image
   - Use the controls to adjust font size and color
   - Edit the caption text directly in the editor
   - Click "Save Captioned Image" to persist your text positioning and styling
9. If a file fails AI processing (shows 'AI processing failed'), POST to `/debug/reset-ai-retry` and click "Recheck Inprogress AI" to retry

## Thumbnails

- **Automatic thumbnail generation**: The backend generates thumbnails for every image in the `working` folder and serves them from `/thumbnails/<hash>.jpg` so the frontend can display fast previews without re-reading original files.
- **HEIC/HEIF support and fallback**: Thumbnails are generated with `sharp` when possible. If `sharp`/libvips lacks HEIF/HEIC support, the server will attempt a fallback conversion using ImageMagick (the `magick` command) to create thumbnails. Install ImageMagick with HEIF delegates on your system to enable the fallback.

## HEIC/HEIF AI Processing Support
- HEIC/HEIF files are now supported for AI processing. If the backend cannot convert HEIC using sharp, it will automatically use ImageMagick as a fallback.
- If a file fails AI processing (shows 'AI processing failed'), you can reset its retry count by POSTing to `/debug/reset-ai-retry` and then clicking 'Recheck Inprogress AI' in the frontend to retry processing.
- For new HEIC files, no manual intervention is needed.

## Troubleshooting
- **HEIC/HEIF 'bad seek' errors**: These are expected when Sharp can't decode certain HEIC variants. The system automatically falls back to ImageMagick - no action needed.
- **ImageMagick not found**: Make sure ImageMagick is installed and available in your system PATH for HEIC/HEIF fallback support.
- **AI processing failures**: Check the backend logs. You can reset retry counts via `/debug/reset-ai-retry` and click 'Recheck Inprogress AI'.
- **Test failures**: Run `npm test` to see detailed error messages. Ensure all dependencies are installed and environment is properly configured.

## Known Limitations

- **Browser Security**: Only works with locally selected files due to browser security restrictions
- **Performance**: Large folders may take time to process initially  
- **EXIF Dependency**: EXIF data reading depends on photo metadata being present
- **Date Fallback**: Falls back to file modification date if EXIF date is unavailable
- **API Requirements**: File System Access API requires user gesture and HTTPS in production
- **Browser Support**: Modern browsers required for full feature set (Chrome, Edge recommended)

## Testing & Quality Assurance

### Test Coverage (86 Tests Total)

#### Frontend (66 tests - Vitest + React Testing Library)
- **Component Testing**: All React components (App, PhotoGallery, PhotoUploadForm, Toolbar, EditPage)
- **Authentication Testing**: JWT token handling, secure URL generation, multi-source authentication
- **User Interaction Testing**: Clicks, form inputs, navigation, drag-and-drop
- **State Management Testing**: Photo loading, filtering, uploads, authentication state
- **Error Handling Testing**: API failures, validation errors, authentication failures
- **Accessibility Testing**: ARIA attributes, keyboard navigation
- **E2E Testing**: Complete upload workflow from folder selection to backend storage
- **Security Testing**: Token validation, URL security, localStorage error handling
- **Mock Integration**: External dependencies (APIs, file systems, authentication)

#### Backend (20+ tests - Jest + Supertest)
- **Authentication Testing**: JWT validation, login/register flows, token expiration
- **Security Testing**: Rate limiting, input validation, CORS configuration, security headers
- **API Endpoint Testing**: Authenticated upload endpoints, error handling, file validation
- **Image Processing Testing**: HEIC conversion, Sharp/ImageMagick fallbacks, thumbnail generation
- **Database Testing**: SQLite operations, schema constraints, CRUD operations, user management
- **Integration Testing**: Complete authenticated request/response cycles
- **Error Scenarios**: Permission errors, disk issues, invalid files, authentication failures
- **Multi-machine Testing**: File sync scenarios, graceful degradation

**Total: 86 tests with robust coverage of authentication, security, and HEIC functionality**

## Usage

1. Open the application in a modern web browser
2. Click "Select Folder for Upload" - the folder picker will open in your Pictures folder (on supported browsers)
3. The application will scan and display all supported image files in chronological order
4. Use the "Start Date" and "End Date" inputs to filter photos by date taken
5. The list updates instantly as you change dates, showing the filtered count
6. Click "Upload" to send filtered photos to the backend
7. The backend view shows all photos, metadata, privileges, and hash info
8. Click on a photo to edit it - the interactive canvas editor allows you to position captions on the image:
   - Drag the text to reposition it anywhere on the image
   - Use the controls to adjust font size and color
   - Edit the caption text directly in the editor
   - Click "Save Captioned Image" to persist your text positioning and styling
9. If a file fails AI processing (shows 'AI processing failed'), POST to `/debug/reset-ai-retry` and click "Recheck Inprogress AI" to retry

## Thumbnails

- **Automatic thumbnail generation**: The backend generates thumbnails for every image in the `working` folder and serves them from `/thumbnails/<hash>.jpg` so the frontend can display fast previews without re-reading original files.
- **HEIC/HEIF support and fallback**: Thumbnails are generated with `sharp` when possible. If `sharp`/libvips lacks HEIF/HEIC support, the server will attempt a fallback conversion using ImageMagick (the `magick` command) to create thumbnails. Install ImageMagick with HEIF delegates on your system to enable the fallback.

## HEIC/HEIF AI Processing Support
- HEIC/HEIF files are now supported for AI processing. If the backend cannot convert HEIC using sharp, it will automatically use ImageMagick as a fallback.
- If a file fails AI processing (shows 'AI processing failed'), you can reset its retry count by POSTing to `/debug/reset-ai-retry` and then clicking 'Recheck Inprogress AI' in the frontend to retry processing.
- For new HEIC files, no manual intervention is needed.

## Troubleshooting
- **HEIC/HEIF 'bad seek' errors**: These are expected when Sharp can't decode certain HEIC variants. The system automatically falls back to ImageMagick - no action needed.
- **ImageMagick not found**: Make sure ImageMagick is installed and available in your system PATH for HEIC/HEIF fallback support.
- **AI processing failures**: Check the backend logs. You can reset retry counts via `/debug/reset-ai-retry` and click 'Recheck Inprogress AI'.
- **Test failures**: Run `npm test` to see detailed error messages. Ensure all dependencies are installed and environment is properly configured.

## Known Limitations

- **Browser Security**: Only works with locally selected files due to browser security restrictions
- **Performance**: Large folders may take time to process initially  
- **EXIF Dependency**: EXIF data reading depends on photo metadata being present
- **Date Fallback**: Falls back to file modification date if EXIF date is unavailable
- **API Requirements**: File System Access API requires user gesture and HTTPS in production
- **Browser Support**: Modern browsers required for full feature set (Chrome, Edge recommended)

## Testing & Quality Assurance

### Test Coverage (86 Tests Total)

#### Frontend (66 tests - Vitest + React Testing Library)
- **Component Testing**: All React components (App, PhotoGallery, PhotoUploadForm, Toolbar, EditPage)
- **Authentication Testing**: JWT token handling, secure URL generation, multi-source authentication
- **User Interaction Testing**: Clicks, form inputs, navigation, drag-and-drop
- **State Management Testing**: Photo loading, filtering, uploads, authentication state
- **Error Handling Testing**: API failures, validation errors, authentication failures
- **Accessibility Testing**: ARIA attributes, keyboard navigation
- **E2E Testing**: Complete upload workflow from folder selection to backend storage
- **Security Testing**: Token validation, URL security, localStorage error handling
- **Mock Integration**: External dependencies (APIs, file systems, authentication)

#### Backend (20+ tests - Jest + Supertest)
- **Authentication Testing**: JWT validation, login/register flows, token expiration
- **Security Testing**: Rate limiting, input validation, CORS configuration, security headers
- **API Endpoint Testing**: Authenticated upload endpoints, error handling, file validation
- **Image Processing Testing**: HEIC conversion, Sharp/ImageMagick fallbacks, thumbnail generation
- **Database Testing**: SQLite operations, schema constraints, CRUD operations, user management
- **Integration Testing**: Complete authenticated request/response cycles
- **Error Scenarios**: Permission errors, disk issues, invalid files, authentication failures
- **Multi-machine Testing**: File sync scenarios, graceful degradation

**Total: 86 tests with robust coverage of authentication, security, and HEIC functionality**

## Usage

1. Open the application in a modern web browser
2. Click "Select Folder for Upload" - the folder picker will open in your Pictures folder (on supported browsers)
3. The application will scan and display all supported image files in chronological order
4. Use the "Start Date" and "End Date" inputs to filter photos by date taken
5. The list updates instantly as you change dates, showing the filtered count
6. Click "Upload" to send filtered photos to the backend
7. The backend view shows all photos, metadata, privileges, and hash info
8. Click on a photo to edit it - the interactive canvas editor allows you to position captions on the image:
   - Drag the text to reposition it anywhere on the image
   - Use the controls to adjust font size and color
   - Edit the caption text directly in the editor
   - Click "Save Captioned Image" to persist your text positioning and styling
9. If a file fails AI processing (shows 'AI processing failed'), POST to `/debug/reset-ai-retry` and click "Recheck Inprogress AI" to retry

## Thumbnails

- **Automatic thumbnail generation**: The backend generates thumbnails for every image in the `working` folder and serves them from `/thumbnails/<hash>.jpg` so the frontend can display fast previews without re-reading original files.
- **HEIC/HEIF support and fallback**: Thumbnails are generated with `sharp` when possible. If `sharp`/libvips lacks HEIF/HEIC support, the server will attempt a fallback conversion using ImageMagick (the `magick` command) to create thumbnails. Install ImageMagick with HEIF delegates on your system to enable the fallback.

## HEIC/HEIF AI Processing Support
- HEIC/HEIF files are now supported for AI processing. If the backend cannot convert HEIC using sharp, it will automatically use ImageMagick as a fallback.
- If a file fails AI processing (shows 'AI processing failed'), you can reset its retry count by POSTing to `/debug/reset-ai-retry` and then clicking 'Recheck Inprogress AI' in the frontend to retry processing.
- For new HEIC files, no manual intervention is needed.

## Troubleshooting
- **HEIC/HEIF 'bad seek' errors**: These are expected when Sharp can't decode certain HEIC variants. The system automatically falls back to ImageMagick - no action needed.
- **ImageMagick not found**: Make sure ImageMagick is installed and available in your system PATH for HEIC/HEIF fallback support.
- **AI processing failures**: Check the backend logs. You can reset retry counts via `/debug/reset-ai-retry` and click 'Recheck Inprogress AI'.
- **Test failures**: Run `npm test` to see detailed error messages. Ensure all dependencies are installed and environment is properly configured.

## Known Limitations

- **Browser Security**: Only works with locally selected files due to browser security restrictions
- **Performance**: Large folders may take time to process initially  
- **EXIF Dependency**: EXIF data reading depends on photo metadata being present
- **Date Fallback**: Falls back to file modification date if EXIF date is unavailable
- **API Requirements**: File System Access API requires user gesture and HTTPS in production
- **Browser Support**: Modern browsers required for full feature set (Chrome, Edge recommended)

## Testing & Quality Assurance

### Test Coverage (86 Tests Total)

#### Frontend (66 tests - Vitest + React Testing Library)
- **Component Testing**: All React components (App, PhotoGallery, PhotoUploadForm, Toolbar, EditPage)
- **Authentication Testing**: JWT token handling, secure URL generation, multi-source authentication
- **User Interaction Testing**: Clicks, form inputs, navigation, drag-and-drop
- **State Management Testing**: Photo loading, filtering, uploads, authentication state
- **Error Handling Testing**: API failures, validation errors, authentication failures
- **Accessibility Testing**: ARIA attributes, keyboard navigation
- **E2E Testing**: Complete upload workflow from folder selection to backend storage
- **Security Testing**: Token validation, URL security, localStorage error handling
- **Mock Integration**: External dependencies (APIs, file systems, authentication)

#### Backend (20+ tests - Jest + Supertest)
- **Authentication Testing**: JWT validation, login/register flows, token expiration
- **Security Testing**: Rate limiting, input validation, CORS configuration, security headers
- **API Endpoint Testing**: Authenticated upload endpoints, error handling, file validation
- **Image Processing Testing**: HEIC conversion, Sharp/ImageMagick fallbacks, thumbnail generation
- **Database Testing**: SQLite operations, schema constraints, CRUD operations, user management
- **Integration Testing**: Complete authenticated request/response cycles
- **Error Scenarios**: Permission errors, disk issues, invalid files, authentication failures
- **Multi-machine Testing**: File sync scenarios, graceful degradation

**Total: 86 tests with robust coverage of authentication, security, and HEIC functionality**

## Usage

1. Open the application in a modern web browser
2. Click "Select Folder for Upload" - the folder picker will open in your Pictures folder (on supported browsers)
3. The application will scan and display all supported image files in chronological order
4. Use the "Start Date" and "End Date" inputs to filter photos by date taken
5. The list updates instantly as you change dates, showing the filtered count
6. Click "Upload" to send filtered photos to the backend
7. The backend view shows all photos, metadata, privileges, and hash info
8. Click on a photo to edit it - the interactive canvas editor allows you to position captions on the image:
   - Drag the text to reposition it anywhere on the image
   - Use the controls to adjust font size and color
   - Edit the caption text directly in the editor
   - Click "Save Captioned Image" to persist your text positioning and styling
9. If a file fails AI processing (shows 'AI processing failed'), POST to `/debug/reset-ai-retry` and click "Recheck Inprogress AI" to retry

## Thumbnails

- **Automatic thumbnail generation**: The backend generates thumbnails for every image in the `working` folder and serves them from `/thumbnails/<hash>.jpg` so the frontend can display fast previews without re-reading original files.
- **HEIC/HEIF support and fallback**: Thumbnails are generated with `sharp` when possible. If `sharp`/libvips lacks HEIF/HEIC support, the server will attempt a fallback conversion using ImageMagick (the `magick` command) to create thumbnails. Install ImageMagick with HEIF delegates on your system to enable the fallback.

## HEIC/HEIF AI Processing Support
- HEIC/HEIF files are now supported for AI processing. If the backend cannot convert HEIC using sharp, it will automatically use ImageMagick as a fallback.
- If a file fails AI processing (shows 'AI processing failed'), you can reset its retry count by POSTing to `/debug/reset-ai-retry` and then clicking 'Recheck Inprogress AI' in the frontend to retry processing.
- For new HEIC files, no manual intervention is needed.

## Troubleshooting
- **HEIC/HEIF 'bad seek' errors**: These are expected when Sharp can't decode certain HEIC variants. The system automatically falls back to ImageMagick - no action needed.
- **ImageMagick not found**: Make sure ImageMagick is installed and available in your system PATH for HEIC/HEIF fallback support.
- **AI processing failures**: Check the backend logs. You can reset retry counts via `/debug/reset-ai-retry` and click 'Recheck Inprogress AI'.
- **Test failures**: Run `npm test` to see detailed error messages. Ensure all dependencies are installed and environment is properly configured.

## Known Limitations

- **Browser Security**: Only works with locally selected files due to browser security restrictions
- **Performance**: Large folders may take time to process initially  
- **EXIF Dependency**: EXIF data reading depends on photo metadata being present
- **Date Fallback**: Falls back to file modification date if EXIF date is unavailable
- **API Requirements**: File System Access API requires user gesture and HTTPS in production
- **Browser Support**: Modern browsers required for full feature set (Chrome, Edge recommended)

## Testing & Quality Assurance

### Test Coverage (86 Tests Total)

#### Frontend (66 tests - Vitest + React Testing Library)
- **Component Testing**: All React components (App, PhotoGallery, PhotoUploadForm, Toolbar, EditPage)
- **Authentication Testing**: JWT token handling, secure URL generation, multi-source authentication
- **User Interaction Testing**: Clicks, form inputs, navigation, drag-and-drop
- **State Management Testing**: Photo loading, filtering, uploads, authentication state
- **Error Handling Testing**: API failures, validation errors, authentication failures
- **Accessibility Testing**: ARIA attributes, keyboard navigation
- **E2E Testing**: Complete upload workflow from folder selection to backend storage
- **Security Testing**: Token validation, URL security, localStorage error handling
- **Mock Integration**: External dependencies (APIs, file systems, authentication)

#### Backend (20+ tests - Jest + Supertest)
- **Authentication Testing**: JWT validation, login/register flows, token expiration
- **Security Testing**: Rate limiting, input validation, CORS configuration, security headers
- **API Endpoint Testing**: Authenticated upload endpoints, error handling, file validation
- **Image Processing Testing**: HEIC conversion, Sharp/ImageMagick fallbacks, thumbnail generation
- **Database Testing**: SQLite operations, schema constraints, CRUD operations, user management
- **Integration Testing**: Complete authenticated request/response cycles
- **Error Scenarios**: Permission errors, disk issues, invalid files, authentication failures
- **Multi-machine Testing**: File sync scenarios, graceful degradation

**Total: 86 tests with robust coverage of authentication, security, and HEIC functionality**

## Usage

1. Open the application in a modern web browser
2. Click "Select Folder for Upload" - the folder picker will open in your Pictures folder (on supported browsers)
3. The application will scan and display all supported image files in chronological order
4. Use the "Start Date" and "End Date" inputs to filter photos by date taken
5. The list updates instantly as you change dates, showing the filtered count
6. Click "Upload" to send filtered photos to the backend
7. The backend view shows all photos, metadata, privileges, and hash info
8. Click on a photo to edit it - the interactive canvas editor allows you to position captions on the image:
   - Drag the text to reposition it anywhere on the image
   - Use the controls to adjust font size and color
   - Edit the caption text directly in the editor
   - Click "Save Captioned Image" to persist your text positioning and styling
9. If a file fails AI processing (shows 'AI processing failed'), POST to `/debug/reset-ai-retry` and click "Recheck Inprogress AI" to retry

## Thumbnails

- **Automatic thumbnail generation**: The backend generates thumbnails for every image in the `working` folder and serves them from `/thumbnails/<hash>.jpg` so the frontend can display fast previews without re-reading original files.
- **HEIC/HEIF support and fallback**: Thumbnails are generated with `sharp` when possible. If `sharp`/libvips lacks HEIF/HEIC support, the server will attempt a fallback conversion using ImageMagick (the `magick` command) to create thumbnails. Install ImageMagick with HEIF delegates on your system to enable the fallback.

## HEIC/HEIF AI Processing Support
- HEIC/HEIF files are now supported for AI processing. If the backend cannot convert HEIC using sharp, it will automatically use ImageMagick as a fallback.
- If a file fails AI processing (shows 'AI processing failed'), you can reset its retry count by POSTing to `/debug/reset-ai-retry` and then clicking 'Recheck Inprogress AI' in the frontend to retry processing.
- For new HEIC files, no manual intervention is needed.

## Troubleshooting
- **HEIC/HEIF 'bad seek' errors**: These are expected when Sharp can't decode certain HEIC variants. The system automatically falls back to ImageMagick - no action needed.
- **ImageMagick not found**: Make sure ImageMagick is installed and available in your system PATH for HEIC/HEIF fallback support.
- **AI processing failures**: Check the backend logs. You can reset retry counts via `/debug/reset-ai-retry` and click 'Recheck Inprogress AI'.
- **Test failures**: Run `npm test` to see detailed error messages. Ensure all dependencies are installed and environment is properly configured.

## Known Limitations

- **Browser Security**: Only works with locally selected files due to browser security restrictions
- **Performance**: Large folders may take time to process initially  
- **EXIF Dependency**: EXIF data reading depends on photo metadata being present
- **Date Fallback**: Falls back to file modification date if EXIF date is unavailable
- **API Requirements**: File System Access API requires user gesture and HTTPS in production
- **Browser Support**: Modern browsers required for full feature set (Chrome, Edge recommended)

## Testing & Quality Assurance

### Test Coverage (86 Tests Total)

#### Frontend (66 tests - Vitest + React Testing Library)
- **Component Testing**: All React components (App, PhotoGallery, PhotoUploadForm, Toolbar, EditPage)
- **Authentication Testing**: JWT token handling, secure URL generation, multi-source authentication
- **User Interaction Testing**: Clicks, form inputs, navigation, drag-and-drop
- **State Management Testing**: Photo loading, filtering, uploads, authentication state
- **Error Handling Testing**: API failures, validation errors, authentication failures
- **Accessibility Testing**: ARIA attributes, keyboard navigation
- **E2E Testing**: Complete upload workflow from folder selection to backend storage
- **Security Testing**: Token validation, URL security, localStorage error handling
- **Mock Integration**: External dependencies (APIs, file systems, authentication)

#### Backend (20+ tests - Jest + Supertest)
- **Authentication Testing**: JWT validation, login/register flows, token expiration
- **Security Testing**: Rate limiting, input validation, CORS configuration, security headers
- **API Endpoint Testing**: Authenticated upload endpoints, error handling, file validation
- **Image Processing Testing**: HEIC conversion, Sharp/ImageMagick fallbacks, thumbnail generation
- **Database Testing**: SQLite operations, schema constraints, CRUD operations, user management
- **Integration Testing**: Complete authenticated request/response cycles
- **Error Scenarios**: Permission errors, disk issues, invalid files, authentication failures
- **Multi-machine Testing**: File sync scenarios, graceful degradation

**Total: 86 tests with robust coverage of authentication, security, and HEIC functionality**

## Usage

1. Open the application in a modern web browser
2. Click "Select Folder for Upload" - the folder picker will open in your Pictures folder (on supported browsers)
3. The application will scan and display all supported image files in chronological order
4. Use the "Start Date" and "End Date" inputs to filter photos by date taken
5. The list updates instantly as you change dates, showing the filtered count
6. Click "Upload" to send filtered photos to the backend
7. The backend view shows all photos, metadata, privileges, and hash info
8. Click on a photo to edit it - the interactive canvas editor allows you to position captions on the image:
   - Drag the text to reposition it anywhere on the image
   - Use the controls to adjust font size and color
   - Edit the caption text directly in the editor
   - Click "Save Captioned Image" to persist your text positioning and styling
9. If a file fails AI processing (shows 'AI processing failed'), POST to `/debug/reset-ai-retry` and click "Recheck Inprogress AI" to retry

## Thumbnails

- **Automatic thumbnail generation**: The backend generates thumbnails for every image in the `working` folder and serves them from `/thumbnails/<hash>.jpg` so the frontend can display fast previews without re-reading original files.
- **HEIC/HEIF support and fallback**: Thumbnails are generated with `sharp` when possible. If `sharp`/libvips lacks HEIF/HEIC support, the server will attempt a fallback conversion using ImageMagick (the `magick` command) to create thumbnails. Install ImageMagick with HEIF delegates on your system to enable the fallback.

## HEIC/HEIF AI Processing Support
- HEIC/HEIF files are now supported for AI processing. If the backend cannot convert HEIC using sharp, it will automatically use ImageMagick as a fallback.
- If a file fails AI processing (shows 'AI processing failed'), you can reset its retry count by POSTing to `/debug/reset-ai-retry` and then clicking 'Recheck Inprogress AI' in the frontend to retry processing.
- For new HEIC files, no manual intervention is needed.

## Troubleshooting
- **HEIC/HEIF 'bad seek' errors**: These are expected when Sharp can't decode certain HEIC variants. The system automatically falls back to ImageMagick - no action needed.
- **ImageMagick not found**: Make sure ImageMagick is installed and available in your system PATH for HEIC/HEIF fallback support.
- **AI processing failures**: Check the backend logs. You can reset retry counts via `/debug/reset-ai-retry` and click 'Recheck Inprogress AI'.
- **Test failures**: Run `npm test` to see detailed error messages. Ensure all dependencies are installed and environment is properly configured.

## Known Limitations

- **Browser Security**: Only works with locally selected files due to browser security restrictions
- **Performance**: Large folders may take time to process initially  
- **EXIF Dependency**: EXIF data reading depends on photo metadata being present
- **Date Fallback**: Falls back to file modification date if EXIF date is unavailable
- **API Requirements**: File System Access API requires user gesture and HTTPS in production
- **Browser Support**: Modern browsers required for full feature set (Chrome, Edge recommended)

## Testing & Quality Assurance

### Test Coverage (86 Tests Total)

#### Frontend (66 tests - Vitest + React Testing Library)
- **Component Testing**: All React components (App, PhotoGallery, PhotoUploadForm, Toolbar, EditPage)
- **Authentication Testing**: JWT token handling, secure URL generation, multi-source authentication
- **User Interaction Testing**: Clicks, form inputs, navigation, drag-and-drop
- **State Management Testing**: Photo loading, filtering, uploads, authentication state
- **Error Handling Testing**: API failures, validation errors, authentication failures
- **Accessibility Testing**: ARIA attributes, keyboard navigation
- **E2E Testing**: Complete upload workflow from folder selection to backend storage
- **Security Testing**: Token validation, URL security, localStorage error handling
- **Mock Integration**: External dependencies (APIs, file systems, authentication)

#### Backend (20+ tests - Jest + Supertest)
- **Authentication Testing**: JWT validation, login/register flows, token expiration
- **Security Testing**: Rate limiting, input validation, CORS configuration, security headers
- **API Endpoint Testing**: Authenticated upload endpoints, error handling, file validation
- **Image Processing Testing**: HEIC conversion, Sharp/ImageMagick fallbacks, thumbnail generation
- **Database Testing**: SQLite operations, schema constraints, CRUD operations, user management
- **Integration Testing**: Complete authenticated request/response cycles
- **Error Scenarios**: Permission errors, disk issues, invalid files, authentication failures
- **Multi-machine Testing**: File sync scenarios, graceful degradation

**Total: 86 tests with robust coverage of authentication, security, and HEIC functionality**

## Usage

1. Open the application in a modern web browser
2. Click "Select Folder for Upload" - the folder picker will open in your Pictures folder (on supported browsers)
3. The application will scan and display all supported image files in chronological order
4. Use the "Start Date" and "End Date" inputs to filter photos by date taken
5. The list updates instantly as you change dates, showing the filtered count
6. Click "Upload" to send filtered photos to the backend
7. The backend view shows all photos, metadata, privileges, and hash info
8. Click on a photo to edit it - the interactive canvas editor allows you to position captions on the image:
   - Drag the text to reposition it anywhere on the image
   - Use the controls to adjust font size and color
   - Edit the caption text directly in the editor
   - Click "Save Captioned Image" to persist your text positioning and styling
9. If a file fails AI processing (shows 'AI processing failed'), POST to `/debug/reset-ai-retry` and click "Recheck Inprogress AI" to retry

## Thumbnails

- **Automatic thumbnail generation**: The backend generates thumbnails for every image in the `working` folder and serves them from `/thumbnails/<hash>.jpg` so the frontend can display fast previews without re-reading original files.
- **HEIC/HEIF support and fallback**: Thumbnails are generated with `sharp` when possible. If `sharp`/libvips lacks HEIF/HEIC support, the server will attempt a fallback conversion using ImageMagick (the `magick` command) to create thumbnails. Install ImageMagick with HEIF delegates on your system to enable the fallback.

## HEIC/HEIF AI Processing Support
- HEIC/HEIF files are now supported for AI processing. If the backend cannot convert HEIC using sharp, it will automatically use ImageMagick as a fallback.
- If a file fails AI processing (shows 'AI processing failed'), you can reset its retry count by POSTing to `/debug/reset-ai-retry` and then clicking 'Recheck Inprogress AI' in the frontend to retry processing.
- For new HEIC files, no manual intervention is needed.

## Troubleshooting
- **HEIC/HEIF 'bad seek' errors**: These are expected when Sharp can't decode certain HEIC variants. The system automatically falls back to ImageMagick - no action needed.
- **ImageMagick not found**: Make sure ImageMagick is installed and available in your system PATH for HEIC/HEIF fallback support.
- **AI processing failures**: Check the backend logs. You can reset retry counts via `/debug/reset-ai-retry` and click 'Recheck Inprogress AI'.
- **Test failures**: Run `npm test` to see detailed error messages. Ensure all dependencies are installed and environment is properly configured.

## Known Limitations

- **Browser Security**: Only works with locally selected files due to browser security restrictions
- **Performance**: Large folders may take time to process initially  
- **EXIF Dependency**: EXIF data reading depends on photo metadata being present
- **Date Fallback**: Falls back to file modification date if EXIF date is unavailable
- **API Requirements**: File System Access API requires user gesture and HTTPS in production
- **Browser Support**: Modern browsers required for full feature set (Chrome, Edge recommended)

## Testing & Quality Assurance

### Test Coverage (86 Tests Total)

#### Frontend (66 tests - Vitest + React Testing Library)
- **Component Testing**: All React components (App, PhotoGallery, PhotoUploadForm, Toolbar, EditPage)
- **Authentication Testing**: JWT token handling, secure URL generation, multi-source authentication
- **User Interaction Testing**: Clicks, form inputs, navigation, drag-and-drop
- **State Management Testing**: Photo loading, filtering, uploads, authentication state
- **Error Handling Testing**: API failures, validation errors, authentication failures
- **Accessibility Testing**: ARIA attributes, keyboard navigation
- **E2E Testing**: Complete upload workflow from folder selection to backend storage
- **Security Testing**: Token validation, URL security, localStorage error handling
- **Mock Integration**: External dependencies (APIs, file systems, authentication)

#### Backend (20+ tests - Jest + Supertest)
- **Authentication Testing**: JWT validation, login/register flows, token expiration
- **Security Testing**: Rate limiting, input validation, CORS configuration, security headers
- **API Endpoint Testing**: Authenticated upload endpoints, error handling, file validation
- **Image Processing Testing**: HEIC conversion, Sharp/ImageMagick fallbacks, thumbnail generation
- **Database Testing**: SQLite operations, schema constraints, CRUD operations, user management
- **Integration Testing**: Complete authenticated request/response cycles
- **Error Scenarios**: Permission errors, disk issues, invalid files, authentication failures
- **Multi-machine Testing**: File sync scenarios, graceful degradation

**Total: 86 tests with robust coverage of authentication, security, and HEIC functionality**

## Usage

1. Open the application in a modern web browser
2. Click "Select Folder for Upload" - the folder picker will open in your Pictures folder (on supported browsers)
3. The application will scan and display all supported image files in chronological order
4. Use the "Start Date" and "End Date" inputs to filter photos by date taken
5. The list updates instantly as you change dates, showing the filtered count
6. Click "Upload" to send filtered photos to the backend
7. The backend view shows all photos, metadata, privileges, and hash info
8. Click on a photo to edit it - the interactive canvas editor allows you to position captions on the image:
   - Drag the text to reposition it anywhere on the image
   - Use the controls to adjust font size and color
   - Edit the caption text directly in the editor
   - Click "Save Captioned Image" to persist your text positioning and styling
9. If a file fails AI processing (shows 'AI processing failed'), POST to `/debug/reset-ai-retry` and click "Recheck Inprogress AI" to retry

## Thumbnails

- **Automatic thumbnail generation**: The backend generates thumbnails for every image in the `working` folder and serves them from `/thumbnails/<hash>.jpg` so the frontend can display fast previews without re-reading original files.
- **HEIC/HEIF support and fallback**: Thumbnails are generated with `sharp` when possible. If `sharp`/libvips lacks HEIF/HEIC support, the server will attempt a fallback conversion using ImageMagick (the `magick` command) to create thumbnails. Install ImageMagick with HEIF delegates on your system to enable the fallback.

## HEIC/HEIF AI Processing Support
- HEIC/HEIF files are now supported for AI processing. If the backend cannot convert HEIC using sharp, it will automatically use ImageMagick as a fallback.
- If a file fails AI processing (shows 'AI processing failed'), you can reset its retry count by POSTing to `/debug/reset-ai-retry` and then clicking 'Recheck Inprogress AI' in the frontend to retry processing.
- For new HEIC files, no manual intervention is needed.

## Troubleshooting
- **HEIC/HEIF 'bad seek' errors**: These are expected when Sharp can't decode certain HEIC variants. The system automatically falls back to ImageMagick - no action needed.
- **ImageMagick not found**: Make sure ImageMagick is installed and available in your system PATH for HEIC/HEIF fallback support.
- **AI processing failures**: Check the backend logs. You can reset retry counts via `/debug/reset-ai-retry` and click 'Recheck Inprogress AI'.
- **Test failures**: Run `npm test` to see detailed error messages. Ensure all dependencies are installed and environment is properly configured.

## Known Limitations

- **Browser Security**: Only works with locally selected files due to browser security restrictions
- **Performance**: Large folders may take time to process initially  
- **EXIF Dependency**: EXIF data reading depends on photo metadata being present
- **Date Fallback**: Falls back to file modification date if EXIF date is unavailable
- **API Requirements**: File System Access API requires user gesture and HTTPS in production
- **Browser Support**: Modern browsers required for full feature set (Chrome, Edge recommended)

# Project TODOs

## High-Priority

- [ ] **Security (High):** Fix token leakage in `server/middleware/imageAuth.js` by removing or redacting support for query parameter tokens (`?token=`) in logs, or enforcing short lifetimes.
- [ ] **Security/Architecture (High):** Resolve "Split Brain" authentication. The local `users` table (migration `20251020000001`) risks desyncing from Supabase's `auth.users`. Consolidate user management to rely on Supabase as the source of truth.
- [ ] **Critical Logic (High):** Fix the file cleanup race condition in `server/routes/uploads.js`. If `ingestPhoto` fails, the file is deleted locally but may remain orphaned in Supabase Storage. Implement a cleanup mechanism in the catch block.

## Medium-Priority

- [ ] **Refactoring (Medium):** Address "Prop Drilling" in `App.jsx`. Move handlers and state (`handleSelectFolder`, `uploading`, etc.) into the Zustand store (`store.js`) to clean up component signatures.
- [ ] **Maintainability (Medium):** Fix dependency conflicts in `package.json` to remove the requirement for `--legacy-peer-deps` during install.

## Future

- [ ] **Scalability (Future):** Refactor uploads to stream directly to Supabase Storage, bypassing the local `os.tmpdir()` disk write to prevent bottlenecks under high load.

# Environment Variables

# React Photo Filtering App

[![Tests](https://img.shields.io/badge/tests-86%20passing-brightgreen.svg)](https://github.com/Inouye165/React-Photo-App)
[![Security](https://img.shields.io/badge/security-JWT%20Auth-blue.svg)](https://jwt.io/)
[![HEIC Support](https://img.shields.io/badge/HEIC-Auto%20Convert-orange.svg)](https://en.wikipedia.org/wiki/High_Efficiency_Image_Format)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.0-646cff.svg)](https://vitejs.dev/)
[![Testing](https://img.shields.io/badge/Testing-Vitest%20%2B%20Jest-6e9f18.svg)](https://vitest.dev/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A full-screen React application for filtering, browsing, and uploading photos by date range, with a secure Node.js Express backend featuring JWT authentication, automatic HEIC conversion, and AI-powered metadata extraction. Features comprehensive testing with 86 tests covering authentication, security, and advanced image processing.

**Author:** Ron Inouye

## Table of Contents

 - [Integration runner (developer tool)](#integration-runner-developer-tool)

## 🆕 What's New (October 2025)

### 🔐 Authentication & Security System

### 🖼️ Advanced HEIC Support  

### Testing & Quality Enhancement

### Image Processing Improvements

### UX Improvements

### Developer Experience  

## Key Features (2025 Update)

### 🔐 Security & Authentication

### 📸 Advanced Photo Management

### 🤖 AI & Processing

- The backend routes every AI operation (router, scenery narrative, collectible appraisal) through OpenAI vision-capable models by default. Overrides are accepted, but they are automatically coerced to a known image-aware model so requests that include `image_url` payloads never hit schema errors again.
- When we introduce text-only AI workflows in the future, the model selector will branch on the request payload and allow text-only models for those flows. Until that feature lands, assume all jobs carry images and must target a vision model.
- Processed metadata is written back to the database together with the effective model names so operators can audit which models ran each job.
- **Dynamic model catalog** — the server now exposes `GET /photos/models`, a signed-in endpoint backed by a live OpenAI allowlist (with fallbacks). The frontend `ModelSelect` component consumes it at runtime so new model releases or account-specific fine-tunes appear automatically without redeploying the UI.

### 🎨 User Interface

### 🧪 Quality Assurance
  - **Frontend**: 66 tests with Vitest + React Testing Library covering user interactions, state management, error handling, accessibility, and authentication utilities  
  - **Backend**: 20+ tests with Jest + Supertest covering API endpoints, database operations, file upload handling, authentication flows, security middleware, and HEIC conversion
  - **Integration**: Complete end-to-end authentication and image access workflows
  - **Security Testing**: Validation of JWT flows, CORS configuration, and security headers
  - **Regression Prevention**: Tests specifically designed to prevent previously encountered issues
  - **Test Isolation**: Proper DOM cleanup between tests and comprehensive mocking strategies

## Usage (2025)

1. Start the backend server (`cd server && npm start`).
2. Start the frontend (`npm run dev`).
3. In the app, click "Select Folder for Upload" to pick a local folder.
4. Filter/select photos by date, then upload to the backend.
5. The backend view shows all photos, metadata, privileges, and hash info. No duplicates are stored.
6. If a file fails AI processing (shows 'AI processing failed'), POST to `/debug/reset-ai-retry` and click "Recheck Inprogress AI" to retry.
7. The upload panel is now flush with the viewport edges, matching other views. The file list is compact and readable.

## File Hashing & Deduplication


## Technical Stack

### Frontend
   - **Authentication Utilities**: Secure token handling and authenticated image URL generation
   - **PhotoUploadForm.jsx**: Upload panel with compact file list, flush-edge layout
   - **ImageCanvasEditor.jsx**: Interactive canvas editor for positioning captions on images
   - **EditPage.jsx**: Photo editing interface with canvas, metadata forms, and authenticated image access

### Backend

- **Dynamic AI model endpoint**: authenticated clients can call `GET /photos/models` to receive the current allowlisted OpenAI model IDs. The server refreshes this list from the OpenAI API with safe fallbacks so the frontend selects only supported models.
- Routes enforce the same allowlist for overrides supplied through `/photos/:id/run-ai` and `/photos/:id/recheck-ai`, guaranteeing consistent validation across the stack.

## File Structure

```
photo-app/
├── public/
├── src/
│   ├── App.jsx                # Main application component with photo filtering logic
│   ├── EditPage.jsx           # Photo editing interface with canvas and metadata forms
│   ├── ImageCanvasEditor.jsx  # Interactive canvas for positioning captions on images
│   ├── PhotoUploadForm.jsx    # Upload panel with compact file list
│   ├── PhotoGallery.jsx       # Photo gallery display component
│   ├── Toolbar.jsx            # Fixed navigation toolbar
│   ├── api.js                 # Backend API communication utilities
│   ├── test/
│   │   └── setup.js           # Global test configuration and mocks
│   ├── *.test.jsx             # Component test suites (54 tests total)
│   ├── index.css              # Tailwind CSS imports
│   └── main.jsx               # React entry point
├── server/                     # Backend Node.js server
│   ├── server.js              # Express server with upload endpoints
│   ├── tests/
│   │   ├── uploads.test.js    # API endpoint tests (9 tests)
│   │   └── db.test.js         # Database operation tests
│   ├── package.json           # Server dependencies
│   └── README.md              # Server documentation
├── tailwind.config.js         # Tailwind configuration
├── postcss.config.js          # PostCSS configuration
├── vite.config.js             # Vite configuration
├── package.json               # Frontend dependencies and scripts
└── README.md                  # This documentation
```

## Getting Started

### Prerequisites

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Inouye165/React-Photo-App.git
   cd React-Photo-App
   ```

2. Install frontend dependencies:
   ```bash
   npm install
   ```

3. Install backend dependencies:
   ```bash
   cd server
   npm install
   cd ..
   ```

### Development

1. Start the backend server:
   ```bash
   cd server
   npm start
   ```
   Server will run on `http://localhost:3001`

2. Start the frontend development server (in new terminal):
   ```bash
   npm run dev
   ```
   Frontend will be available at `http://localhost:5173`

## Docker containers

This project uses a small set of optional but recommended Docker containers during development. The only container required by the default codebase is Redis (used by BullMQ for background AI and image-processing jobs). Other containers you may see on your machine (for example `qdrant`, local `photo-ai` services, or other leftover images) are NOT required by this repository unless you have intentionally re-wired the AI/vector-store adapters.

Summary:

- Required (recommended for normal dev):
   - `redis` / any container exposing port 6379 — used by `server/queue` (BullMQ). When Redis is available the server enqueues AI processing work and the worker processes it in the background. If Redis is not available the server will fall back to synchronous processing (slower and may block requests).

- Optional / Not required by default:
   - `qdrant` (vector DB) — there are no references to Qdrant in this repo. Start it only if you have custom changes that use a vector DB.
   - `photo-ai` or other local LLM services — the project uses OpenAI via LangChain by default (`server/ai/langchain/agents.js`). A local `photo-ai` container is only needed if you replaced the OpenAI adapters to call your local model.

Quick commands (PowerShell)

List containers on your machine:
```powershell
docker ps -a --format "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
```

Start the recommended Redis container (example used in developer docs):
```powershell
# run a lightweight Redis container
docker run -d --name photo-app-redis -p 6379:6379 redis:7.2-alpine

# if an existing stopped container named `photo-app-redis` already exists, start it instead:
docker start photo-app-redis
```

If you want to start all stopped containers on your machine (careful — this may start unrelated services):
```powershell
docker start $(docker ps -a -q)
```

Stop and remove a container when you're done:
```powershell
docker stop photo-app-redis
docker rm photo-app-redis
```

Notes and recommendations

- Keep a single Redis instance running while developing the app to get background processing and avoid synchronous fallbacks.
- Do not start unrelated `qdrant` containers unless you intend to add vector DB functionality; they consume memory and are unnecessary for the current codebase.
- If Redis fails to start, inspect logs with `docker logs photo-app-redis --tail 200` and recreate the container if necessary (`docker rm` then `docker run`).

If you'd like, I can also add a short note to `server/README.md` with the same commands and a link to this top-level README section.

### Authentication Setup

The application requires user authentication for all image operations. On first run:

1. **Register a new account**: Navigate to the login page and create an account with username, email, and password
2. **Login**: Use your credentials to obtain a JWT token (valid for 24 hours)
3. **Session cookie**: After login the server sets an httpOnly cookie named `authToken`. The frontend should make API and image requests to the API origin (VITE_API_URL) with credentials included (fetch/axios: `credentials: 'include'`) so the browser sends the cookie automatically. Do not place JWTs in URLs or localStorage.
4. **Multi-device support**: Login on multiple machines with the same account for seamless multi-machine workflows

**Security Features:**

### Environment Configuration

The frontend uses environment variables for configuration:


To override for production or different environments, create a `.env` file in the root directory:

```bash
VITE_API_URL=https://your-production-api.com
```

This allows easy deployment to different environments without code changes.

## Environment Variables (template)
 Copy `.env.example` to `.env` in both the root and `server/` directories.
 Fill in all required values before running the app.
 Do not commit `.env` files to source control.
 **Robust Environment Handling:** The app is designed to work across different machines and CI environments. If an environment variable (like `VITE_API_URL`) is missing, the app will fall back to a safe default (`http://localhost:3001`) and warn you. This prevents crashes when switching between desktop, laptop, or CI.
 **Tip:** Always check `.env.example` for required variables after pulling new changes or switching machines.
# Frontend (Vite)
 **Dependency errors:** If you see errors about conflicting dependencies (e.g., ERESOLVE), always use `npm install --legacy-peer-deps`.
 **Missing libraries:** If you see errors like "Cannot find module 'zustand'" or '@supabase/supabase-js', run `npm install <package> --legacy-peer-deps` in the correct directory (root for frontend, `server/` for backend).
 **Missing environment variables:** If you see errors about missing environment variables, ensure you have copied `.env.example` to `.env` and filled in all required values in both root and `server/`.
 **Wrong install directory:** Always run frontend installs in the project root and backend installs in the `server/` directory.
 **ImageMagick not found:** Make sure ImageMagick is installed and available in your system PATH for HEIC/HEIF fallback support.
 **Environment switching:** If you move between machines (desktop, laptop, CI), always copy `.env.example` to `.env` and review the values. The app will use safe defaults if variables are missing, but some features may require explicit configuration.
# Map keys and map styling

- `VITE_GOOGLE_MAPS_API_KEY` - (Required for Google maps in the front-end) Add a browser key restricted to `http://localhost:5173/*` (or your dev host) and enable the **Maps JavaScript API**. Place this key in the root `.env` and **do not** commit it.
- `VITE_GOOGLE_MAPS_MAP_ID` - (Optional) Map ID if you're using a custom Google Maps style or `AdvancedMarker` which may require a specific mapId. You can fetch or create this ID in the Google Cloud console under Maps Platform → Map Management → Map IDs.

If `VITE_GOOGLE_MAPS_API_KEY` is missing, the UI will show a fallback OpenStreetMap preview automatically when the selected photo contains GPS coordinates. To get a full Google Maps experience (AdvancedMarker, styled map), set `VITE_GOOGLE_MAPS_API_KEY` and `VITE_GOOGLE_MAPS_MAP_ID`.
# OPENAI_API_KEY=sk-your_openai_api_key
```
Do not commit `.env` to source control. Add it to `.gitignore`.

### Build

```bash
```

Preview the production build:
```bash
Run the test suite:
```bash
npm run test:run

npm run test:coverage

# Backend tests (Jest) - 20+ tests
cd server
npm test

# Quick test validation across all components
node test-runner.js
```

The project includes comprehensive testing across frontend and backend:

#### Frontend Tests (66 tests with Vitest + React Testing Library)
- **Component Testing**: All React components (App, PhotoGallery, PhotoUploadForm, Toolbar, EditPage)
- **Authentication Testing**: JWT token handling, secure URL generation, multi-source authentication
- **User Interaction Testing**: Clicks, form inputs, navigation, drag-and-drop
- **State Management Testing**: Photo loading, filtering, uploads, authentication state
- **Error Handling Testing**: API failures, validation errors, authentication failures
- **Accessibility Testing**: ARIA attributes, keyboard navigation
- **E2E Testing**: Complete upload workflow from folder selection to backend storage
- **Security Testing**: Token validation, URL security, localStorage error handling
- **Mock Integration**: External dependencies (APIs, file systems, authentication)

#### Backend Tests (20+ tests with Jest + Supertest)
- **Authentication Testing**: JWT validation, login/register flows, token expiration
- **Security Testing**: Rate limiting, input validation, CORS configuration, security headers
- **API Endpoint Testing**: Authenticated upload endpoints, error handling, file validation
- **Image Processing Testing**: HEIC conversion, Sharp/ImageMagick fallbacks, thumbnail generation
- **Database Testing**: SQLite operations, schema constraints, CRUD operations, user management
- **Integration Testing**: Complete authenticated request/response cycles
- **Error Scenarios**: Permission errors, disk issues, invalid files, authentication failures
- **Multi-machine Testing**: File sync scenarios, graceful degradation

**Total: 86 tests with robust coverage of authentication, security, and HEIC functionality**

## Usage

1. Open the application in a modern web browser
2. Click "Select Folder for Upload" - the folder picker will open in your Pictures folder (on supported browsers)
3. The application will scan and display all supported image files in chronological order
4. Use the "Start Date" and "End Date" inputs to filter photos by date taken
5. The list updates instantly as you change dates, showing the filtered count
6. Click "Upload" to send filtered photos to the backend
7. The backend view shows all photos, metadata, privileges, and hash info
8. Click on a photo to edit it - the interactive canvas editor allows you to position captions on the image:
   - Drag the text to reposition it anywhere on the image
   - Use the controls to adjust font size and color
   - Edit the caption text directly in the editor
   - Click "Save Captioned Image" to persist your text positioning and styling
9. If a file fails AI processing (shows 'AI processing failed'), POST to `/debug/reset-ai-retry` and click "Recheck Inprogress AI" to retry

## Thumbnails

- **Automatic thumbnail generation**: The backend generates thumbnails for every image in the `working` folder and serves them from `/thumbnails/<hash>.jpg` so the frontend can display fast previews without re-reading original files.
- **HEIC/HEIF support and fallback**: Thumbnails are generated with `sharp` when possible. If `sharp`/libvips lacks HEIF/HEIC support, the server will attempt a fallback conversion using ImageMagick (the `magick` command) to create thumbnails. Install ImageMagick with HEIF delegates on your system to enable the fallback.

## HEIC/HEIF AI Processing Support
- HEIC/HEIF files are now supported for AI processing. If the backend cannot convert HEIC using sharp, it will automatically use ImageMagick as a fallback.
- If a file fails AI processing (shows 'AI processing failed'), you can reset its retry count by POSTing to `/debug/reset-ai-retry` and then clicking 'Recheck Inprogress AI' in the frontend to retry processing.
- For new HEIC files, no manual intervention is needed.

## Troubleshooting
- **HEIC/HEIF 'bad seek' errors**: These are expected when Sharp can't decode certain HEIC variants. The system automatically falls back to ImageMagick - no action needed.
- **ImageMagick not found**: Make sure ImageMagick is installed and available in your system PATH for HEIC/HEIF fallback support.
- **AI processing failures**: Check the backend logs. You can reset retry counts via `/debug/reset-ai-retry` and click 'Recheck Inprogress AI'.
- **Test failures**: Run `npm test` to see detailed error messages. Ensure all dependencies are installed and environment is properly configured.

## Known Limitations

- **Browser Security**: Only works with locally selected files due to browser security restrictions
- **Performance**: Large folders may take time to process initially  
- **EXIF Dependency**: EXIF data reading depends on photo metadata being present
- **Date Fallback**: Falls back to file modification date if EXIF date is unavailable
- **API Requirements**: File System Access API requires user gesture and HTTPS in production
- **Browser Support**: Modern browsers required for full feature set (Chrome, Edge recommended)

# Project TODOs

## High-Priority

- [ ] **Security (High):** Fix token leakage in `server/middleware/imageAuth.js` by removing or redacting support for query parameter tokens (`?token=`) in logs, or enforcing short lifetimes.
- [ ] **Security/Architecture (High):** Resolve "Split Brain" authentication. The local `users` table (migration `20251020000001`) risks desyncing from Supabase's `auth.users`. Consolidate user management to rely on Supabase as the source of truth.
- [ ] **Critical Logic (High):** Fix the file cleanup race condition in `server/routes/uploads.js`. If `ingestPhoto` fails, the file is deleted locally but may remain orphaned in Supabase Storage. Implement a cleanup mechanism in the catch block.

## Medium-Priority

- [ ] **Refactoring (Medium):** Address "Prop Drilling" in `App.jsx`. Move handlers and state (`handleSelectFolder`, `uploading`, etc.) into the Zustand store (`store.js`) to clean up component signatures.
- [ ] **Maintainability (Medium):** Fix dependency conflicts in `package.json` to remove the requirement for `--legacy-peer-deps` during install.

## Future

- [ ] **Scalability (Future):** Refactor uploads to stream directly to Supabase Storage, bypassing the local `os.tmpdir()` disk write to prevent bottlenecks under high load.