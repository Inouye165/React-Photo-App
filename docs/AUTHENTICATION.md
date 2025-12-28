# Lumina Authentication System

## Overview

Lumina uses Supabase Auth for user sessions and validates access on the backend using Bearer tokens.

> **Architecture note (December 2025):** Protected API routes require `Authorization: Bearer <token>`. Some image endpoints still contain a deprecated cookie fallback for legacy/E2E compatibility; it should be treated as transitional and removed over time.

## Security Features

### JWT-Based Authentication
- Bearer tokens are required for protected API routes.
- Query parameter tokens are intentionally not supported (URLs leak).
- CSRF risk is reduced by the token model (not automatically attached like cookies) plus strict origin allowlisting on sensitive endpoints.

### Bearer Token Authentication (Exclusive Method)

As of December 2025, protected API routes use Bearer tokens in the Authorization header:

```
Authorization: Bearer <supabase_access_token>
```

**Why Bearer tokens exclusively (no cookies)?**
- **CSRF Immunity**: Tokens are not sent automatically by browsers, eliminating CSRF attack vectors
- **Stateless**: No server-side session storage required (pure JWT validation)
- **iOS/Mobile Safari compatibility**: No ITP cookie blocking issues
- **Cross-origin ready**: Works seamlessly across origins
- **No split-brain**: Frontend and backend sessions cannot get out of sync
- **Standard HTTP**: Uses the standard `Authorization` header pattern

**Frontend Implementation:**
- Token is sourced from Supabase's managed session (`supabase.auth.getSession()`)
- `api.ts` attaches `Authorization: Bearer <token>` to all protected requests
- Avoid relying on or documenting the browser storage mechanism; treat the session token as sensitive and do not log it.

**Backend Implementation:**
- Middleware requires `Authorization: Bearer <token>` header (strictly enforced)
- Cookies are not used for protected API routes
- Query parameters are always rejected (security: tokens in URLs get logged)
- Returns 401 with clear error message if Authorization header is missing

## Terms of Service & Beta Disclaimer

The application requires an explicit acceptance step before an authenticated user can access the main app UI.

- **Enforcement:** The frontend `AuthWrapper` component blocks rendering the authenticated application shell until terms are accepted.
- **Persistence:** Acceptance is recorded in the database on the `users.terms_accepted_at` column.
- **API contract:** The backend exposes an authenticated endpoint to record acceptance (e.g., `POST /api/users/accept-terms`).

This gate exists to ensure users acknowledge the app's experimental/beta behavior and the associated privacy disclaimer before using the core product experience.

### 🛡️ Password security

Password storage, password rules, lockout, and reset flows are handled by Supabase Auth. The application should not implement or document its own password hashing scheme in parallel.

### 🚫 Rate Limiting
- General API rate limiting (100 requests per 15 minutes)
- Authentication endpoint limiting (5 attempts per 15 minutes)
- Upload rate limiting (20 uploads per 15 minutes)
- IP-based tracking and blocking

### 🔒 Security Headers
- Helmet.js for comprehensive security headers
- Content Security Policy (CSP)
- CORS configuration with credential support
- Request validation and sanitization

### 🔍 Input Validation
- Express-validator for robust input validation
- SQL injection protection
- XSS prevention
- Directory traversal protection

### 📊 User Management
- Role-based access control (admin/user roles) via Supabase `app_metadata`

## Quick Start

### 1. Install Dependencies
```bash
cd server
npm install
```

### 2. Configure Environment
Copy and edit the environment file:
```bash
cp .env.example .env
# Edit .env with your settings, especially JWT_SECRET
```

### 3. Create Admin User
```bash
node server/scripts/set-admin-role.js <user-uuid>
```
This promotes an existing Supabase user to admin by writing role data to `app_metadata`.

### 4. Start the Server
```bash
npm start
# or for development
npm run dev
```

### 5. Start the Frontend
```bash
cd ..
npm run dev
```

The application will show a login screen - all routes are now protected!

## Environment Configuration

Key environment variables in `server/.env`:

```env
# JWT Configuration - CHANGE THIS IN PRODUCTION!
JWT_SECRET=your-super-secret-jwt-key-please-change-this-in-production
JWT_EXPIRES_IN=24h

# Security Configuration
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
AUTH_RATE_LIMIT_MAX=5
UPLOAD_RATE_LIMIT_MAX=20

# CORS Configuration
CORS_ORIGIN=http://localhost:3000,http://localhost:5173
CORS_CREDENTIALS=true
```

## API Endpoints

### Authentication Endpoints (No Auth Required)
- `POST /api/auth/session` - Deprecated/no-op (backward compatibility only)
- `POST /api/auth/logout` - Deprecated/no-op (backward compatibility only)
- `GET /health` - Health check

