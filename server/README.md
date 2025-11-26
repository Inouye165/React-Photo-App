# Photo App Server

Backend server for the React Photo App, built with Node.js and Express. It handles authentication, file uploads, image processing (HEIC conversion), and AI metadata extraction.

## 🚀 Setup

### Prerequisites
- Node.js 20+
- **PostgreSQL** (via Docker or Supabase)
- Redis (for background jobs)
- ImageMagick (for HEIC fallback)

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
   
   **Required:** Set `DATABASE_URL` or `SUPABASE_DB_URL`:
   ```bash
   # Local PostgreSQL
   DATABASE_URL=postgresql://user:password@localhost:5432/photoapp
   
   # Or Supabase
   SUPABASE_DB_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres
   ```

4. **Start Redis:**
   ```bash
   docker run -d --name photo-app-redis -p 6379:6379 redis:7.2-alpine
   ```

5. **Start the Server:**
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
- `POST /api/auth/session` - Login and receive JWT (sets httpOnly cookie)
- `POST /api/auth/logout` - Logout and clear session cookie

### Photos
- `POST /upload` - Upload photos (Authenticated)
- `GET /photos` - List photos with filters
- `GET /photos/:id` - Get photo details
- `GET /photos/:id/thumbnail-url` - Get signed URL for thumbnail (Authenticated, returns 404 if unavailable)
- `GET /display/:state/:filename` - Securely serve image files
- `POST /privilege` - Check file permissions (Authenticated, performs real-time ownership verification)

### AI & Metadata
- `POST /photos/:id/run-ai` - Trigger AI analysis
- `GET /photos/models` - List available AI models

### Testing Endpoints (Development & E2E Only)
- `GET /api/test/e2e-verify` - Validates E2E test authentication cookie
  - **Production**: Returns `403 Forbidden` (completely disabled)
  - **Development/Test**: Returns `200` with user data if `e2e_session` cookie valid, `401` otherwise
  - **Purpose**: Allows Playwright tests to verify authentication state without exposing production endpoints
  - **Expected behavior**: 401 responses are normal and expected when app loads without E2E session (logged as debug, not error)

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
npm test -- tests/security.test.js
```
