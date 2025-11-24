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

## 🆕 What's New (October 2025)

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
- **Jest** & **Supertest** for testing
- **Helmet** for security headers

## 🧪 Testing

The project maintains high code quality with 86 automated tests.

```bash
# Run all tests
npm run test:run

# Run backend tests only
cd server && npm test
```

## 🐳 Docker Support

Redis is recommended for background job processing (AI, uploads).

```powershell
# Start Redis
docker run -d --name photo-app-redis -p 6379:6379 redis:7.2-alpine
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