### Protected Endpoints (Require Authentication)
- `GET /photos` - List photos
- `POST /upload` - Upload photos
- `PATCH /photos/:id/state` - Update photo state
- `DELETE /photos/:id` - Delete photos
- Image serving (`/display/*`) uses signed thumbnail URLs or Bearer auth; legacy cookie fallback may exist for images/E2E only

## User roles

### User
- Can upload, view, and manage their own photos
- Can edit photo metadata
- Standard application features

### Admin
- All user permissions
- Can manage all photos in the system
- Can view debug information
- Administrative interface access

## Security Measures

### Account Protection
- **Failed Login Protection**: Account locked for 15 minutes after 5 failed attempts
- **Password Strength**: Enforced strong password requirements
- **Session Management**: JWT tokens with configurable expiration

### Request Protection
- **Rate Limiting**: Multiple layers of rate limiting by IP
- **Input Validation**: Comprehensive validation and sanitization
- **CORS Protection**: Configured for specific origins only
- **Security Headers**: Helmet.js provides comprehensive protection
- **Bearer Token Auth**: Protected API routes require `Authorization: Bearer <token>`. Cookie-based auth is legacy-only (image access/E2E transition, if enabled) and will be removed. Query parameter tokens are strictly rejected to prevent token leakage.

### Data Protection
- **Password Hashing**: Bcrypt with high salt rounds
- **SQL Injection**: Parameterized queries and validation
- **XSS Protection**: Input sanitization and CSP headers
- **Directory Traversal**: Path validation and sanitization

## Frontend Features

### Authentication UI
- Clean, responsive login/registration forms
- Real-time password validation feedback
- Error handling with user-friendly messages
- Automatic token refresh and logout on expiration
- **Robust session recovery**: Invalid refresh tokens trigger automatic cleanup and re-login prompt (prevents zombie sessions)

### User Interface
- User info bar showing logged-in user and role
- Admin badge for administrative users
- Secure logout functionality
- Automatic redirect to login when unauthenticated

### API Integration
- Automatic JWT token inclusion in requests
- Authentication error handling with auto-logout
- Graceful handling of expired tokens

## Supabase Invite Links (Recommended)

Some email providers/security products automatically prefetch links in emails. Because Supabase invite links are one-time URLs, that prefetch can consume the link before the user clicks it, resulting in errors like `otp_expired`.

To mitigate this, the frontend includes a lightweight intermediate page at `/confirm-invite` that requires an explicit click before navigating to the Supabase `{{ .ConfirmationURL }}`.

### Invite email template snippet

In the Supabase **Invite user** email template, set the invite button to your app first, passing the confirmation URL as an encoded query param:

```html
<a href="{{ .SiteURL }}/confirm-invite?confirmation_url={{ .ConfirmationURL | urlquery }}">Accept the invite</a>
```

After the user clicks **Continue** on `/confirm-invite`, the browser navigates to the Supabase confirmation URL, which then redirects back into the app. The app detects invite/recovery parameters and routes the user to `/reset-password` to complete setup.

## Production Deployment Checklist

### 🔧 Configuration
- [ ] Set `NODE_ENV=production`
- [ ] Set `JWT_SECRET` (used for internal signing / E2E helpers; not the Supabase signing secret)
- [ ] Configure allowed origins for your deployed frontend
- [ ] Review and adjust rate limits for your traffic

### 🗄️ Database
- [ ] Backup database before deployment
- [ ] Ensure database file permissions are secure
- [ ] Consider database encryption for sensitive deployments

### 🔒 Security
- [ ] Set up reverse proxy (nginx/Apache) with SSL
- [ ] Configure firewall rules
- [ ] Set up monitoring and logging
- [ ] Regular security updates and dependency checks

### 👤 User Management
- [ ] Create admin accounts for your team
- [ ] Define user registration policies
- [ ] Set up user role assignments

## Troubleshooting

### Common Issues

#### "Access token required" errors
- Ensure user is logged in
- Check if token has expired
- Verify CORS configuration

#### "Invalid Refresh Token" errors
- This error is now handled automatically - the app will log you out and prompt for re-login
- Common cause: Browser session cleared or token expired while app was idle
- Expected behavior: App logs "Session lost during refresh, cleaning up" and redirects to login
- **No action required** - this is normal cleanup of stale sessions

#### Account locked messages
- Wait 15 minutes for automatic unlock
- Or manually reset in database if needed

#### Rate limit errors
- Check if IP is being blocked
- Adjust rate limits in environment variables
- Consider implementing user-specific rate limits

### Logs and Monitoring
- Authentication attempts are logged
- Failed logins and suspicious requests are logged
- Monitor logs for security issues

