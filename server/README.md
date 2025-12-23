# Lumina Server

Backend server for Lumina. Node.js + Express, covering authentication, uploads, image processing (including HEIC/HEIF), and AI metadata extraction.

## 🚀 Setup

### Prerequisites
- Node.js 20+
- **PostgreSQL** (via Docker or Supabase)
- Redis (for background jobs)
- HEIC/HEIF conversion uses Sharp with a `heic-convert` fallback

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start PostgreSQL:**
   ```bash
   # Using Docker Compose (recommended for local development)
   docker-compose up -d db
   
   # Or use Supabase for hosted PostgreSQL
   ```

3. **Configure Environment:**
   Copy `.env.example` to `.env` and fill in the required values.
   ```bash
   cp .env.example .env
   ```
   
   **Required environment variables:**
   - `SUPABASE_URL` - Your Supabase project URL
   - `SUPABASE_ANON_KEY` - Supabase anon public key
  - `JWT_SECRET` - Server secret used for internal signing (e.g., non-prod/E2E test tokens); not the Supabase access token secret
  - `OPENAI_API_KEY` - Required for startup in non-test environments (AI pipeline dependency)
  - `DATABASE_URL` or `SUPABASE_DB_URL` - Postgres connection string:

    In production, the server is configured to **fail fast** (exit on startup) if `SUPABASE_URL`, `SUPABASE_ANON_KEY`, or `JWT_SECRET` are missing or empty.
   
   ```bash
   # Local PostgreSQL
   DATABASE_URL=postgresql://user:password@localhost:5432/photoapp
   
   # Or Supabase
   SUPABASE_DB_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres
   ```
   
   **Optional but recommended:**
   - `SUPABASE_SERVICE_ROLE_KEY` - Server-side operations (falls back to ANON_KEY)

4. **Start Redis:**
   ```bash
   docker run -d --name photo-app-redis -p 6379:6379 redis:7.2-alpine
   ```

5. **Run Migrations:**
   ```bash
   npx knex migrate:latest --knexfile knexfile.js
   ```
   See `MIGRATIONS.md` for details on creating new migrations.

6. **Start the Server:**
   ```bash
   # Development (with auto-restart)
   npm run dev

   # Production
   npm start
   ```

## 🏗️ Architecture

