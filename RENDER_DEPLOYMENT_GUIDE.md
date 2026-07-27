# Render Deployment Guide - BsmartQ

## 📋 Overview

Deploy your BsmartQ application to Render with PostgreSQL database. This guide walks through the complete process.

---

## Prerequisites

- GitHub account (to connect your repository)
- Render account (free tier available)
- BsmartQ repository code

---

## Step 1: Prepare Repository

### 1.1 Push Code to GitHub

```bash
# Initialize git (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "BsmartQ - Ready for Render deployment"

# Add GitHub remote
git remote add origin https://github.com/YOUR_USERNAME/bsmartq.git

# Push to GitHub
git branch -M main
git push -u origin main
```

### 1.2 Verify Files Exist

These files should be in your repository:
- ✅ `render.yaml` - Render configuration
- ✅ `Procfile` - Process configuration
- ✅ `.env.production` - Production environment template
- ✅ `package.json` - With engines specified
- ✅ `app.js` - Main application
- ✅ All routes, views, public folders

---

## Step 2: Create Render Account

1. Go to https://render.com
2. Sign up with email or GitHub account
3. Verify your email

---

## Step 3: Create PostgreSQL Database on Render

### 3.1 Create Database Instance

1. From Render dashboard, click **"New +"**
2. Select **"PostgreSQL"**
3. Fill in details:
   - **Name:** `bsmartq-db`
   - **Database:** `smartq`
   - **User:** `postgres`
   - **Plan:** Choose tier (Free tier limited to 90 days)

