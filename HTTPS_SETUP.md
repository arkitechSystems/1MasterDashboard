# HTTPS Setup Guide

This guide explains how to enable HTTPS for both local development and production deployment.

## Table of Contents
- [Local Development HTTPS](#local-development-https)
- [Production HTTPS](#production-https)
- [Troubleshooting](#troubleshooting)

---

## Local Development HTTPS

### Prerequisites
- **OpenSSL** must be installed on your system

**Installation:**
- **Windows**: Download from [Win32/Win64 OpenSSL](https://slproweb.com/products/Win32OpenSSL.html)
- **Mac**: `brew install openssl`
- **Linux**: `sudo apt-get install openssl` or `sudo yum install openssl`

### Step 1: Generate SSL Certificates

Run the following command in the project root:

```bash
npm run generate-certs
```

This will:
- Create a `server/certs` directory
- Generate `key.pem` (private key)
- Generate `cert.pem` (certificate)
- Certificates are valid for 365 days

**Note**: These certificates are self-signed and only for local development. Your browser will show a security warning - this is expected and safe to bypass for localhost.

### Step 2: Enable HTTPS for Backend

Update `server/.env`:

```env
USE_HTTPS=true
```

### Step 3: Enable HTTPS for Frontend (Optional)

Update `.env` in the project root:

```env
HTTPS=true
REACT_APP_API_URL=https://localhost:3001
```

**Note**: React's dev server will also use a self-signed certificate.

### Step 4: Start the Servers

```bash
# Terminal 1 - Backend
npm run server

# Terminal 2 - Frontend
npm start

# Terminal 3 - File Watcher (optional)
npm run watch-gldet
```

### Step 5: Access the Application

- **Frontend**: `https://localhost:3000`
- **Backend API**: `https://localhost:3001`

**Browser Security Warning:**
1. You'll see "Your connection is not private" or similar
2. Click "Advanced"
3. Click "Proceed to localhost (unsafe)"
4. This is safe for local development with self-signed certificates

---

## Production HTTPS

### Deployment to Render.com (Recommended)

Render.com provides **automatic HTTPS** with free SSL certificates:

✅ **Automatic Features:**
- Free SSL/TLS certificates via Let's Encrypt
- Automatic certificate renewal
- HTTPS enforced by default
- No configuration required

### Setup Steps:

1. **Push your code to GitHub**
   ```bash
   git add .
   git commit -m "Add HTTPS support"
   git push origin master
   ```

2. **Deploy to Render.com**
   - Option A: Use Blueprint (recommended)
     - Upload `render.yaml` when creating service
   - Option B: Manual deployment
     - Create Web Service from GitHub repo
     - Render automatically enables HTTPS

3. **Environment Variables**
   Set these in Render.com dashboard:
   ```
   JWT_SECRET=<your-secure-secret-key>
   NODE_ENV=production
   USE_HTTPS=false  # Render handles HTTPS at the proxy level
   ```

4. **Access Your App**
   - Render provides: `https://your-app-name.onrender.com`
   - Automatic HTTPS redirect from HTTP
   - Valid SSL certificate (no browser warnings)

### Other Hosting Platforms

#### Heroku
- Automatic HTTPS on all paid dynos
- Free tier: HTTPS available but not enforced
- Add `heroku/nodejs` buildpack

#### AWS / DigitalOcean / Azure
- Requires manual SSL certificate setup
- Use AWS Certificate Manager, DigitalOcean certificates, or Azure SSL
- Configure load balancer for HTTPS

#### Custom Server
1. Obtain SSL certificate (Let's Encrypt, etc.)
2. Set `USE_HTTPS=true` in server/.env
3. Place certificates in `server/certs/`
4. Configure firewall for port 443

---

## Configuration Files Reference

### Frontend (.env)
```env
# HTTP (default local dev)
REACT_APP_API_URL=http://localhost:3001

# HTTPS (secure local dev)
HTTPS=true
REACT_APP_API_URL=https://localhost:3001

# Production (Render.com)
REACT_APP_API_URL=https://your-backend.onrender.com
```

### Backend (server/.env)
```env
PORT=3001
JWT_SECRET=your-secret-key-change-this
NODE_ENV=development

# Local HTTPS
USE_HTTPS=true

# Production (Render.com handles HTTPS)
USE_HTTPS=false
```

---

## Security Best Practices

### Local Development
- ✅ Self-signed certificates are OK
- ✅ Certificate warnings are expected
- ✅ Don't commit certificates to git (.gitignore protects you)

### Production
- ✅ Always use valid SSL certificates
- ✅ Use strong JWT secrets (32+ random characters)
- ✅ Enable MFA for all admin accounts
- ✅ Keep secrets in environment variables, never in code
- ✅ Use HTTPS for all API requests
- ✅ Enable CORS only for trusted domains

---

## Troubleshooting

### "OpenSSL not found"
**Solution**: Install OpenSSL (see Prerequisites section)

### "Certificate not found" error
**Solution**: Run `npm run generate-certs` first

### Browser shows "Connection refused"
**Possible causes:**
1. Backend not running - Run `npm run server`
2. Wrong URL - Check REACT_APP_API_URL in .env
3. Port already in use - Change PORT in server/.env

### "Mixed content" warning in browser
**Cause**: Frontend is HTTPS, backend is HTTP (or vice versa)

**Solution**: Both must use same protocol:
- Either both HTTP (for local dev)
- Or both HTTPS (for secure local dev / production)

### React dev server won't start with HTTPS
**Solution**:
1. Make sure HTTPS variable is exactly: `HTTPS=true`
2. Restart dev server
3. Accept certificate warning in browser

### Backend won't start with HTTPS
**Checks:**
1. Verify USE_HTTPS=true in server/.env
2. Check certificates exist: `ls server/certs/`
3. Regenerate if needed: `npm run generate-certs`

---

## Testing HTTPS

### Test Backend HTTPS
```bash
# Should return: {"status":"ok","timestamp":"..."}
curl -k https://localhost:3001/api/health
```

The `-k` flag bypasses certificate validation (only for testing self-signed certs).

### Test Frontend HTTPS
1. Open browser to `https://localhost:3000`
2. Check address bar for padlock icon (may show warning for self-signed)
3. Open DevTools → Network tab
4. Verify requests use `https://`

---

## Files and Directories

### Created by HTTPS Setup
```
CchdDash/
├── generate-certificates.js    # Certificate generation script
├── HTTPS_SETUP.md             # This file
├── .env                       # Frontend config (you create)
├── server/
│   ├── .env                   # Backend config (you create)
│   └── certs/                 # SSL certificates (auto-generated)
│       ├── key.pem           # Private key
│       └── cert.pem          # Certificate
```

### Protected by .gitignore
- `server/certs/` - SSL certificates never committed
- `*.pem` - All certificate files
- `.env` files - Environment variables with secrets

---

## Quick Reference

### Enable HTTPS Locally
```bash
# 1. Generate certificates
npm run generate-certs

# 2. Edit server/.env
echo "USE_HTTPS=true" >> server/.env

# 3. Edit .env
echo "HTTPS=true" >> .env
echo "REACT_APP_API_URL=https://localhost:3001" >> .env

# 4. Start servers
npm run server  # Terminal 1
npm start       # Terminal 2
```

### Disable HTTPS (back to HTTP)
```bash
# Edit server/.env
USE_HTTPS=false

# Edit .env
HTTPS=false
REACT_APP_API_URL=http://localhost:3001
```

### Production Deployment Checklist
- [ ] Push code to GitHub
- [ ] Deploy to Render.com (or other host)
- [ ] Set environment variables in hosting dashboard
- [ ] Verify HTTPS works (check for padlock in browser)
- [ ] Test all API endpoints
- [ ] Enable MFA for admin accounts
- [ ] Monitor logs for SSL errors

---

## Support

### Resources
- [Render.com HTTPS Docs](https://render.com/docs/free-tls-certificates)
- [Let's Encrypt](https://letsencrypt.org/)
- [OpenSSL Documentation](https://www.openssl.org/docs/)

### Getting Help
If you encounter issues:
1. Check this troubleshooting guide
2. Review server logs: `npm run server`
3. Check browser console for errors
4. Verify environment variables are set correctly
