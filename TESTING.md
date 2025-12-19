# Testing Guide for Photo App

## Overview
This document provides comprehensive testing instructions for the Photo App's authentication system, HEIC conversion, and core functionality.

## Prerequisites
- Node.js 20+ (see root `package.json` engines)
- npm 10+
- Modern web browser (Chrome, Edge recommended)
- (No ImageMagick required; HEIC/HEIF conversion uses Sharp + `heic-convert` fallback)

## Quick Start Testing

### 1. Environment Setup
```bash
# Clone and install dependencies
git clone https://github.com/Inouye165/React-Photo-App.git
cd React-Photo-App
npm install
cd server && npm install && cd ..
```

### 2. Start Both Servers
```bash
# Terminal 1: Backend server
cd server && npm start

# Terminal 2: Frontend server  
npm run dev
```

### 3. Run Test Suite
```bash
# Frontend unit tests
npm run test:run

# Backend tests
cd server && npm test
```

## Manual Testing Checklist

### 🔐 Authentication System
- [ ] **Initial Load**: Should show login form on first visit
- [ ] **User Registration**: Create new account with username, email, password
- [ ] **User Login**: Login with valid credentials
- [ ] **Authentication UI**: 
  - [ ] Toolbar shows "Login" button when not authenticated
  - [ ] Toolbar shows user avatar + username + "Logout" button when authenticated
- [ ] **Logout**: Click logout button clears session and returns to login form
- [ ] **Session Persistence**: Refresh page maintains login state
- [ ] **Token Expiration**: Login expires after 24 hours

### 🖼️ Image Operations (Authenticated Users Only)
- [ ] **File/Folder Selection**: Select photos or folder for upload works (File picker on mobile/Safari/Firefox)
- [ ] **Image Display**: All images load with authenticated URLs
- [ ] **HEIC Conversion**: HEIC files display properly (converted to JPEG)
- [ ] **Edit Mode**: Click edit on any image opens editor
- [ ] **Image Authentication**: All image requests include auth tokens

### 🔒 Security Testing
- [ ] **Unauthenticated Access**: Cannot access images without login
- [ ] **Invalid Tokens**: Expired/invalid tokens redirect to login
- [ ] **CORS Headers**: No cross-origin errors in browser console
- [ ] **Rate Limiting**: Multiple failed logins trigger rate limiting

### 📁 Multi-Machine Workflow
- [ ] **File Sync**: Missing image files show appropriate 404 errors
- [ ] **Database Consistency**: App handles missing files gracefully
- [ ] **Cross-Device Login**: Same account works on multiple machines

## Automated Test Coverage

### Frontend tests
```bash
# Run with coverage
npm run test:coverage

# Test specific component
npx vitest run src/tests/authUtils.test.js
```

This covers core UI behavior (auth flows, component interactions, and regression coverage for the main screens).

### Backend tests
```bash
cd server && npm test
```

This covers auth middleware behavior, image access rules, upload/processing paths, and security-related regressions.

## Common Issues & Solutions

### 🚨 Authentication Issues
**Problem**: Login button doesn't work
- **Check**: Backend server running on port 3001
- **Check**: Frontend can reach `http://localhost:3001/auth/*`
- **Solution**: Restart servers, check for port conflicts

**Problem**: Images not loading after login
- **Check**: Signed thumbnail URLs are being used for `<img>` tags (preferred), or image fetches include `Authorization: Bearer <token>`.
- **Check**: CORS allows your frontend origin.

### 🖼️ HEIC Issues  
**Problem**: HEIC files not displaying
- **Check**: Server logs for conversion errors
- **Check**: Worker is running (thumbnails/conversion happen in background jobs)
- **Notes**: The app is intended to work without ImageMagick; conversion uses Sharp plus a `heic-convert` fallback.

**Problem**: "Bad seek" errors in console
- **Expected**: Some HEIC variants can fail to decode in Sharp.
- **Action**: Check server logs for whether the `heic-convert` fallback succeeded; if not, capture the failing file and open an issue.

### 🔧 Development Issues
**Problem**: Port conflicts (EADDRINUSE)
- **Solution**: `taskkill /F /IM node.exe` (Windows) or `pkill node` (Mac/Linux)

**Problem**: Tests failing
- **Check**: All dependencies installed (`npm install`)
- **Check**: Servers not running during test execution
- **Solution**: Stop servers, run tests, restart servers

