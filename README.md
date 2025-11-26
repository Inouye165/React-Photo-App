# React Photo App

[![Tests](https://img.shields.io/badge/tests-86%20passing-brightgreen.svg)](https://github.com/Inouye165/React-Photo-App)
[![Security](https://img.shields.io/badge/security-JWT%20Auth-blue.svg)](https://jwt.io/)
[![HEIC Support](https://img.shields.io/badge/HEIC-Auto%20Convert-orange.svg)](https://en.wikipedia.org/wiki/High_Efficiency_Image_Format)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.0-646cff.svg)](https://vitejs.dev/)
[![Testing](https://img.shields.io/badge/Testing-Vitest%20%2B%20Jest-6e9f18.svg)](https://vitest.dev/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A full-screen React application for filtering, browsing, and uploading photos by date range, with a secure Node.js Express backend featuring JWT authentication, automatic HEIC conversion, and AI-powered metadata extraction.

**Author:** Ron Inouye

## 🆕 What's New (November 2025)

- **[Scalability] Zero-Disk Streaming Uploads**: Photo uploads now stream directly to Supabase Storage using Busboy, eliminating local `os.tmpdir()` disk writes. This removes I/O bottlenecks under high load and enables horizontal scaling. Hash calculation and validation occur during streaming. Heavy processing (EXIF extraction, thumbnails) is deferred to BullMQ workers.

## 🆕 What's New (October 2025)

- **[Security] Enabled strict SSL certificate validation for production database connections**: Production now enforces `rejectUnauthorized: true` with CA certificate verification to prevent MITM attacks. Development/test environments remain flexible for local Docker containers.
- **[Security] Enforced httpOnly Cookie Authentication**: All API endpoints now strictly authenticate via httpOnly cookies. Bearer token header fallback removed from frontend - authentication is handled exclusively via secure cookies set by `/api/auth/session`. This eliminates token leakage risks from browser history, proxy logs, and referer headers.
- **Security & Authentication**: Complete overhaul with Supabase Auth integration, "Split Brain" fix, and centralized log redaction.
- **Advanced HEIC Support**: Automatic conversion with Sharp and ImageMagick fallbacks.
- **AI & Processing**: Dynamic model selection, background processing with BullMQ, and robust retry mechanisms.
- **Quality Assurance**: Comprehensive test suite (86 tests) covering frontend, backend, and security.

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- npm 10+
- ImageMagick (for HEIC fallback)
- Docker (optional, for Redis)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Inouye165/React-Photo-App.git
   cd React-Photo-App
   ```

2. **Install dependencies:**
   ```bash
   # Frontend
   npm install

   # Backend
   cd server
   npm install
   cd ..
   ```

3. **Configure Environment:**
   Copy `.env.example` to `.env` in both root and `server/` directories.
   ```bash
   cp .env.example .env
   cp server/.env.example server/.env
   ```
   *Note: You must configure a Postgres database (e.g., Supabase) in `server/.env`.*

4. **Start the Application:**
   ```bash
   # Terminal 1: Backend
   cd server
   npm start

   # Terminal 2: Frontend
   npm run dev
   ```

## 📚 Documentation

- **[TESTING.md](TESTING.md)**: Detailed guide on the test suite, strategies, and how to run tests.
- **[server/README.md](server/README.md)**: Backend-specific documentation, API endpoints, and architecture.
- **[docs/history/](docs/history/)**: Archive of engineering logs, fix reports, and historical debugging context.

## 🛠️ Technical Stack

### Frontend
- **React 19** with **Vite**
- **Tailwind CSS** for styling
- **Zustand** for state management
- **Vitest** + **React Testing Library** for testing

### Backend
- **Node.js** with **Express**
- **Supabase** (PostgreSQL & Auth)
- **BullMQ** & **Redis** for background jobs
- **Sharp** & **ImageMagick** for image processing
- **Busboy** for zero-disk streaming uploads (direct to Supabase Storage)
- **Jest** & **Supertest** for testing
- **Helmet** for security headers

## 🧪 Testing

The project maintains high code quality with 86 automated tests.

```bash
# Run all tests
npm run test:run

# Run backend tests only
cd server && npm test

# Stress test to detect race conditions
npm run test:stress                    # Run 20 times (default)
npm run test:stress -- --runs 50       # Run 50 times
npm run test:stress -- --bail          # Stop on first failure
```

## 📋 Project TODOs

### Completed ✅

- [x] **Security (High):** Enforced httpOnly cookie authentication - All API endpoints now read JWTs from cookies (primary) with Authorization header fallback only for API clients. Frontend no longer injects Bearer tokens, relying on `credentials: 'include'` for automatic cookie transmission. Query parameter tokens are rejected.
- [x] **Security (High):** Token leakage fixed - Implemented httpOnly cookie authentication to replace query parameter tokens. See PR #83.
- [x] **Security/Architecture (High):** "Split Brain" authentication resolved - Local `users` table removed, all user management consolidated on Supabase Auth.
- [x] **Critical Logic (High):** File cleanup race condition fixed - `server/routes/uploads.js` now properly handles cleanup in try-finally block, removing orphaned files from Supabase Storage when `ingestPhoto` fails.
- [x] **Refactoring (Medium):** Prop drilling eliminated - State and handlers moved to Zustand store (`store.js`) and custom hooks (`usePhotoManagement`, `useLocalPhotoPicker`, etc.).
- [x] **Maintainability (Medium):** Dependency conflicts resolved - npm install works without flags.

### Future Enhancements

- [x] **Scalability:** Stream uploads directly to Supabase Storage, bypassing local `os.tmpdir()` disk write to prevent bottlenecks under high load. *(Completed November 2025)*

## 🐳 Docker Support

Redis is recommended for background job processing (AI, uploads).

```powershell
# Start Redis
docker run -d --name photo-app-redis -p 6379:6379 redis:7.2-alpine
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
