# Render Deployment Checklist

## Before Deployment

- [ ] All code committed to Git
- [ ] `render.yaml` file created
- [ ] `Procfile` file created
- [ ] `.env.production` file created
- [ ] `package.json` has `engines` specified
- [ ] `.gitignore` prevents sensitive files from being committed
- [ ] No hardcoded secrets in code
- [ ] All dependencies in `package.json`
- [ ] Local testing successful (`npm start` works)

## Render Setup

- [ ] Render account created (render.com)
- [ ] GitHub repository connected to Render
- [ ] PostgreSQL database created on Render
- [ ] Database credentials noted
- [ ] Web service created on Render
- [ ] All environment variables set in Render dashboard

## Environment Variables on Render

Must be set:
- [ ] `NODE_ENV=production`
- [ ] `DB_HOST` (from PostgreSQL)
- [ ] `DB_PORT=5432`
- [ ] `DB_NAME=smartq`
- [ ] `DB_USER=postgres`
- [ ] `DB_PASSWORD` (from PostgreSQL)
- [ ] `DB_SSL=true`
- [ ] `JWT_SECRET` (secure random string)
- [ ] `PORT=3000`

Optional:
- [ ] `IS_OFFLINE_MODE=false`
- [ ] `TENANT_ID=tenant-default-001`
- [ ] `BRANCH_NAME=Main Downtown Branch`

## Deployment

- [ ] Service deploys successfully
- [ ] No build errors in Render logs
- [ ] Application starts without errors
- [ ] Health endpoint responds: `/api/health`
- [ ] Can access home page: `/`

## Post-Deployment Verification

- [ ] Database connection successful
- [ ] Admin user exists and can login
- [ ] Default credentials work
- [ ] All features accessible
- [ ] No console errors in browser
- [ ] Logs show no errors in Render dashboard

## Ongoing

- [ ] Set up automated backups for database
- [ ] Monitor application logs daily
- [ ] Keep dependencies updated
- [ ] Test new features in staging before production
- [ ] Plan for scaling as traffic grows

---

## Quick Links

- Render Dashboard: https://dashboard.render.com
- PostgreSQL Status: [Service Name]
- Web Service Logs: [Service Name] → Logs
- Application URL: https://[your-app-name].onrender.com

---

**Status:** Ready for Render Deployment ✅
