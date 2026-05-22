# CchdDash Deployment Guide

## Architecture

This is a full-stack application with:
- **Frontend**: React (Create React App) - Static site
- **Backend**: Node.js + Express + TypeScript
- **Database**: SQLite (embedded)
- **Authentication**: JWT tokens with bcrypt password hashing

## Local Development

### Prerequisites
- Node.js 16+ installed
- Git installed

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/Wmartin23/CchdDash.git
   cd CchdDash
   ```

2. **Install frontend dependencies**
   ```bash
   npm install
   ```

3. **Install backend dependencies**
   ```bash
   cd server
   npm install
   cd ..
   ```

4. **Configure environment variables**

   Frontend (.env):
   ```bash
   cp .env.example .env
   ```

   Backend (server/.env):
   ```bash
   cp server/.env.example server/.env
   ```

   Edit `server/.env` and change the JWT_SECRET to a secure random string.

5. **Start the backend server** (in one terminal)
   ```bash
   npm run server
   ```
   The backend will run on http://localhost:3001

6. **Start the frontend** (in another terminal)
   ```bash
   npm start
   ```
   The frontend will run on http://localhost:3000

### Default Login Credentials
- Username: `Concho1`
- Password: `password`

## Deploying to Render

### Option 1: Deploy via Blueprint (Recommended)

1. **Push your code to GitHub**
   ```bash
   git add .
   git commit -m "Add backend authentication"
   git push origin master
   ```

2. **Connect to Render**
   - Go to https://render.com and sign in
   - Click "New" → "Blueprint"
   - Connect your GitHub repository
   - Render will automatically detect the `render.yaml` file

3. **Configure Environment Variables**
   Render will auto-generate the JWT_SECRET, but you can also set it manually in the Render dashboard.

4. **Deploy**
   - Click "Apply" to deploy both services
   - Backend API will be at: `https://cchddash-api.onrender.com`
   - Frontend will be at: `https://cchddash-frontend.onrender.com`

### Option 2: Manual Deployment

#### Deploy Backend API

1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Configure:
   - **Name**: `cchddash-api`
   - **Environment**: Node
   - **Build Command**: `cd server && npm install && npm run build`
   - **Start Command**: `cd server && npm start`
   - **Environment Variables**:
     - `NODE_ENV=production`
     - `JWT_SECRET=<generate-random-secure-string>`
     - `PORT=3001`

#### Deploy Frontend

1. Create a new Static Site on Render
2. Connect your GitHub repository
3. Configure:
   - **Name**: `cchddash-frontend`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `build`
   - **Environment Variables**:
     - `REACT_APP_API_URL=https://cchddash-api.onrender.com`

## Database Persistence

The SQLite database is stored in `server/database.sqlite`. On Render's free tier, this file will be ephemeral (resets on service restart). For production:

1. **Upgrade to Render paid plan** for persistent disk storage
2. **Or migrate to PostgreSQL/MySQL** for a hosted database solution

## Security Notes

1. **Change JWT_SECRET** - Use a strong random string in production
2. **HTTPS Only** - Render provides free SSL certificates
3. **Add More Users** - Use the `/api/auth/register` endpoint to create additional users
4. **Rate Limiting** - Consider adding rate limiting middleware for production

## API Endpoints

- `POST /api/auth/login` - Login with username/password
- `POST /api/auth/register` - Register new user
- `GET /api/auth/verify` - Verify JWT token
- `GET /api/health` - Health check

## Troubleshooting

### Backend won't start
- Check that all dependencies are installed: `cd server && npm install`
- Verify environment variables are set correctly
- Check logs: `npm run server`

### Frontend can't connect to backend
- Verify `REACT_APP_API_URL` in `.env` points to the correct backend URL
- Check CORS settings in `server/src/server.ts`
- Ensure backend is running and accessible

### Database errors
- Delete `server/database.sqlite` and restart the backend to recreate
- Default user will be recreated automatically

## Tech Stack

**Frontend:**
- React 19
- TypeScript
- Material-UI
- AG-Grid
- Recharts

**Backend:**
- Node.js
- Express
- TypeScript
- SQLite3
- JWT (jsonwebtoken)
- bcryptjs
- CORS

## User Management

For detailed instructions on adding users and resetting passwords, see [USER_MANAGEMENT.md](USER_MANAGEMENT.md).

Quick commands:
- **Add user**: `cd server && npm run create-user <username> <password> [email]`
- **Reset password**: `cd server && npm run reset-password <username> <new-password>`

## Support

For issues or questions, contact ArkiTech Systems.
