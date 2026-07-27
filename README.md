# BsmartQ

BsmartQ is an offline-first, AI-powered queue management platform designed for enterprise use on Windows, macOS, and Linux desktop environments.

## Product Vision

The system is designed to work fully without an internet connection and is downloadable and installable on desktop PCs as a desktop application using Electron.

When connectivity becomes available, the application automatically synchronizes local data with the cloud while continuing uninterrupted offline operation.

## Core Capabilities

- ✅ **Online & Offline Support** - Works seamlessly both with and without internet
- ✅ **Desktop Installation** - Windows, macOS, Linux installers available
- ✅ **Local Data Storage** - PostgreSQL + in-memory fallback
- ✅ **Cloud Synchronization** - Auto-sync when connectivity returns
- ✅ **AI-Powered Queue Intelligence** - Prediction & forecasting
- ✅ **Self-Service Kiosk** - Touch interface for ticket issuance
- ✅ **Operator Console** - Counter staff management
- ✅ **Live Displays** - Queue status signage
- ✅ **Analytics Dashboard** - AI insights & reporting
- ✅ **Multi-tenant Support** - Multiple branches, teams
- ✅ **Enterprise-ready** - Secure authentication, encryption

## Quick Start

### Web Server Mode

```bash
npm install
npm start
```

Visit: `http://localhost:3000`

### Desktop Application

#### Development
```bash
npm install
npm run desktop:dev
```

#### Build for Distribution
```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux

# All platforms
npm run build:all
```

Output installers in `dist/` folder

#### Quick Build (Windows)
```bash
./build-desktop.bat
```

#### Quick Build (macOS/Linux)
```bash
chmod +x build-desktop.sh
./build-desktop.sh
```

## Distribution

### Windows
- **NSIS Installer**: `BsmartQ Desktop-1.0.0-x64.exe`
- **Portable**: `BsmartQ Desktop 1.0.0.exe`

### macOS
- **DMG Image**: `BsmartQ Desktop-1.0.0.dmg`
- **ZIP Archive**: `BsmartQ Desktop-1.0.0.zip`

### Linux
- **AppImage**: `BsmartQ Desktop-1.0.0.AppImage`
- **Debian**: `BsmartQ Desktop-1.0.0.deb`

## Configuration

### Database Setup
```bash
# PostgreSQL required
# Configure in .env:
DB_HOST=localhost
DB_PORT=5432
DB_NAME=smartq
DB_USER=postgres
DB_PASSWORD=your_password
```

### Environment Variables
```bash
# Copy .env template
PORT=3000
IS_OFFLINE_MODE=false
TENANT_ID=tenant-default-001
BRANCH_NAME=Main Downtown Branch
```

## Admin Account

**Default Credentials:**
- Email: `buay@admin.com`
- Password: `buay102026`

## Documentation

- **Desktop Build Guide**: [DESKTOP_BUILD_GUIDE.md](./DESKTOP_BUILD_GUIDE.md)
- **Project Structure**: See workspace folders
- **Architecture**: Express.js + Electron + PostgreSQL

## Current Implementation

This repository contains the web/server-rendered prototype built with:
- **Backend**: Node.js + Express
- **Frontend**: EJS templates + Tailwind CSS
- **Desktop**: Electron + Electron Builder
- **Database**: PostgreSQL
- **Authentication**: JWT + Bcrypt

## Development

```bash
# Install dependencies
npm install

# Run web server
npm start

# Run desktop app (requires server running)
npm run desktop

# Build desktop installers
npm run build:desktop

# Run with hot-reload (development)
npm run desktop:dev
```

## System Status

Check system health:
```bash
curl http://localhost:3000/api/health
```

Response:
```json
{
  "status": "operational",
  "systemMode": "ONLINE",
  "dbConnected": true,
  "timestamp": "2026-07-27T...",
  "branch": "Main Downtown Branch"
}
```

## Features

### Kiosk Mode
- Self-service ticket issuance
- Multi-language support
- Touch-friendly interface
- Thermal printer integration

### Operator Console
- Real-time queue management
- Customer service tracking
- Performance analytics
- Service type routing

### Live Displays
- Queue status board
- Current serving tickets
- Wait time estimation
- Multi-zone support

### AI Analytics
- Demand forecasting
- Load prediction
- Efficiency scoring
- Anomaly detection

## Support & Documentation

### Development & Deployment Guides

- **Quick Start**: [QUICK_START_GUIDE.md](./QUICK_START_GUIDE.md) - Get running locally
- **Desktop Build**: [DESKTOP_BUILD_GUIDE.md](./DESKTOP_BUILD_GUIDE.md) - Build Electron apps
- **Desktop Build (Simple)**: [DESKTOP_BUILD_LATER.md](./DESKTOP_BUILD_LATER.md) - Quick reference for desktop
- **Render Deployment**: [RENDER_DEPLOYMENT_GUIDE.md](./RENDER_DEPLOYMENT_GUIDE.md) - Deploy to cloud
- **Deployment Checklist**: [RENDER_DEPLOYMENT_CHECKLIST.md](./RENDER_DEPLOYMENT_CHECKLIST.md) - Verification steps

## Cloud Deployment

### Deploy to Render (Recommended)

Deploy your BsmartQ system to Render with one click:

1. **Prepare:** Push code to GitHub
2. **Create:** Set up PostgreSQL database on Render
3. **Deploy:** Connect your repository
4. **Configure:** Set environment variables
5. **Launch:** Application goes live

See **[RENDER_DEPLOYMENT_GUIDE.md](./RENDER_DEPLOYMENT_GUIDE.md)** for complete instructions.

**Live Application URL:** `https://your-app-name.onrender.com`

### Cost
- **Free Tier:** $0/month (with limitations)
- **Basic:** $22+/month (7GB web + PostgreSQL)
- **Production:** $37+/month (1 CPU + 2GB RAM + PostgreSQL)

## For Detailed Documentation

See the guides above for:
- Local development setup
- Desktop application building
- Production cloud deployment
- Architecture & design
- Troubleshooting & support