- **API**: Express.js REST API
- **Database**: PostgreSQL (Supabase or local)
- **Auth**: Supabase Auth + JWT
- **Queue**: BullMQ + Redis (for AI & image processing)
- **Storage**: Supabase Storage + Local Temp (for processing)

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/session` - Deprecated/no-op endpoint kept for backward compatibility (does not set cookies). Use `Authorization: Bearer <token>`.
- `POST /api/auth/logout` - Deprecated/no-op endpoint kept for backward compatibility. Logout is handled client-side via Supabase (`supabase.auth.signOut()`).

### Photos
- `POST /upload` - Upload photos (Authenticated)
- `GET /photos` - List photos with filters
- `GET /photos/:id` - Get photo details
- `GET /photos/:id/thumbnail-url` - Get signed URL for thumbnail (Authenticated, returns 404 if unavailable)
- `PATCH /photos/:id/metadata` - Update photo metadata (Authenticated)
- `DELETE /photos/:id` - Delete a photo (Authenticated, owner only)
- `GET /photos/status` - Get aggregated photo counts by state for smart routing
- `GET /display/:state/:filename` - Securely serve image files
- `GET /display/image/:photoId` - Serve full-size image by ID
- `POST /privilege` - Check file permissions (Authenticated, performs real-time ownership verification)

### AI & Metadata
- `POST /photos/:id/run-ai` - Trigger AI analysis
- `POST /photos/:id/recheck-ai` - Re-run AI analysis on existing photo
- `POST /photos/:id/reextract-metadata` - Re-extract EXIF metadata
- `GET /photos/models` - List available AI models
- `GET /photos/dependencies` - Check AI dependencies status

### User Preferences
- `GET /api/users/me/preferences` - Get user preferences
- `PATCH /api/users/me/preferences` - Update user preferences
- `POST /api/users/me/preferences/load-defaults` - Load default preferences

### Collectibles
- `GET /api/photos/:photoId/collectibles` - Get collectibles for a photo
- `POST /api/photos/:photoId/collectibles` - Create new collectible entry
- `PUT /api/photos/:photoId/collectibles` - Update collectible data
- `PATCH /api/collectibles/:collectibleId` - Update specific collectible
- `GET /api/collectibles/:collectibleId/history` - Get valuation history

### Testing Endpoints (Development & E2E Only)
- `GET /api/test/e2e-verify` - Validates E2E test authentication cookie
  - **Production**: Always returns `404 Not found` (completely disabled, flag ignored)
  - **Development/Test**: Disabled by default; set `E2E_ROUTES_ENABLED=true` to enable
  - **When enabled**: Returns `200` with user data if `authToken` cookie is a valid E2E session, `401` otherwise
  - **Purpose**: Allows Playwright tests to verify authentication state without exposing production endpoints
  - **Expected behavior**: 401 responses are normal and expected when app loads without E2E session (logged as debug, not error)

## 🛠️ Background Processing

This project uses **BullMQ** and **Redis** to process long-running tasks asynchronously:
- **Image Ingestion**: HEIC conversion, thumbnail generation, metadata extraction.
- **AI Analysis**: Sending images to OpenAI for scene description and appraisal.

*Note: You must have a Redis server running for these features to work.*

## 🔐 Security

> **Update (December 2025):** Protected API routes require `Authorization: Bearer <token>`. A deprecated cookie fallback may exist only for legacy image access/E2E and will be removed.

- **Helmet**: Sets secure HTTP headers (CSP, HSTS, etc.).
- **Rate Limiting**: Protects against brute-force attacks.
- **Log Redaction**: Automatically masks sensitive data (tokens, keys) in logs.
- **Input Validation**: Strict validation on all endpoints.
- **Strict CORS**: Explicit origin allowlisting (no regex wildcards or IP ranges).
  - **Production**: Set `FRONTEND_ORIGIN` environment variable to your deployed frontend URL (e.g., `https://your-frontend.example.com`)
  - **Local Dev**: Automatically includes `http://localhost:5173` (Vite), `http://localhost:3000`, `http://localhost:5174`
  - **Security**: Only explicitly whitelisted origins receive CORS headers; credentials enabled for secure cookie/token auth
  - **Centralized**: All origin resolution uses `server/config/allowedOrigins.js` helpers (`resolveAllowedOrigin`, `isOriginAllowed`) for consistency across main CORS middleware, image auth, and auth routes
- **SSL Certificate Validation**: Production enforces strict SSL with CA certificate verification (see below).
- **Ownership-Based Access Control**: The `/privilege` endpoint performs real-time database verification to ensure users can only modify or delete their own content. This prevents IDOR (Insecure Direct Object Reference) vulnerabilities.
- **Secure Role Storage**: User roles are stored in `app_metadata` (server-controlled) instead of `user_metadata` (client-writable) to prevent privilege escalation attacks.

### Database SSL Configuration

**Production environments enforce strict SSL certificate validation** to prevent man-in-the-middle (MITM) attacks.

| Environment | `rejectUnauthorized` | CA Certificate |
|-------------|---------------------|----------------|
| Production  | `true` ✓            | Required       |
| Development | `false`             | Not required   |
| Test        | `false`             | Not required   |

**Requirements for Production:**
- The file `prod-ca-2021.crt` must be present in the `server/` directory
- The certificate must match your PostgreSQL/Supabase provider's CA
- The server will fail to start with a clear error if the certificate is missing

**Verifying SSL Configuration:**
```bash
# Verify production SSL connection
NODE_ENV=production node scripts/verify-db-ssl.js
```

**Updating the CA Certificate:**
If your database provider rotates their CA certificate, replace `prod-ca-2021.crt` with the new certificate from your provider.

