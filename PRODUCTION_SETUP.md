# Production Environment Setup

This document outlines the environment variables required for production deployment.

## Required Environment Variables

### Backend Environment Variables

The following environment variables must be set in your production environment:

#### Database Configuration
- `SUPABASE_DB_PASSWORD` - Your Supabase database password (required for development and production)
- `SUPABASE_DB_URL` or `DATABASE_URL` - Full database connection string for production

#### CORS Configuration
- `CLIENT_ORIGIN` - The URL of your production frontend (e.g., `https://www.your-photo-app.com`)

#### Security Configuration
- `API_URL` - The public URL of your production API (e.g., `https://api.your-photo-app.com`)

#### Other Variables
- `PORT` - Port number for the server (defaults to 3001)
- `JWT_SECRET` - Secret key for JWT token signing (should be a long, random string)

### Example Production Environment Variables

```bash
# Database
SUPABASE_DB_PASSWORD=your_secure_db_password
DATABASE_URL=postgresql://user:password@host:port/database

# CORS
CLIENT_ORIGIN=https://www.your-photo-app.com

# Security
API_URL=https://api.your-photo-app.com

# Server
PORT=3001
JWT_SECRET=your_very_long_and_random_jwt_secret_key

# Node Environment
NODE_ENV=production
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
JWT_SECRET=your_dev_jwt_secret
# CLIENT_ORIGIN and API_URL can be omitted for local development
```