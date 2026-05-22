# Quick Reference Guide

## User Management Commands

### Add New User
```bash
cd server
npm run create-user <username> <password> [email]
```
Example:
```bash
npm run create-user john MyPass123 john@example.com
```

### Reset Password
```bash
cd server
npm run reset-password <username> <new-password>
```
Example:
```bash
npm run reset-password john NewPass456
```

---

## Development Commands

### Start Frontend (Port 3000)
```bash
npm start
```

### Start Backend (Port 3001)
```bash
cd server
npm run dev
```

### Build for Production
```bash
# Frontend
npm run build

# Backend
cd server
npm run build
```

---

## Default Login
- Username: `Concho1`
- Password: `password`
- MFA: Disabled by default (can be enabled per user)

---

## Multi-Factor Authentication

### Setup MFA
1. Log in to dashboard
2. Go to "My Account" page
3. Click "Enable MFA"
4. Scan QR code with authenticator app
5. Enter verification code
6. Save backup codes!

### Login with MFA
1. Enter username & password
2. Enter 6-digit code from authenticator app
3. Or use backup code if phone is lost

### Disable MFA
1. Go to "My Account"
2. Click "Disable MFA"
3. Enter password to confirm

---

## Audit Logging Commands

### View Recent Audit Logs
```bash
cd server
npm run view-logs
```

### View Failed Logins
```bash
npm run view-logs -- --type LOGIN_FAILURE --days 1
```

### View User Activity
```bash
npm run view-logs -- --username Concho1 --days 7
```

### View All Security Events
```bash
npm run view-logs -- --category SECURITY
```

---

## Useful Database Commands

### View All Users
```bash
cd server
sqlite3 database.sqlite "SELECT username, email, created_at FROM users;"
```

### Backup Database
```bash
copy server\database.sqlite server\database-backup.sqlite
```

---

## Port Information
- Frontend: http://localhost:3000
- Backend: http://localhost:3001
- Backend Health: http://localhost:3001/api/health

---

## Environment Files
- Frontend: `.env` (API URL configuration)
- Backend: `server/.env` (JWT secret)

---

## Common Issues

### Stop All Node Processes (if ports are busy)
```bash
taskkill /F /IM node.exe
```

### Reset Database (creates fresh with default user)
```bash
del server\database.sqlite
cd server
npm run dev
```
