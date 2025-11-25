# Photo App Server

Backend server for the React Photo App, built with Node.js and Express. It handles authentication, file uploads, image processing (HEIC conversion), and AI metadata extraction.

## 🚀 Setup

### Prerequisites
- Node.js 20+
- Redis (for background jobs)
- ImageMagick (for HEIC fallback)

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure Environment:**
   Copy `.env.example` to `.env` and fill in the required values.
   ```bash
   cp .env.example .env
   ```

3. **Start Redis:**
   ```bash
   docker run -d --name photo-app-redis -p 6379:6379 redis:7.2-alpine
   ```

4. **Start the Server:**
   ```bash
   # Development (with auto-restart)
   npm run dev

   # Production
   npm start
   ```

## 🏗️ Architecture

- **API**: Express.js REST API
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth + JWT
- **Queue**: BullMQ + Redis (for AI & image processing)
- **Storage**: Supabase Storage + Local Temp (for processing)

## 🔌 API Endpoints

### Authentication
- `POST /auth/register` - Create a new account
- `POST /auth/login` - Login and receive JWT
- `GET /auth/me` - Get current user profile

### Photos
- `POST /upload` - Upload photos (Authenticated)
- `GET /photos` - List photos with filters
- `GET /photos/:id` - Get photo details
- `GET /display/:path` - Securely serve image files

### AI & Metadata
- `POST /photos/:id/run-ai` - Trigger AI analysis
- `GET /photos/models` - List available AI models

## 🛠️ Background Processing

This project uses **BullMQ** and **Redis** to process long-running tasks asynchronously:
- **Image Ingestion**: HEIC conversion, thumbnail generation, metadata extraction.
- **AI Analysis**: Sending images to OpenAI for scene description and appraisal.

*Note: You must have a Redis server running for these features to work.*

## 🔐 Security

- **Helmet**: Sets secure HTTP headers (CSP, HSTS, etc.).
- **Rate Limiting**: Protects against brute-force attacks.
- **Log Redaction**: Automatically masks sensitive data (tokens, keys) in logs.
- **Input Validation**: Strict validation on all endpoints.
- **Strict CORS**: Explicit origin allowlisting (no regex wildcards or IP ranges).

### Environment Variables

#### ALLOWED_ORIGINS
**Type**: String (comma-separated URLs)  
**Required**: Recommended for production  
**Default**: `http://localhost:3000,http://localhost:5173,http://localhost:5174` (development only)

Comma-separated list of allowed CORS origins. When explicitly set, **only** these origins are allowed (defaults are NOT included). This prevents accidental security holes when moving to production.

**Examples:**
```bash
# Production (explicit, no defaults)
ALLOWED_ORIGINS="https://myapp.com,https://www.myapp.com"

# Multiple environments
ALLOWED_ORIGINS="https://app.example.com,https://staging.example.com"

# Development (if you need custom ports, list them explicitly)
ALLOWED_ORIGINS="http://localhost:5173,http://localhost:8080"
```

**Security Notes:**
- Do NOT use wildcards or regex patterns
- Do NOT include IP ranges (e.g., `192.168.x.x`)
- Each origin must include the protocol (`https://` or `http://`)
- Whitespace around commas is handled gracefully
- If unset, falls back to localhost defaults for local development only

## 🧪 Testing

```bash
# Run all server tests
npm test

# Run specific test file
npm test -- tests/auth.test.js
```
