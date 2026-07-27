# BsmartQ System - Quick Start & Usage Guide

## ✅ System Status

Your BsmartQ system is **ONLINE and OPERATIONAL**!

```
🚀 BsmartQ Queue Platform Active
=========================================
• Status: OPERATIONAL
• System Mode: ONLINE (PostgreSQL connected)
• Database: Connected ✅
• Tenant ID: tenant-default-001
• Branch: Main Downtown Branch
• URL: http://localhost:3001
=========================================
```

---

## 🚀 Quick Start

### Access the Application

Open your browser and navigate to:
```
http://localhost:3001
```

### Admin Login Credentials

**Email:** `buay@admin.com`  
**Password:** `buay102026`

---

## 🎯 Main Features Available

### 1. **Home Dashboard**
- Live queue statistics
- Branch metrics
- System status indicators
- Quick access to all modules

**Access:** http://localhost:3001

### 2. **Self-Service Kiosk**
- Customer ticket issuance
- Touch-friendly interface
- Service type selection

**Access:** http://localhost:3001/kiosk/touch  
**Auth Required:** Yes (Login first)

### 3. **Operator Console**
- Counter staff management
- Real-time queue control
- Customer service tracking

**Access:** http://localhost:3001/counter/operator  
**Auth Required:** Yes

### 4. **Live Display Board**
- Queue status signage
- Current serving tickets
- Wait time display
- Multi-zone support

**Access:** http://localhost:3001/display  
**Auth Required:** Yes

### 5. **AI Analytics Dashboard**
- Demand forecasting
- Load prediction
- Efficiency metrics
- Performance insights

**Access:** http://localhost:3001/analytics/ai  
**Auth Required:** Yes

### 6. **Authentication**
- **Login:** http://localhost:3001/login
- **Register:** http://localhost:3001/register
- **Dashboard:** http://localhost:3001/dashboard
- **Logout:** http://localhost:3001/logout

---

## 💾 Database Information

### PostgreSQL Connection

**Status:** ✅ Connected  
**Host:** localhost  
**Port:** 5432  
**Database:** smartq  
**User:** postgres  
**Password:** (from .env)

### Tables

- **users** - Authentication & user management
- **queue_metrics** - Queue statistics & metrics

---

## 📊 System Architecture

```
┌─────────────────────────────────────┐
│        Web Browser (UI)              │
│   http://localhost:3001             │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│      Express.js Server              │
│   • Authentication (JWT)            │
│   • Queue Management                │
│   • API Endpoints                   │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│      PostgreSQL Database            │
│   • Users & Sessions                │
│   • Queue Metrics                   │
│   • Tenant Data                     │
└─────────────────────────────────────┘
```

---

## 🔐 Authentication Flow

1. **User Registration** (`/register`)
   - Create account with email & password
   - Auto-assigned to default tenant
   - Role: "staff" by default

2. **User Login** (`/login`)
   - Email + Password
   - JWT token created
   - Stored in secure HTTP-only cookie
   - 24-hour session duration

3. **Access Control**
   - Admin: Full system access
   - Staff: Limited to assigned features
   - Cookie-based session verification

---

## 🌐 API Endpoints

### Health Check
```
GET /api/health
Response: { status, systemMode, dbConnected, timestamp, ... }
```

### Authentication
```
GET  /login              - Login page
POST /login              - Submit login
GET  /register           - Registration page
POST /register           - Submit registration
GET  /logout             - Logout
GET  /dashboard          - User dashboard
```

### Queue Management
```
GET  /kiosk              - Kiosk module
GET  /kiosk/touch        - Touch interface
POST /tickets/issue      - Issue new ticket
GET  /counter/operator   - Operator console
GET  /queue/board        - Queue status board
POST /queue/action       - Queue actions (serve/complete/requeue)
```

### Display & Analytics
```
GET  /display            - Live display board
GET  /analytics/ai       - AI analytics dashboard
```

---

## ⚙️ Environment Configuration

Edit `.env` file to customize:

```env
# Server
PORT=3001
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=smartq
DB_USER=postgres
DB_PASSWORD=your_password

# System
IS_OFFLINE_MODE=false
TENANT_ID=tenant-default-001
BRANCH_NAME=Main Downtown Branch
```

---

## 📝 User Management

### Create New Users

**Admin Dashboard:**
1. Login as `buay@admin.com`
2. Navigate to Dashboard
3. Use "Invite Member" feature
4. Provide: Name, Email, Role
5. System generates temporary password
6. Share credentials with user

**Roles:**
- **admin** - Full system access
- **staff** - Limited access
- **counter** - Kiosk operator

---

## 🔄 Offline & Online Mode

### Current Mode
The system runs in **HYBRID MODE**:
- ✅ Works **ONLINE** when connected to PostgreSQL
- ✅ Works **OFFLINE** with in-memory queue if database unavailable
- ✅ Auto-reconnects when connection restored

