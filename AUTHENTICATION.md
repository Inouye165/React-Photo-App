# Photo App Authentication System

## Overview

This photo application now includes a comprehensive, production-ready authentication system that prevents unauthorized access to all application features. The system is built with best security practices and is ready for web service deployment.

## Security Features

### 🔐 JWT-Based Authentication
- Stateless JWT tokens for scalable authentication
- Configurable token expiration (default: 24 hours)
- Secure token storage in localStorage with automatic cleanup

### 🛡️ Password Security
- Strong password requirements (min 8 chars, uppercase, lowercase, numbers, special chars)
- Bcrypt hashing with salt rounds (12)
- Account lockout after 5 failed login attempts (15-minute lockout)

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
- Role-based access control (admin/user roles)
- User registration with validation
- Account activation status
- Failed login attempt tracking

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
npm run create-admin
```
Follow the prompts to create your first admin user.

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
- `POST /auth/login` - User login
- `POST /auth/register` - User registration
- `POST /auth/verify` - Token verification
- `GET /health` - Health check

### Protected Endpoints (Require Authentication)
- `GET /photos` - List photos
- `POST /upload` - Upload photos
- `PATCH /photos/:id/state` - Update photo state
- `DELETE /photos/:id` - Delete photos
- All static file serving (`/working`, `/inprogress`, `/finished`)

## User Roles

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

### User Interface
- User info bar showing logged-in user and role
- Admin badge for administrative users
- Secure logout functionality
- Automatic redirect to login when unauthenticated

### API Integration
- Automatic JWT token inclusion in requests
- Authentication error handling with auto-logout
- Graceful handling of expired tokens

## Production Deployment Checklist

### 🔧 Configuration
- [ ] Change `JWT_SECRET` to a strong, unique value
- [ ] Set `NODE_ENV=production`
- [ ] Configure appropriate `CORS_ORIGIN` for your domain
- [ ] Set up HTTPS and configure `ENABLE_HTTPS=true`
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

## Support

This authentication system provides enterprise-grade security suitable for production web services. All major security vulnerabilities are addressed, and the system is designed to scale with your application.

For additional security hardening or custom requirements, consider implementing:
- Two-factor authentication (2FA)
- OAuth integration
- Advanced session management
- Audit logging and compliance features