## Development

### Adding New Protected Routes
```javascript
// Add authentication middleware to protect routes
app.use('/new-endpoint', authenticateToken, yourRouterHandler);

// For role-based protection
app.use('/admin-endpoint', authenticateToken, requireRole('admin'), yourRouterHandler);
```

### Testing Authentication
1. Use the admin account created with `npm run create-admin`
2. Test registration with new users
3. Verify rate limiting by making rapid requests
4. Test token expiration by setting short expiration times

### Database Schema
The authentication system adds a `users` table with:
- Unique username and email constraints
- Hashed passwords with bcrypt
- Role-based access control
- Account lockout tracking
- Timestamps for audit trails

## Hybrid deployment (local frontend + cloud backend)

### Overview
When running a **local frontend** (e.g., `localhost:5173`) that connects to a **cloud-hosted backend**, browsers treat these as different origins.

**Note:** Protected API routes use Bearer tokens (`Authorization: Bearer <token>`). Cookie configuration is only relevant for any remaining legacy image/E2E cookie flows (if enabled) and may be removed in future.

### The problem

If you are still relying on legacy cookie-based image auth in a cross-origin setup, browser cookie rules can block those cookies.

### The solution (legacy only): cookie SameSite configuration

Configure the backend to allow cross-origin cookies by setting:

```bash
# In your cloud backend environment (e.g., Render, Heroku, Azure)
COOKIE_SAME_SITE=none
```

### How It Works

The `sameSite` cookie attribute is now **configurable via environment variable**:

| Environment Variable | Behavior |
|---------------------|----------|
| `COOKIE_SAME_SITE=none` | Allows cross-origin cookies (required for hybrid deployment) |
| `COOKIE_SAME_SITE=lax` | Allows some cross-origin GET requests |
| `COOKIE_SAME_SITE=strict` | Same-origin only (most secure) |
| *(not set)* | Defaults to `strict` (production) or `lax` (development) |

**Security Guarantee:** When `COOKIE_SAME_SITE=none`, the `secure` flag is **automatically forced to `true`**, even in development. This is required by modern browsers - `SameSite=None` cookies **must** be `Secure`.

### Configuration Examples

#### Local Development (Both Frontend & Backend Local)
```bash
# server/.env
NODE_ENV=development
# No COOKIE_SAME_SITE needed - defaults to 'lax'
```

#### Hybrid Deployment (Local Frontend → Cloud Backend)
```bash
# Cloud backend environment variables
NODE_ENV=production
COOKIE_SAME_SITE=none
CORS_ORIGIN=http://localhost:5173,http://localhost:3000
```

#### Full Production (Both Frontend & Backend in Cloud)
```bash
# Cloud backend environment variables
NODE_ENV=production
# No COOKIE_SAME_SITE needed - defaults to 'strict'
CORS_ORIGIN=https://your-app.com
```

### Testing Your Configuration

After setting `COOKIE_SAME_SITE=none`:

1. **Start your cloud backend** with the environment variable
2. **Run local frontend**: `npm run dev`
3. **Test authentication**:
   - Login from local frontend
   - Check browser DevTools → Application → Cookies
   - Verify cookie has: `SameSite=None; Secure; HttpOnly`
4. **Verify API calls work** (photos load, uploads work, etc.)

### Troubleshooting

#### Cookies Not Being Sent
- ✅ Verify `COOKIE_SAME_SITE=none` is set on backend
- ✅ Verify backend is HTTPS (required for `SameSite=None`)
- ✅ Check CORS configuration includes your frontend origin
- ✅ Ensure `CORS_CREDENTIALS=true` is set

#### "Cookie not Secure" Warning
- If you see this error, your backend must use HTTPS
- `SameSite=None` **requires** `Secure` flag
- Use ngrok or similar for local HTTPS testing if needed

#### Still Using Query Parameters?
- **Don't!** Query parameter tokens are deprecated for security
- Cookie-based image auth is legacy-only and may be removed; prefer Bearer auth (for API routes) and signed URLs (for `<img>`)
- See [SECURITY_REMEDIATION_CWE489.md](./SECURITY_REMEDIATION_CWE489.md) for details

### Security notes

⚠️ **Important Security Considerations:**
- `SameSite=None` is **less secure** than `strict` - only use when necessary
- Always ensure your backend validates the `Origin` header (already implemented)
- Rate limiting protects against abuse (already implemented)
- HTTPS is **mandatory** for `SameSite=None` cookies
- Consider moving to full cloud deployment when ready (both frontend & backend)

## Support

This document describes the current auth model and known transitional edges. If you find a mismatch between this doc and the code, treat the code as the source of truth and open an issue (docs should be updated as part of the fix).