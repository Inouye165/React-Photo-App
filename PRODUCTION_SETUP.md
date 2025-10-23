# Production Environment Setup

This document outlines the environment variables required for production deployment.

## Required Environment Variables

### Backend Environment Variables

The following environment variables must be set in your production environment:

#### Database Configuration
- `SUPABASE_DB_PASSWORD` - Your Supabase database password (required for development and production)
- `SUPABASE_DB_URL` or `DATABASE_URL` - Full database connection string for production
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Your Supabase anonymous/public key
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key (for backend operations)

#### CORS Configuration
- `CLIENT_ORIGIN` - The URL of your production frontend (e.g., `https://www.your-photo-app.com`)

#### Security Configuration
- `API_URL` - The public URL of your production API (e.g., `https://api.your-photo-app.com`)

#### AI Services Configuration
- `OPENAI_API_KEY` - Your OpenAI API key for AI processing features

#### Other Variables
- `PORT` - Port number for the server (defaults to 3001)
- `JWT_SECRET` - Secret key for JWT token signing (should be a long, random string)

### Example Production Environment Variables

```bash
# Database
SUPABASE_DB_PASSWORD=your_secure_db_password
DATABASE_URL=postgresql://user:password@host:port/database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# CORS
CLIENT_ORIGIN=https://www.your-photo-app.com

# Security
API_URL=https://api.your-photo-app.com

# AI Services
OPENAI_API_KEY=your_openai_api_key

# Server
PORT=3001
JWT_SECRET=your_very_long_and_random_jwt_secret_key

# Node Environment
NODE_ENV=production
```

### Frontend Build Variables

The following environment variables are required for the frontend build process:

#### Vite Configuration
- `VITE_API_URL` - The URL of your production API for frontend requests (e.g., `https://api.your-photo-app.com`)

### Example Frontend Build Variables

```bash
# Frontend API Configuration
VITE_API_URL=https://api.your-photo-app.com
```

## Security Notes

1. **Never commit sensitive values** to version control
2. **Use strong, unique passwords** for all database connections
3. **Use HTTPS URLs** for all production endpoints
4. **Generate a cryptographically secure JWT secret** (at least 256 bits)

## Deployment Checklist

- [ ] Set all required environment variables in your cloud platform
- [ ] Verify CORS origins include your production frontend URL
- [ ] Ensure API_URL matches your production backend URL
- [ ] Test that the frontend can communicate with the backend
- [ ] Verify CSP policies allow necessary resources
- [ ] Confirm database connection works with environment variables

## Local Development

For local development, create a `server/.env` file with:

```bash
SUPABASE_DB_PASSWORD=your_dev_db_password
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
OPENAI_API_KEY=your_openai_api_key
JWT_SECRET=your_dev_jwt_secret
# CLIENT_ORIGIN and API_URL can be omitted for local development
```