### System Switching
- If PostgreSQL disconnects → Falls back to offline mode
- Retries connection every 10 seconds
- Automatically resumes online mode when available

### Check Status
```
curl http://localhost:3001/api/health
```

---

## 🚀 Running the System

### Start Server

```bash
npm start
```

**Output:**
```
🚀 BsmartQ Queue Platform Active
• Port: 3001
• Mode: ONLINE
• PostgreSQL: Connected
```

### Stop Server
```
Press Ctrl + C
```

### View Logs
Server logs appear in terminal showing:
- Server startup
- Authentication events
- Database operations
- Error messages

---

## 🐛 Troubleshooting

### "Port 3001 already in use"
The server will automatically switch to port 3002, 3003, etc.

### "PostgreSQL connection failed"
- Check PostgreSQL is running
- Verify credentials in `.env`
- System falls back to offline mode
- Check logs for connection errors

### "Login credentials invalid"
- Default admin email: `buay@admin.com`
- Default password: `buay102026`
- Password is case-sensitive

### "Database query error"
- Ensure PostgreSQL is running
- Check network connectivity
- Verify database credentials
- Check table permissions

---

## 📱 Features by User Role

### Admin Users
✅ Full system access  
✅ User management  
✅ Tenant administration  
✅ Analytics & reporting  
✅ System configuration  

### Staff Users
✅ Kiosk access  
✅ Queue management  
✅ View queue status  
✅ View own tickets  

### Counter Operators
✅ Serve customers  
✅ Issue tickets  
✅ View queue  
✅ Mark tickets complete  

---

## 💡 Best Practices

### Security
1. Change default admin password
2. Use strong passwords for new users
3. Regularly review user access
4. Keep PostgreSQL updated

### Performance
1. Monitor queue metrics regularly
2. Archive old data periodically
3. Maintain database indexes
4. Check server logs for errors

### Maintenance
1. Backup database regularly
2. Monitor disk space
3. Update system packages
4. Test disaster recovery

---

## 📞 Support & Help

### Check System Health
```bash
curl http://localhost:3001/api/health
```

### View Server Logs
Look at terminal output where `npm start` is running

### Database Status
```bash
# Verify PostgreSQL is running
psql -U postgres -d smartq -c "SELECT NOW();"
```

### Reset Admin Password (Advanced)

If needed, manually reset in PostgreSQL:
```sql
UPDATE users SET password = '$2a$12$FBRDwhfYYCyAAug2qJPTkuS64g6djSN5yE8wVZmvYqgHWLVSlaxZm' 
WHERE email = 'buay@admin.com';
```

---

## 🖥️ Desktop Application (For Later)

When you're ready to build the desktop app:

1. **Ensure Node.js 16+** installed
2. **Install dependencies:** `npm install`
3. **Generate app icons:**
   - Visit https://icoconvert.com/
   - Upload `public/images/icon.svg`
   - Download `.ico`, `.icns`, `.png` versions
   - Save to `public/images/`

4. **Build for your platform:**
   ```bash
   # Windows
   npm run build:win
   
   # macOS
   npm run build:mac
   
   # Linux
   npm run build:linux
   ```

5. **Installers will be in `dist/` folder**

See `DESKTOP_BUILD_GUIDE.md` for complete instructions.

---

## 📊 System Capabilities

### Queue Management
- Real-time ticket issuance
- Automatic sequencing
- Multi-service type support
- Priority handling
- Wait time calculation

### Analytics
- Queue metrics tracking
- Efficiency scoring
- Load forecasting
- Anomaly detection
- Performance reports

### Integration
- PostgreSQL database
- JWT authentication
- Multi-tenant support
- Offline fallback mode

### Scalability
- Handles multiple branches
- Supports multiple users
- Cloud-ready architecture
- Horizontal scaling capable

---

## ✨ What's Working

✅ Web server running on `http://localhost:3001`  
✅ PostgreSQL database connected  
✅ Authentication system (JWT + bcrypt)  
✅ User registration & management  
✅ Queue management & metrics  
✅ Online/Offline switching  
✅ API endpoints functional  
✅ Dashboard & analytics views  
✅ Admin console access  

---

## 🎯 Next Steps

1. **Access the application**: Open http://localhost:3001
2. **Login**: Use admin credentials (buay@admin.com / buay102026)
3. **Explore features**: Try Kiosk, Operator Console, Analytics
4. **Create users**: Add team members through Dashboard
5. **Test operations**: Issue tickets and manage queue
6. **When ready**: Build desktop installer

---

## 📞 Need Help?

Your system is **ready to use!** 

**Access it now:** http://localhost:3001

**Keep this terminal running** (where you ran `npm start`)

**Enjoy your BsmartQ Queue Management System!** 🎉