4. Click **"Create Database"**
5. **Note down the connection details** shown (you'll need these)

### 3.2 Get Connection String

Wait for database to be ready, then:
1. Copy the **External Database URL**
2. Format: `postgresql://user:password@host:port/database`
3. Save this - you'll need it for the web service

---

## Step 4: Deploy Web Service to Render

### 4.1 Create Web Service

1. From dashboard, click **"New +"**
2. Select **"Web Service"**
3. Select your GitHub repository (`bsmartq`)
4. Fill in details:
   - **Name:** `bsmartq`
   - **Environment:** `Node`
   - **Region:** Choose closest to your users
   - **Branch:** `main`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Select tier (Free tier available)

5. Click **"Advanced"**

### 4.2 Set Environment Variables

In the **Environment** section, add these variables:

```
NODE_ENV = production

DB_HOST = (from PostgreSQL connection string - hostname only)
DB_PORT = 5432
DB_NAME = smartq
DB_USER = postgres
DB_PASSWORD = (your PostgreSQL password)
DB_SSL = true

PORT = 3000
IS_OFFLINE_MODE = false
TENANT_ID = tenant-default-001
BRANCH_NAME = Main Downtown Branch
JWT_SECRET = your-secure-jwt-secret-generate-a-random-string
```

### 4.3 Parse Connection String

If using Render PostgreSQL, extract from the External Database URL:

```
postgresql://postgres:PASSWORD@HOST:5432/smartq
                      ^^^^^^^^        ^^^^
                      Password        Host
```

### 4.4 Deploy

1. Review all settings
2. Click **"Create Web Service"**
3. Render will start building and deploying
4. Wait for deployment to complete (~5 minutes)

---

## Step 5: Verify Deployment

### 5.1 Check Health

Once deployed, you'll get a Render URL like: `https://bsmartq.onrender.com`

Test the health endpoint:

```bash
curl https://bsmartq.onrender.com/api/health
```

Should return:
```json
{
  "status": "operational",
  "systemMode": "ONLINE",
  "dbConnected": true,
  "timestamp": "2026-07-27T..."
}
```

### 5.2 Access Application

1. Go to `https://bsmartq.onrender.com`
2. Login with admin credentials:
   - **Email:** `buay@admin.com`
   - **Password:** `buay102026`

---

## Step 6: Initialize Database (First Time Only)

When deployed for the first time, the database tables are created automatically on first connection.

To verify:
1. Login to the application
2. Check if no errors appear
3. Try creating a ticket in the kiosk

If successful, your database is initialized!

---

## Complete Environment Variables Reference

### Required Variables

```env
NODE_ENV=production
PORT=3000
DB_HOST=your-render-db-host
DB_PORT=5432
DB_NAME=smartq
DB_USER=postgres
DB_PASSWORD=your-secure-password
DB_SSL=true
```

### Optional Variables

```env
IS_OFFLINE_MODE=false        # Keep false for production
TENANT_ID=tenant-default-001 # Default tenant ID
BRANCH_NAME=Main Downtown    # Your branch name
JWT_SECRET=your-secure-random-string-here
```

---

## Monitoring & Maintenance

### 5.1 View Logs

In Render dashboard:
1. Click your service
2. Go to **"Logs"** tab
3. View real-time application logs

### 5.2 Monitor Database

In Render dashboard:
1. Click your PostgreSQL instance
2. Go to **"Logs"** tab
3. Monitor database queries

### 5.3 Check Metrics

In Render dashboard:
1. Click your service
2. Go to **"Metrics"** tab
3. View CPU, memory, request rates

---

## Troubleshooting

### "Database connection failed"

**Check:**
1. Database is running in Render (green status)
2. Credentials are correct in environment variables
3. `DB_SSL=true` is set
4. Database user has correct permissions

**Fix:**
```bash
# Restart service from Render dashboard
# Click three dots → "Restart service"
```

### "Deployment failed"

**Check logs:**
1. Go to Render dashboard
2. Click service → **"Events"** tab
3. Look for error messages

**Common fixes:**
- `npm install` failed: Check `package.json` syntax
- Port already in use: Use port from `PORT` env variable
- Missing dependencies: Run `npm install` locally, commit `node_modules`

### "Application crashes on startup"

**Check:**
1. Environment variables are set correctly
2. Database credentials are correct
3. JWT_SECRET is set
4. Database has internet access

**Debug:**
1. View logs in Render dashboard
2. Check for PostgreSQL errors
3. Verify all env vars are set

### "Login not working"

**Ensure:**
1. `DB_SSL=true` is set
2. Database tables are created (check logs)
3. Admin user is seeded automatically
4. Credentials: `buay@admin.com` / `buay102026`

---

## Updating Your Application

### Push Updates to Render

```bash
# Make changes locally
# git add .
# git commit -m "Update message"

# Push to GitHub
git push origin main
```

Render automatically redeploys when code is pushed to the main branch!

### Manual Redeploy

If needed, redeploy from Render dashboard:
1. Click your service
2. Click three dots (•••)
3. Click **"Redeploy latest commit"**

---

## Scaling & Performance

### Free Tier Limitations

- **Web Service:** 0.5 CPU, 512 MB RAM
- **PostgreSQL:** Expires after 90 days, limited storage
- Sleeps after 15 minutes of inactivity

### Upgrade Plans

For production use:
1. **Paid Web Service:** $7+/month (always running)
2. **Paid PostgreSQL:** $15+/month (persistent storage)

---

## Security Best Practices

### 1. Change JWT Secret

Generate a secure random string:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set in Render environment:
```
JWT_SECRET=your-new-random-string
```

### 2. Update Admin Password (Production)

After deployment:
1. Login as admin
2. Dashboard → User Settings
3. Change password from default

### 3. Enable HTTPS

Render automatically provides HTTPS certificate. Always use:
```
https://bsmartq.onrender.com
```

### 4. Database Backups

Enable automated backups:
1. Go to PostgreSQL instance
2. Backups tab
3. Enable daily backups

---

## Custom Domain (Optional)

### Connect Custom Domain

1. Go to your service
2. **Settings** tab
3. **Custom Domain**
4. Enter your domain (e.g., `queue.yourcompany.com`)
5. Follow DNS instructions

---

## Rollback Previous Version

If deployment causes issues:

1. Go to Render service
2. Click **"Events"** tab
3. Find previous successful deployment
4. Click **"Redeploy"** button

---

## Cost Estimation

### Free Tier
- Web Service: Free (with limitations)
- PostgreSQL: Free for 90 days
- Total: **$0/month** (limited)

### Basic Production
- Web Service: $7/month
- PostgreSQL: $15/month
- Total: **$22/month**

### Standard Production
- Web Service: $12/month (1 CPU, 2GB RAM)
- PostgreSQL: $25/month (increased storage)
- Total: **$37+/month**

---

## Quick Reference

| Action | Steps |
|--------|-------|
| **Deploy** | Push to GitHub → Render auto-deploys |
| **View Logs** | Dashboard → Service → Logs |
| **Restart** | Dashboard → (•••) → Restart |
| **Update Env Vars** | Dashboard → Environment → Edit |
| **Database Access** | Via connection string in dashboard |
| **Custom Domain** | Settings → Custom Domain |

---

## Support Resources

- **Render Docs:** https://render.com/docs
- **PostgreSQL Docs:** https://www.postgresql.org/docs/
- **Express.js Docs:** https://expressjs.com/
- **Troubleshooting:** Check Render dashboard → Logs

---

## Next Steps

1. **Create GitHub repository** with your code
2. **Sign up on Render**
3. **Create PostgreSQL database**
4. **Deploy web service**
5. **Set environment variables**
6. **Monitor logs** for any errors
7. **Access your live application**

Your BsmartQ application will be live at: `https://bsmartq.onrender.com` (or your custom domain)!

---

## Live Deployment Checklist

- [ ] Code pushed to GitHub
- [ ] Render account created
- [ ] PostgreSQL database created on Render
- [ ] Web service connected to GitHub
- [ ] All environment variables set
- [ ] Application deployed successfully
- [ ] Health endpoint responds correctly
- [ ] Can login with admin account
- [ ] Database tables created automatically
- [ ] Custom domain configured (optional)
- [ ] Backups enabled for database

**You're ready for production! 🚀**
