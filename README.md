# Quick Start

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

- **Migrations failing on start:** If you see migration errors during `npm start`, they may contain Postgres-specific SQL that `sqlite3` (the default development DB) does not support. The development `knexfile.js` now defaults to a local sqlite3 database (`server/working/dev.db`). To run migrations against Postgres instead, set `USE_POSTGRES=true` or provide `SUPABASE_DB_URL` in `server/.env`, or run migrations manually against a Postgres instance.
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

- Copy `.env.example` to `.env` in both the root and `server/` directories.
- Fill in all required values before running the app.
- Do not commit `.env` files to source control.
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

- [🆕 What's New](#-whats-new-october-2025)
- [Key Features](#key-features-2025-update)
- [Usage](#usage-2025)
- [Technical Stack](#technical-stack)
- [File Structure](#file-structure)
- [Getting Started](#getting-started)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
 - [Integration runner (developer tool)](#integration-runner-developer-tool)

## 🆕 What's New (October 2025)

### 🔐 Authentication & Security System
- **JWT-Based Authentication**: Secure login system with 24-hour token expiration and bcrypt password hashing
- **Image Access Security**: All image requests require authentication via an httpOnly cookie (preferred for browser clients) or an Authorization Bearer header. Query-parameter tokens in URLs (for example `?token=...`) are no longer accepted and will be rejected by the server. This prevents token leakage via logs, browser history, or Referer headers.
- **Session Strategy**: The server favors httpOnly cookie sessions for browser clients; Authorization headers are supported for non-browser clients. Avoid storing tokens in localStorage and never embed them in URLs.
- **Security Headers**: Comprehensive security middleware with Helmet (CSP, HSTS, XSS protection)
- **CORS Configuration**: Properly configured cross-origin resource sharing for development and production
- **Account Security**: Rate limiting, input validation, and account lockout protection

### 🖼️ Advanced HEIC Support  
- **Automatic HEIC Conversion**: Server automatically converts HEIC files to JPEG for browser compatibility
- **Multi-Machine File Sync**: Robust handling of database/file synchronization across multiple development machines
- **Smart Fallback Processing**: Sharp → ImageMagick → graceful error handling for unsupported formats
- **Authenticated Image URLs**: All images served through secure, authenticated endpoints

### Testing & Quality Enhancement
- **Expanded Test Suite**: 86 tests covering authentication, security, HEIC conversion, and existing functionality
- **Authentication Testing**: Comprehensive validation of JWT flows, token handling, and security middleware
- **HEIC Conversion Testing**: Complete testing of file conversion, fallback mechanisms, and error scenarios
- **Security Testing**: Validation of all security headers, rate limiting, and input sanitization
- **Frontend Testing**: 66 tests using Vitest + React Testing Library with new authentication utilities
- **Backend Testing**: 20+ tests using Jest + Supertest for secure API endpoints and file operations
- **Integration Testing**: End-to-end authentication and image access workflows
- **Regression Prevention**: Tests specifically designed to prevent previously encountered issues

### Image Processing Improvements
- **Optimized HEIC Logging**: Reduced noise in conversion logs - only logs errors when both Sharp and ImageMagick fail
- **Smart Fallback**: Silent failover from Sharp to ImageMagick for HEIC files with unsupported codecs
- **Clean Console Output**: Error messages only appear when action is needed

### UX Improvements
- **Toolbar Messaging**: Upload success messages now appear in the toolbar for persistent feedback
- **Better User Feedback**: Non-intrusive success notifications that persist until dismissed
- **Fixed Edit Button**: Edit functionality properly wired with delete confirmation dialogs

### Developer Experience  
- **Modern Testing Stack**: Vitest for frontend, Jest for backend with proper test isolation
- **Mock Strategy**: Comprehensive mocking of APIs, filesystem, and database operations
- **Test Coverage**: State management, user interactions, error scenarios, database operations, and accessibility

## Key Features (2025 Update)

### 🔐 Security & Authentication
- **JWT Authentication System:** Secure login with bcrypt password hashing and 24-hour token expiration
- **Protected Image Access:** All images are served through authenticated endpoints that require a valid session. Browser clients should use the httpOnly cookie-based session (the server sets an `authToken` cookie on login). Non-browser clients may use an Authorization Bearer header.
- **Session Policy:** Query-parameter tokens are deprecated and rejected by the server. Frontend code should request images from the API origin so the browser sends the httpOnly cookie automatically.
- **Security Middleware:** Comprehensive protection with Helmet (CSP, HSTS, XSS), rate limiting, and input validation
- **CORS Configuration:** Properly configured cross-origin resource sharing for secure frontend access

### 📸 Advanced Photo Management
- **Backend-driven workflow:** All photo management, metadata, and permissions are handled by the backend server. The React app fetches and displays everything from backend APIs.
- **Enhanced HEIC/HEIF Support:** Automatic conversion to JPEG with Smart fallback (Sharp → ImageMagick), authenticated serving, and multi-machine file synchronization
- **Folder picker & date filter:** Select a local folder, filter photos by date (using EXIF/file dates), and upload only the filtered files to the backend.
- **Hash-based deduplication:** Every file is hashed (SHA-256) on upload/ingest. Duplicate files (by content) are automatically skipped. The UI shows the last 5 digits of each file's hash.
- **Privileges column:** The app displays actual file system privileges (read/write/execute) for each photo as reported by the backend.
- **Automatic DB migration:** The backend automatically upgrades the database schema (e.g., adds missing columns) on startup, with no data loss.
- **Robust error handling:** All errors and upload messages are shown in a prominent toast at the top of the app.

### 🤖 AI & Processing
- **AI-powered captions and descriptions:** The backend uses OpenAI Vision to generate captions, descriptions, and keywords for each photo, including HEIC/HEIF files.
- **Interactive Canvas Editor:** Edit photos with an interactive canvas that allows you to position captions directly on images. Drag text to reposition, customize font size and color, and save your layout preferences. Text styling persists across editing sessions.

### 🎨 User Interface
- **Upload panel:** The photo upload panel now fills the viewport under the toolbar, with a compact file list and flush-edge layout. No large image previews; file list shows filename, date, size, and type.
- **Responsive Design:** Works seamlessly across desktop and mobile devices with touch-friendly interfaces

### 🧪 Quality Assurance
- **Comprehensive Testing Suite:** Production-ready testing with Vitest and Jest. 86 tests total:
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

- Every photo is hashed (SHA-256) on upload or server start.
- If a file with the same hash already exists, it is skipped (not re-uploaded or re-indexed).
- The UI shows a ✔ and the last 5 digits of the hash for each photo.

## Technical Stack

### Frontend
- **React 19**: Latest React with modern hooks and authentication context
- **Vite**: Fast build tool and dev server  
- **Tailwind CSS**: Utility-first CSS framework
- **Session management**: httpOnly cookie-based sessions for browser clients. Do not store JWTs in localStorage.
- **Authentication Utilities**: Ensure image and API requests target the API origin (VITE_API_URL) so the browser will include the httpOnly `authToken` cookie (use fetch/axios with `credentials: 'include'`). Do not inject tokens into image URLs.
- **exifr**: Library for reading photo metadata
- **File System Access API**: Modern browser API for folder selection
- **react-konva**: Canvas library for interactive image editing with draggable text overlays
- **ESLint**: Code linting and formatting
- **Vitest**: Modern testing framework for frontend with React Testing Library
- **Component Testing**: Comprehensive test coverage with 66 frontend tests across all major components:
   - **Authentication Utilities**: Secure token handling and authenticated image URL generation
   - **PhotoUploadForm.jsx**: Upload panel with compact file list, flush-edge layout
   - **ImageCanvasEditor.jsx**: Interactive canvas editor for positioning captions on images
   - **EditPage.jsx**: Photo editing interface with canvas, metadata forms, and authenticated image access

### Backend
- **Node.js**: JavaScript runtime for server
- **Express**: Web framework for REST API with authentication middleware
- **JWT Authentication**: JSON Web Tokens for secure user sessions with bcrypt password hashing
- **Security Middleware**: Helmet for security headers, rate limiting, input validation, CORS configuration
- **Multer**: Middleware for handling multipart/form-data file uploads with authentication
- **Sharp**: Image processing with automatic HEIC-to-JPEG conversion (with ImageMagick fallback)
- **ImageMagick**: Fallback for HEIC/HEIF conversion when sharp/libvips lacks support
- **SQLite3**: Lightweight database for photo metadata, user accounts, and state management
- **Jest**: Testing framework for backend with Supertest for HTTP testing
- **Comprehensive API Testing**: 20+ tests covering authenticated endpoints, security middleware, HEIC conversion, database operations, and error handling

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
- Node.js (v18 or higher)
- npm or yarn
- Modern web browser (Chrome, Edge recommended for full features)
- [ImageMagick](https://imagemagick.org/) installed and available in your system PATH (for HEIC/HEIF support)

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

### Authentication Setup

The application requires user authentication for all image operations. On first run:

1. **Register a new account**: Navigate to the login page and create an account with username, email, and password
2. **Login**: Use your credentials to obtain a JWT token (valid for 24 hours)
3. **Session cookie**: After login the server sets an httpOnly cookie named `authToken`. The frontend should make API and image requests to the API origin (VITE_API_URL) with credentials included (fetch/axios: `credentials: 'include'`) so the browser sends the cookie automatically. Do not place JWTs in URLs or localStorage.
4. **Multi-device support**: Login on multiple machines with the same account for seamless multi-machine workflows

**Security Features:**
- Passwords hashed with bcrypt
- JWT tokens with 24-hour expiration  
- Rate limiting on login attempts
- Account lockout protection
- Secure image serving with authentication validation

### Environment Configuration

The frontend uses environment variables for configuration:

- `VITE_API_URL`: Base URL for the backend API (default: `http://localhost:3001`)

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
```text
# Frontend (Vite)
 **Dependency errors:** If you see errors about conflicting dependencies (e.g., ERESOLVE), always use `npm install --legacy-peer-deps`.
 **Missing libraries:** If you see errors like "Cannot find module 'zustand'" or '@supabase/supabase-js', run `npm install <package> --legacy-peer-deps` in the correct directory (root for frontend, `server/` for backend).
 **Missing environment variables:** If you see errors about missing environment variables, ensure you have copied `.env.example` to `.env` and filled in all required values in both root and `server/`.
 **Wrong install directory:** Always run frontend installs in the project root and backend installs in the `server/` directory.
 **ImageMagick not found:** Make sure ImageMagick is installed and available in your system PATH for HEIC/HEIF fallback support.
 **Environment switching:** If you move between machines (desktop, laptop, CI), always copy `.env.example` to `.env` and review the values. The app will use safe defaults if variables are missing, but some features may require explicit configuration.
 **Test failures after environment change:** If tests fail after switching machines, check for missing `.env` files, dependency mismatches, or Node.js version differences. Run `npm install` and verify your environment variables.
# OPENAI_API_KEY=sk-your_openai_api_key
```
Do not commit `.env` to source control. Add it to `.gitignore`.

### Build

```bash
npm run build
```

Preview the production build:
```bash
Run the test suite:
```bash
npm run test:run

# Run frontend tests with UI dashboard
npm run test:ui

# Run frontend tests with coverage report
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
- **App.test.jsx** (14 tests): Main application component, photo loading, view switching, upload flow
- **App.e2e.test.jsx** (1 test): End-to-end upload workflow testing
- **PhotoGallery.test.jsx** (13 tests): Gallery rendering, photo actions, metadata display, edit/delete functionality
- **PhotoUploadForm.test.jsx** (20 tests): Upload modal, date filtering, file selection
- **Toolbar.test.jsx** (12 tests): Navigation, toolbar messages, button interactions
- **utils.test.js** (6 tests): Utility functions and helper methods
- **authUtils.test.js** (20 tests): Authentication utilities, secure URL generation, token handling, error scenarios

#### Backend (20+ tests - Jest + Supertest)
- **uploads.test.js** (9 tests): Upload endpoints, file validation, duplicate detection, error handling
- **db.test.js**: Database operations, schema management, CRUD operations
- **imageAuth.test.js**: Image authentication middleware, JWT validation, CORS headers
- **displayEndpoint.test.js**: Authenticated image serving, HEIC conversion, file existence checking
- **heicConversion.test.js**: HEIC-to-JPEG conversion, Sharp/ImageMagick fallbacks, error handling
- **security.test.js**: Security headers, rate limiting, input validation, XSS/SQL injection protection
- **integration.test.js**: End-to-end authentication flows, multi-machine scenarios, performance testing

### Test Architecture  
- **Vitest**: Modern testing framework with native Vite integration for frontend
- **Jest**: Traditional testing framework with Supertest for backend HTTP testing
- **React Testing Library**: User-centric component testing approach
- **Mock Strategy**: Isolated tests with proper API, filesystem, and database mocking
- **Test Isolation**: DOM cleanup between tests, no cross-test contamination
- **CI Ready**: All 63 tests pass consistently for automated deployment

## Project TODOs

This section is a concise project-facing TODO list. Each item is marked with one of the following statuses:

- TODO — planned work that should be implemented.
- COMPLETED — work already finished.
- TO BE CONSIDERED — ideas or optional items that require discussion before making them TODOs.

### High priority
- [COMPLETED] Remove JWT-in-query-params for image URLs and rely on httpOnly cookie sessions (server rejects `?token=` on image endpoints).

### Architecture & core
- [TODO] Consolidate frontend global state into `src/store.js` (Zustand): migrate auth slice (user, loading, isAuthenticated), move UI state (selectedPhoto, editingPhoto, uploading), and extract inlined components to `src/components/`.
- [TODO] Remove synchronous AI processing (`?waitForAI=true`) and enforce async queueing (enqueue job, return 202). Update API docs and remove blocking parameter.
- [TO BE CONSIDERED] Review and simplify storage move / fallback logic in the backend to reduce brittle edge cases and add tests for failure paths.

### UX
- [TODO] Replace blocking `window.confirm` dialogs with a non-blocking `ConfirmModal` and provide an optional 'Undo' toast pattern.
- [TODO] Add filename search and full-size preview modal in frontend.

### Performance & reliability
- [TODO] Resize and compress images before sending to OpenAI Vision API (JPEG, max 1024x1024, quality 70–80).
- [TODO] Make thumbnail generation asynchronous and cache-optimized (background worker + caching).
- [TODO] Add client-side content-hash check to avoid uploading duplicates (compute hash in browser and skip upload if server has hash).

### Real-time updates
- [TODO] Implement Server-Sent Events (SSE) or WebSockets for AI job completion and live thumbnail/state updates. Start with SSE for a simple server→client channel.

### CI / DevOps
- [TODO] Add GitHub Actions CI pipeline for automated testing, build, and linting (ensure it runs on PRs and push).
- [TO BE CONSIDERED] Run secret-scanning (gitleaks or similar) on all pushes/PRs in CI — ensure proper rules and exceptions are configured to reduce false positives.

### Tests & robustness
- [COMPLETED] Add edge-case upload tests (zero-byte files, unsupported MIME types, corrupt/missing EXIF) in `server/tests/uploads.test.js`.
- [TODO] Expand test vectors (large files, malformed multipart payloads) and add CI checks to run backend tests on PRs.

If you prefer another ordering or want items grouped differently, tell me which items to promote to top priority and I will update this list.

## Future Enhancements (validated)

The following items were reviewed and validated as practical next steps for this repository. Each entry includes a short rationale and suggested next steps.

- State Management Consolidation — AGREED
   - Rationale: Consolidating global UI and auth state into the existing `Zustand` store (`src/store.js`) reduces the number of providers, centralizes state mutations, and simplifies debugging and testing.
   - Notes / Cautions: Keep authentication verification behavior (httpOnly cookie verification via the server) intact — do not store sensitive tokens client-side. Move the `AuthContext` effect that calls `/auth/verify` into a store initializer or a small hook that hydrates the store at app start. Avoid introducing SSR-sensitive code into the client-only store.
   - Suggested next steps: add `auth` slice to `src/store.js`, migrate `user`, `loading`, `isAuthenticated` and `login/register/logout` adapters, update components to read from the store, and remove `src/contexts/AuthContext.jsx` once tests are green.

- Asynchronous Job Notifications — AGREED
   - Rationale: Replacing polling with a push-based channel yields a more responsive UI and reduces unnecessary client requests. The backend already enqueues AI jobs; once the queue completes processing, a push notification can inform clients immediately.
   - Recommendation: Start with Server-Sent Events (SSE) for a simple, server→client-only channel. Use WebSockets only if you need bidirectional messages or complex subscriptions. Implement a lightweight SSE endpoint on the server that emits job-complete events (photoId, status, updated metadata), and add a small client hook (`useAIEvents` or similar) to subscribe and update the store.
   - Suggested next steps: add SSE/WebSocket endpoint, add `useAIEvents` hook, wire to `src/store.js` to update photo metadata on event, add tests for subscription behavior.

- Non-Blocking UX Modals — AGREED
   - Rationale: Blocking browser dialogs (`window.confirm`) interrupt user flow and are less accessible and customizable than in-app modals. A custom non-blocking modal allows undo/timeout patterns, consistent design, and improved accessibility.
   - Suggested next steps: create a `ConfirmModal` component and a small modal manager in the global store, replace `window.confirm` uses with a promise-based modal API or a callback-based flow, and add an optional 'Undo' toast for deletions.

- Component Refactoring — NOT ADDED (already covered)
   - Reason: The repository's existing TODOs and architecture section already recommend extracting inlined components (notably the photo editing modal) and modularizing `src/App.jsx`. This is an agreed architectural direction and is tracked under "Architecturally important TODOs" in this README; no duplicate entry was added here.

- CI/CD & DevOps (secret scanning on push) — NOT ADDED (already covered)
   - Reason: The README already documents Husky pre-commit secret scanning, CI secret-scan jobs, and recommended GitHub Actions updates in the "Recommended security & CI TODOs" section. The suggested improvement (run gitleaks or similar on every push/PR) is a good practice and is already represented; implementers should ensure the CI job triggers on push/PR and has access to required repository secrets.

- Robustness & Test Coverage — AGREED (and implemented)
   - Rationale: Explicit tests for edge-case upload scenarios improve long-term robustness. Tests added include: zero-byte file rejection, unsupported MIME type rejection, and handling of corrupt/missing EXIF data. These are now present in `server/tests/uploads.test.js` and associated mocks.
   - Suggested next steps: keep expanding test vectors (very large files, boundary file size, malformed multi-part uploads) and add CI checks to run the backend test suite on PRs.

If you'd like, I can open a small PR that extracts the `Auth` slice into `src/store.js` (with tests), a follow-up PR to add an SSE endpoint and client hook, or a PR that replaces `window.confirm` calls with a `ConfirmModal` component wired to the global store.

### UX: Deletion confirmation & success messaging (future TODOs)

- Make the delete confirmation optional via a user preference (localStorage or account setting) so users who find the browser confirm() annoying can disable it.
- Replace the blocking browser confirm() with a non-blocking modal that includes a "Don't show this again" checkbox and stores the user's preference.
- Offer an "Undo" pattern: instead of a persistent dismiss-required toast, show a temporary toast with an Undo button (e.g. 5–10s) that restores the deleted item if pressed.
- Auto-dismiss success toasts after a short configurable timeout (3–5s) to avoid requiring manual dismissal for routine actions.
- Add a global Settings panel where users can toggle: Confirm on delete (on/off), Success toast auto-dismiss timeout, and Enable Undo for deletes.
- For bulk deletes, show a stronger confirmation dialog and require explicit acknowledgement (checkbox + button) to prevent accidental data loss.
- Add telemetry/logging (opt-in) to measure how often users disable confirmations so UX defaults can be adjusted.

These options will make the delete UX less intrusive and provide safer recovery options while preserving protection against accidental deletes.

### Recommended security & CI TODOs (priority)

- **HUSKY pre-commit secret-scan (HIGH PRIORITY — recommended)**: add Husky and a pre-commit hook that scans staged files for potential secrets (API keys, private keys, tokens) and blocks commits when matches are found. Provide a command to opt-in/install hooks for contributors and document it in the README (example: `npm run prepare` to install Husky hooks). This helps prevent accidental credential commits.

- Update GitHub Actions workflows to use repository secrets and remove any embedded test/placeholder keys from workflow YAMLs. Document required secret names (e.g., `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY`, `JWT_SECRET`) in `PRODUCTION_SETUP.md` or `server/README.md`.

- Add a CI job to run a secret-scan on PRs (e.g., detect accidentally committed secrets in the diff) and fail the build if sensitive data is found.

- Document a short secret-rotation / incident response procedure in the README (who to notify, how to rotate keys, and how to revoke exposed tokens) and link to it from `PRODUCTION_SETUP.md`.

- Add a small contributor onboarding note describing how to copy `.env.example` to `.env`, where to store secrets (repo secrets for CI), and how to enable Husky locally.

> Note: The Husky pre-commit hook is the recommended first step — it stops secret leaks at the source (dev machines) and is quick to add.

## Progress saved (work-in-progress)

- Modularized gallery and upload UI into `src/PhotoGallery.jsx` and `src/PhotoUploadForm.jsx`.
- Fixed upload callsites to use the backend upload endpoint and added upload/fetch logging.
- Upload panel now fills the viewport under the toolbar, with a compact file list and flush-edge layout. No large image previews; file list shows filename, date, size, and type.
- Server skips non-image files (e.g., desktop.ini) and logs them, instead of exiting. HEIC/HEIF support confirmed with ImageMagick fallback.
- **NEW: Interactive canvas editor implemented** - `ImageCanvasEditor.jsx` provides drag-and-drop text positioning on images with font size/color controls. Text styling persists across editing sessions.
- **NEW: Comprehensive testing suite implemented** - 66 tests (54 frontend + 9 backend + 1 E2E) covering all React components and API endpoints with Vitest, Jest, React Testing Library, and Supertest. Includes user interaction, state management, error handling, database operations, and accessibility testing.
- **NEW: Toolbar messaging system** - Upload success messages now appear in the toolbar instead of popup toasts, providing persistent feedback until dismissed or page reload.
- **NEW: Optimized HEIC conversion logging** - Reduced console noise by only logging errors when both Sharp and ImageMagick fail. Silent fallback for expected codec limitations.
- **FIXED: Photo editing workflow** - Edit button properly wired with `handleEditPhoto` prop, delete confirmation dialogs now work correctly.
- Remaining open items: CSS grid for thumbnails, live updates, search, GitHub Actions CI, and backend captioned image file export.

<!-- `App_clean.jsx` has been removed from the repository. Use `src/App.jsx` as the mounted entry. -->

## Contributing

### Development Workflow
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes
4. Run tests: `npm run test:run`
5. Ensure build passes: `npm run build`
6. Commit with descriptive messages
7. Push to your fork and submit a pull request

### Code Quality Standards
- All new components must include comprehensive tests
- Follow existing code patterns and naming conventions
- Ensure accessibility compliance (ARIA attributes, keyboard navigation)
- Update README documentation for new features
- Maintain test coverage: 66 tests minimum (54 frontend + 9 backend + E2E)
- Keep console output clean - only log actionable errors

### Testing Requirements  
- Write tests for new components using Vitest and React Testing Library (frontend)
- Write tests for new API endpoints using Jest and Supertest (backend)
- Test user interactions, not implementation details
- Include error handling and edge case scenarios
- Mock external dependencies appropriately
- Verify accessibility features work correctly
- Ensure all tests pass before submitting PR

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- React team for the excellent framework and developer tools
- Vite team for the fast build system  
- Testing Library community for user-centric testing approaches
- OpenAI for AI-powered image analysis capabilities
- Sharp and ImageMagick teams for robust image processing

## Integration runner (developer tool)

There's a small helper script and runner for exercising the backend's photo state workflow locally without requiring external services. It starts the server in test mode, sends a PATCH to the `/photos/:id/state` endpoint, captures server logs, and prints the response.

See `server/scripts/README.md` for usage notes and PowerShell examples.

## Supabase & local development (tips)

When running the server locally you have a few safe options to control whether the app uses the local sqlite fallback or connects to your Supabase Postgres instance. These options were added to make switching between machines and commits easier and to provide better diagnostics.

- Use the explicit opt-in flag (temporary for the shell):

```powershell
$Env:USE_POSTGRES='true'
npm --prefix server start
```

- Auto-detect Postgres: the server will prefer Postgres when `SUPABASE_DB_URL` is present in `server/.env`. You can opt-out of this behavior with:

```powershell
$Env:USE_POSTGRES_AUTO_DETECT='false'
npm --prefix server start
```

- Non-blocking smoke-checks: on startup the server runs a harmless Supabase check (lists storage buckets or does a tiny `photos` select) and logs success/failure; periodic checks run every 10 minutes by default. Control the interval with `SUPABASE_SMOKE_INTERVAL_MS` (milliseconds).

- Quick environment verification helper (local):

```powershell
# from repo root
node server/check-env.js
```

This prints which Supabase-related variables are present and exits non-zero if required variables are missing.

- Note: The `server/knexfile.js` development environment now defaults to a local sqlite3 database file at `server/working/dev.db`. This means the server will use sqlite by default unless you set `USE_POSTGRES=true` or provide `SUPABASE_DB_URL` (see `server/server.js` for the detection logic and behavior). If you require Postgres-specific features locally, set the opt-in environment variables or run a local Postgres instance for development.

Security reminder: never commit `server/.env` or any real service role keys to git. Use repository secrets for CI and rotate keys if they are ever committed or exposed.