## Test Environment Setup

### Development Testing
```bash
# Standard development setup
npm run dev          # Frontend on :5173
cd server && npm start  # Backend on :3001
```

### Production Testing
```bash
npm run build        # Build for production
npm run preview      # Preview production build
```

### Test Database Reset
```bash
# This project uses PostgreSQL. Reset your Postgres DB and re-run migrations:
docker-compose up -d db
cd server && npx knex migrate:latest --knexfile knexfile.js
```

## Security Testing

### Manual Security Checks
1. **Network Tab**: Verify all requests include proper auth headers
2. **Application Tab**: Check localStorage for auth tokens
3. **Console**: No authentication errors or CORS issues
4. **Direct URL Access**: `http://localhost:3001/display/working/image.jpg` should return 401

### Automated Security Testing
```bash
# Security middleware tests
cd server && npm test -- tests/security.test.js

# Authentication flow tests  
cd server && npm test -- tests/imageAuth.test.js
```

## Performance Testing

### Image Loading Performance
- Test with 50+ images in folder
- Verify thumbnail generation doesn't block UI
- Check memory usage during HEIC conversion

### Concurrent User Testing
- Multiple browser windows with same account
- Different accounts in different browsers
- Verify session isolation

## CI/CD Testing

### Pre-commit Checks
```bash
# Run all tests
npm run test:run
cd server && npm test

# Lint check
npm run lint

# Build check
npm run build
```

### Branch Testing
```bash
# Test branch switching
git checkout main
npm test
git checkout security-auth-system
npm test
```

## Troubleshooting

### Reset Everything
```bash
# Complete reset
taskkill /F /IM node.exe    # Kill all Node processes
rm -rf node_modules         # Remove frontend deps (Mac/Linux)
rm -rf server/node_modules  # Remove backend deps (Mac/Linux)
npm install                 # Reinstall frontend
cd server && npm install    # Reinstall backend
```

PowerShell equivalents:

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item -Recurse -Force node_modules
Remove-Item -Recurse -Force server\node_modules
npm install
cd server; npm install
```

### Debug Authentication
```bash
# Auth is handled by Supabase on the client. To debug protected backend endpoints,
# call them with a Supabase access token:
curl -H "Authorization: Bearer <SUPABASE_ACCESS_TOKEN>" http://localhost:3001/photos
```

### Debug Image Access
```bash
# Check image serving (should fail without auth)
curl -I http://localhost:3001/display/working/test.jpg

# Check with auth token
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3001/display/working/test.jpg
```

## Test Data

### Stress Testing for Race Conditions

The project includes a stress test tool to detect intermittent failures and race conditions:

```bash
# Basic stress test (20 runs)
npm run test:stress

# Comprehensive test (50+ runs)
npm run test:stress -- --runs 50

# Stop on first failure for debugging
npm run test:stress -- --bail

# Run tests in parallel
npm run test:stress -- --parallel 4
```

**When to use stress tests:**
- After fixing a flaky test to verify it's truly fixed
- Before merging changes that affect async operations, file I/O, or network calls
- When CI shows intermittent failures you can't reproduce locally
- Periodically as part of release validation

**What stress tests detect:**
- Race conditions (async operations completing in unexpected order)
- File handle leaks (resources not properly closed)
- Network timeout issues (connections not properly cleaned up)
- Global state pollution (tests affecting each other)

A healthy codebase should maintain **95%+ success rate** on stress tests.

### Sample Test User
```json
{
  "username": "testuser",
  "email": "test@example.com", 
  "password": "TestPassword123!"
}
```

### Sample Test Images
- Place test JPEG and HEIC files in server's working directory
- Ensure variety of formats: .jpg, .jpeg, .heic, .heif
- Test with different file sizes (small <1MB, large >5MB)

## Reporting Issues

When reporting authentication or HEIC issues, please include:
1. Browser console logs
2. Network tab screenshots
3. Server terminal output
4. Steps to reproduce
5. Expected vs actual behavior

## Success Criteria

✅ **Authentication Working**: Login/logout functional, images load only when authenticated  
✅ **HEIC Support Working**: HEIC files display as JPEG, no conversion errors  
✅ **Tests Passing**: `npm run test:run` and `cd server && npm test` pass consistently  
✅ **Security Active**: Proper headers, rate limiting, input validation  
✅ **Multi-device Ready**: Works across multiple machines with proper file sync handling