### Privilege Endpoint

The `/privilege` endpoint provides fine-grained access control by checking file ownership in real-time:

**Request:**
```json
POST /privilege
Authorization: Bearer <token>
Content-Type: application/json

{
  "filenames": ["photo1.jpg", "photo2.jpg"]
}
```

**Response:**
```json
{
  "success": true,
  "privileges": {
    "photo1.jpg": "RWX",  // Owner: Read, Write, Execute (Delete)
    "photo2.jpg": "R"     // Non-owner: Read only (if public)
  }
}
```

**Permission Levels:**
- `RWX` - Full access (owner only): Read, Write, Delete
- `R` - Read-only access (non-owner, public files)
- `""` (empty) - No access (file not found or private)

The endpoint queries the database to verify ownership (`user_id`) for each requested filename, ensuring secure access control at scale with efficient batch queries.

### Managing User Roles

User roles (e.g., `admin`, `user`) are stored securely in Supabase's `app_metadata`, which can only be modified server-side using the Service Role Key. This prevents privilege escalation attacks where malicious users could grant themselves admin access.

#### Granting Admin Role

To promote a user to admin, use the provided utility script:

```bash
# Set required environment variables
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Run the script with the user's UUID
node server/scripts/set-admin-role.js <user-uuid>
```

**Example:**
```bash
node server/scripts/set-admin-role.js 550e8400-e29b-41d4-a716-446655440000
```

**Output:**
```
✅ User found: admin@example.com
🔐 Setting admin role in app_metadata (secure, server-controlled)...
✅ SUCCESS: Admin role granted!
⚠️  IMPORTANT: The user must refresh their token (re-login) for changes to take effect.
```

**Finding a User's UUID:**
1. Go to Supabase Dashboard → Authentication → Users
2. Click on the user to see their UUID

**Security Notes:**
- The `SUPABASE_SERVICE_ROLE_KEY` must be kept secret and never committed to version control
- Only server-side code should use the Service Role Key
- Users must re-login after role changes to get an updated JWT token
- Client-writable `user_metadata` is deliberately ignored for role determination


---

## 🌐 CORS Configuration

The backend uses a strict, centralized CORS allowlist for all API and image/thumbnail routes.

**Default dev origins:**
- http://localhost:5173 (Vite dev server)
- http://localhost:3000, http://localhost:5174 (legacy/alt dev ports)

**Production:**
- Set `FRONTEND_ORIGIN=https://your-frontend.example.com` in Railway environment variables.
- Optionally set `ALLOWED_ORIGINS` (comma-separated) for multiple frontends. If set, defaults are NOT included.

**How it works:**
- Only explicitly allowed origins receive CORS headers (no wildcards).
- Credentials (cookies, Authorization) are supported.
- All image/thumbnail routes (e.g., `/display/thumbnails/:hash`, `/display/image/:id`) use this config.
- Requests from unknown origins are blocked or get no CORS headers (intentional for security).

**Troubleshooting:**
- Check Railway logs for `[CORS] Allowed origins: ...` on startup (non-prod or `DEBUG_CORS=true`).
- Enable debug logging with `DEBUG_CORS=true` to see CORS decisions in logs.

**See also:** Comments in `server/config/allowedOrigins.js` and main CORS middleware in `server.js` for implementation details.

**Examples:**
```bash
# Production (explicit, no defaults)
ALLOWED_ORIGINS="https://myapp.com,https://www.myapp.com"

# Multiple environments
ALLOWED_ORIGINS="https://app.example.com,https://staging.example.com"

# Development (if you need custom ports, list them explicitly)
ALLOWED_ORIGINS="http://localhost:5173,http://localhost:8080"

# Combined with FRONTEND_ORIGIN (both are merged)
ALLOWED_ORIGINS="https://api.example.com"
FRONTEND_ORIGIN="https://your-frontend.example.com"
```

