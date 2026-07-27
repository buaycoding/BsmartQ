# BsmartQ - Quick Reference Card

## 🎯 Current Status

```
✅ SYSTEM OPERATIONAL
✅ DATABASE CONNECTED
✅ DEPLOYMENT READY
```

**Server:** http://localhost:3001  
**Admin:** buay@admin.com / buay102026

---

## 📚 Documentation Map

### I want to...

| Goal | Document |
|------|----------|
| **Use the system locally** | [QUICK_START_GUIDE.md](./QUICK_START_GUIDE.md) |
| **Deploy to cloud** | [RENDER_DEPLOYMENT_GUIDE.md](./RENDER_DEPLOYMENT_GUIDE.md) |
| **Build desktop app** | [DESKTOP_BUILD_GUIDE.md](./DESKTOP_BUILD_GUIDE.md) |
| **Quick desktop reference** | [DESKTOP_BUILD_LATER.md](./DESKTOP_BUILD_LATER.md) |
| **Check deployment status** | [DEPLOYMENT_SUMMARY.md](./DEPLOYMENT_SUMMARY.md) |
| **Verify before deploying** | [RENDER_DEPLOYMENT_CHECKLIST.md](./RENDER_DEPLOYMENT_CHECKLIST.md) |

---

## ⚡ Quick Commands

### Start Application
```bash
npm start
# Opens on http://localhost:3001
```

### Stop Application
```
Press Ctrl + C
```

### Check System Health
```bash
curl http://localhost:3001/api/health
```

### Deploy to Render
```bash
# Push to GitHub first
git push origin main

# Then use Render dashboard
# (See RENDER_DEPLOYMENT_GUIDE.md)
```

---

## 🔑 Key Information

### Default Admin Account
- **Email:** buay@admin.com
- **Password:** buay102026

### Database
- **Type:** PostgreSQL
- **Host:** localhost (local) / Render (cloud)
- **Port:** 5432
- **Database:** smartq

### Ports
- **Local:** 3001 (auto-switches to 3002, 3003 if busy)
- **Cloud:** 443 (HTTPS)

---

## 🌐 Available URLs (Local)

| Feature | URL |
|---------|-----|
| Home | http://localhost:3001 |
| Kiosk | http://localhost:3001/kiosk/touch |
| Operator | http://localhost:3001/counter/operator |
| Display | http://localhost:3001/display |
| Analytics | http://localhost:3001/analytics/ai |
| Dashboard | http://localhost:3001/dashboard |
| Login | http://localhost:3001/login |
| Register | http://localhost:3001/register |
| Health API | http://localhost:3001/api/health |

---

## 📋 File Structure

```
smart enog/
├── app.js                           # Main server
├── package.json                     # Dependencies
├── render.yaml                      # Cloud config
├── Procfile                         # Process file
├── .env                             # Local env
├── .env.production                  # Production env
├── .gitignore                       # Git security
├── routes/                          # API routes
│   └── auth.js                     # Authentication
├── views/                           # HTML templates
│   ├── home.ejs
│   ├── kiosk-touch.ejs
│   ├── operator.ejs
│   ├── display.ejs
│   ├── analytics.ejs
│   └── ...
├── public/                          # Static files
│   ├── styles.css
│   └── images/
├── data/                            # Data files
│   └── users.json
└── docs/
    ├── QUICK_START_GUIDE.md
    ├── RENDER_DEPLOYMENT_GUIDE.md
    └── ...
```

---

## 🚀 Deployment Timeline

### Local Development
- ✅ System running
- ✅ All features working
- ✅ Database connected

### Cloud Deployment (Render)
```
Day 1: 15 minutes
├─ Push to GitHub
├─ Create PostgreSQL
├─ Create Web Service
└─ Set environment variables

Day 1: Live! 🎉
└─ Access at https://your-app.onrender.com
```

---

## 🔄 Common Tasks

### Create New User
1. Login as admin
2. Go to Dashboard
3. Click "Invite Member"
4. Fill in details
5. Share credentials with user

### Check System Status
```bash
curl http://localhost:3001/api/health
```

### View Server Logs
- Keep terminal where `npm start` runs open
- Watch for error messages
- Check database connection status

### Update Environment Variable
1. Edit `.env` file
2. Save changes
3. Restart: `npm start`

---

## 🆘 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| Port already in use | App auto-switches to 3002, 3003, etc. |
| Can't login | Check email/password (case-sensitive) |
| Database error | Ensure PostgreSQL is running |
| Page not loading | Check if `npm start` is running |
| Features missing | Login first or check user role |

---

## 📊 System Features

### Queue Management
- Issue tickets
- Track metrics
- Real-time updates
- Multi-service support

### User Management
- Admin accounts
- Staff roles
- Multi-tenant support
- Session management

### Reporting
- Queue statistics
- Efficiency scores
- Load forecasting
- Performance analytics

### Security
- JWT authentication
- Bcrypt password hashing
- HTTPS (on cloud)
- SQL injection protection

---

## 📈 Next Steps

### Immediate (This Week)
- [ ] Explore all features locally
- [ ] Add team members
- [ ] Test queue operations

### Soon (This Month)
- [ ] Deploy to Render
- [ ] Configure custom domain
- [ ] Set up backups

### Later (Plan Ahead)
- [ ] Build desktop app
- [ ] Enable auto-scaling
- [ ] Plan for growth

---

## 💡 Pro Tips

1. **Keep admin password secure** - Change it after first login
2. **Monitor logs regularly** - Check Render logs daily
3. **Backup database** - Enable automated backups on Render
4. **Test updates** - Test new features locally before production
5. **Document changes** - Keep deployment notes

---

## 🆘 Need Help?

- **Can't deploy?** → [RENDER_DEPLOYMENT_GUIDE.md](./RENDER_DEPLOYMENT_GUIDE.md)
- **Features unclear?** → [QUICK_START_GUIDE.md](./QUICK_START_GUIDE.md)
- **System down?** → Check `npm start` terminal for errors
- **Database issues?** → Verify PostgreSQL is running

---

## ✅ Deployment Checklist (TL;DR)

- [ ] Code pushed to GitHub
- [ ] Render account created
- [ ] PostgreSQL database created
- [ ] Web service connected
- [ ] Environment variables set
- [ ] Application deployed
- [ ] Health check passes
- [ ] Can login as admin

---

## 🎉 Success Criteria

✅ System runs locally without errors  
✅ Can access all features  
✅ Admin login works  
✅ Database is connected  
✅ Ready for cloud deployment  

**YOU'RE ALL SET!**

Your BsmartQ Queue Management System is ready for production use.

---

**Last Updated:** 2026-07-27  
**Status:** ✅ Production Ready  
**Version:** 1.0.0