**Security Notes:**
- Do NOT use wildcards or regex patterns
- Do NOT include IP ranges (e.g., `192.168.x.x`)
- Each origin must include the protocol (`https://` or `http://`)
- Whitespace around commas is handled gracefully
- If unset, falls back to localhost defaults for local development only

### Production Deployment CORS Configuration

#### Current Production Setup (Vercel + Railway)

Common setup:
- **Frontend**: Vercel
- **Backend**: Railway

**Railway Environment Configuration:**
```bash
FRONTEND_ORIGIN=https://your-frontend.example.com
```

This single environment variable enables:
- ✅ Frontend can make authenticated requests to backend
- ✅ Cookies and Authorization headers work across origins
- ✅ `/display/thumbnails` and `/display/image` routes return proper CORS headers
- ✅ Local development still works (`http://localhost:5173` is included by default)

#### Adding New Frontends

To whitelist additional frontend URLs (e.g., staging environments, mobile apps):

1. **Single additional origin:** Update `FRONTEND_ORIGIN` or use `ALLOWED_ORIGINS`
   ```bash
   ALLOWED_ORIGINS=https://staging.myapp.com,https://preview.myapp.com
  FRONTEND_ORIGIN=https://your-frontend.example.com
   ```

2. **Multiple origins:** Use comma-separated list in `ALLOWED_ORIGINS`
   ```bash
  ALLOWED_ORIGINS=https://app1.example.com,https://app2.example.com,https://app3.example.com
   ```

3. **Verify configuration:** Check Railway logs for CORS debug output
   ```bash
   # Enable CORS debugging in Railway
   DEBUG_CORS=true
   ```

#### Troubleshooting CORS Issues

**Symptoms:**
- Browser console: "blocked by CORS policy: header has a value 'http://localhost:5173' that is not equal to the supplied origin"
- Images fail to load with `net::ERR_FAILED`
- API requests return 403 or don't include `Access-Control-Allow-Origin`

**Solutions:**
1. **Verify `FRONTEND_ORIGIN` is set** in Railway dashboard
2. **Check the exact URL** - must match exactly (no trailing slash, correct protocol)
3. **Restart Railway service** after environment variable changes
4. **Enable debug logging** with `DEBUG_CORS=true` to see CORS decisions in logs

**Expected behavior:**
- Allowed origins receive `Access-Control-Allow-Origin: <requesting-origin>`
- Disallowed origins receive no CORS headers (browser blocks request)
- No wildcards (`*`) when credentials are enabled (security requirement)

## 🧪 Testing

```bash
# Run all server tests
npm test

# Run specific test file
npm test -- tests/security.test.js
```

## 📬 Public API

### Contact Form Endpoint

Public endpoints that do not require authentication.

#### `POST /api/public/contact`

Submit a contact form message. Rate limited and validated.

**Rate Limits:**
- Production: 5 requests per hour per IP
- Development/Test: 100 requests per hour per IP

**Request Body:**
```json
{
  "name": "string (required, max 100 chars)",
  "email": "string (required, valid email, max 255 chars)",
  "subject": "string (optional, max 150 chars, default: 'General Inquiry')",
  "message": "string (required, max 4000 chars)"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Thank you for your message. We will respond within 24-48 hours.",
  "id": "uuid"
}
```

**Validation Error Response (400):**
```json
{
  "success": false,
  "error": "Validation failed",
  "details": [{ "field": "name", "message": "Name is required" }]
}
```

**Rate Limit Response (429):**
```json
{
  "success": false,
  "error": "Too many contact requests. Please try again later."
}
```

### Database Schema: `contact_messages`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key (auto-generated) |
| `name` | VARCHAR(100) | Sender name |
| `email` | VARCHAR(255) | Sender email |
| `subject` | VARCHAR(150) | Message subject (default: 'General Inquiry') |
| `message` | TEXT | Message content (max 4000 chars) |
| `status` | VARCHAR(50) | Message status (default: 'new') |
| `ip_address` | VARCHAR(45) | Sender IP address for abuse prevention |
| `created_at` | TIMESTAMP | Submission timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |

