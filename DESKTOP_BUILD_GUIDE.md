# BsmartQ Desktop - Build & Distribution Guide

## Overview

BsmartQ is now configured as an **Electron desktop application** that can be installed on Windows, macOS, and Linux. This guide covers building, packaging, and distributing the desktop application.

---

## Prerequisites

### Windows
- Node.js 16+ and npm
- Windows 10/11 (64-bit)
- (Optional) Visual Studio Build Tools for advanced code signing

### macOS
- Node.js 16+ and npm
- macOS 10.13+
- Xcode Command Line Tools: `xcode-select --install`

### Linux
- Node.js 16+ and npm
- Build essentials: `sudo apt-get install build-essential`

---

## Installation & Setup

### 1. Install Dependencies

```bash
npm install
```

This installs:
- **Electron** - Desktop framework
- **Electron Builder** - Packaging & installer creation
- **Express** - Backend server
- **PostgreSQL driver** - Database support
- All other app dependencies

### 2. Create Application Icons

Icons are required for all platforms. Convert the SVG template to platform-specific formats:

#### Option A: Using Online Converter
1. Visit https://icoconvert.com/ or https://convertio.co/
2. Upload `public/images/icon.svg`
3. Convert to multiple formats:
   - **Windows**: `.ico` format (256x256)
   - **macOS**: `.icns` format
   - **Linux**: `.png` format (512x512)

#### Option B: Using ImageMagick (CLI)

```bash
# Install ImageMagick
# Windows (Chocolatey): choco install imagemagick
# macOS (Homebrew): brew install imagemagick
# Linux: sudo apt-get install imagemagick

# Generate Windows ICO
convert public/images/icon.svg -define icon:auto-resize=256,128,96,64,48,32,16 public/images/icon.ico

# Generate Linux PNG
convert public/images/icon.svg -resize 512x512 public/images/icon.png

# Generate macOS ICNS (requires more steps, use online tool)
```

#### Option C: Professional Design
For production, use design tools like:
- Adobe Illustrator
- Figma
- Sketch

**Save as:**
- `public/images/icon.ico` (Windows)
- `public/images/icon.icns` (macOS)
- `public/images/icon.png` (Linux)

---

## Development & Testing

### Run Desktop App in Development Mode

```bash
npm run desktop:dev
```

This will:
1. Start the Express backend server on `http://localhost:3000`
2. Launch the Electron app once the server is ready
3. Open DevTools for debugging

### Run Desktop App (Pre-built)

```bash
npm run desktop
```

Requires the backend server to be running separately:

```bash
# Terminal 1: Start backend
npm start

# Terminal 2: Launch Electron
npm run desktop
```

---

## Building Installers

### Build for Windows

```bash
npm run build:win
```

**Output:**
- `dist/BsmartQ Desktop-1.0.0-x64.exe` - NSIS Installer (recommended)
- `dist/BsmartQ Desktop 1.0.0.exe` - Portable executable

**Features:**
- Installer with custom welcome screen
- Start Menu shortcuts
- Desktop shortcut
- Uninstaller

### Build for macOS

```bash
npm run build:mac
```

**Output:**
- `dist/BsmartQ Desktop-1.0.0.dmg` - Disk image
- `dist/BsmartQ Desktop-1.0.0.zip` - ZIP archive

### Build for Linux

```bash
npm run build:linux
```

**Output:**
- `dist/BsmartQ Desktop-1.0.0.AppImage` - Standalone executable
- `dist/BsmartQ Desktop-1.0.0.deb` - Debian package

### Build for All Platforms

```bash
npm run build:all
```

---

## Distribution

### 1. Windows Distribution

#### Via Installer (NSIS)
- **File**: `BsmartQ Desktop-1.0.0-x64.exe`
- **Size**: ~200-300 MB (includes Node.js runtime)
- **Installation**: User downloads and runs the `.exe` file
- **Location**: Installs to `C:\Program Files\BsmartQ Desktop\`

#### Via Portable Executable
- **File**: `BsmartQ Desktop 1.0.0.exe`
- **Size**: ~200-300 MB
- **Installation**: No installation needed, run directly
- **Portability**: Can be run from USB drive

#### Distribution Methods:
1. **Direct Download** - Host on your website
2. **GitHub Releases** - Upload to GitHub releases page
3. **Microsoft Store** - (Requires additional setup)
4. **Software Distribution Platforms** - AppGetWinget, Chocolatey, etc.

### 2. macOS Distribution

#### Via DMG (Disk Image)
- **File**: `BsmartQ Desktop-1.0.0.dmg`
- **Installation**: User opens DMG and drags app to Applications folder
- **Code Signing**: (Optional but recommended for security)

```bash
# For code signing (requires Apple Developer account)
# Update electron/builder.config.json with your signing identity
npm run build:mac
```

### 3. Linux Distribution

#### Via AppImage
- **File**: `BsmartQ Desktop-1.0.0.AppImage`
- **Installation**: Make executable and run: `./BsmartQ\ Desktop-1.0.0.AppImage`
- **Portability**: Works on most Linux distributions

#### Via Debian Package
- **File**: `BsmartQ Desktop-1.0.0.deb`
- **Installation**: `sudo apt install ./BsmartQ\ Desktop-1.0.0.deb`
- **Package Manager**: Appears in application menus

---

## Configuration for Distribution

### Update Version

Edit `package.json`:

```json
{
  "version": "1.0.1",
  "name": "bsmartq",
  "description": "Your updated description"
}
```

### Customize Installer (Windows)

Edit `electron/builder.config.json`:

```json
{
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true,
    "createDesktopShortcut": true,
    "shortcutName": "BsmartQ Desktop"
  }
}
```

### Auto-Update (Advanced)

To add automatic updates, implement electron-updater:

```bash
npm install electron-updater
```

Then configure in `electron/main.js` to check for updates on app start.

---

## Database Configuration for Desktop

### SQLite (Offline-First)
For true offline operation, the built desktop app can use SQLite:

```javascript
// In electron/main.js
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database(':memory:'); // or './data.db'
```

### PostgreSQL (Cloud Sync)
The current setup uses PostgreSQL. For desktop distribution:

1. **Local PostgreSQL** - User installs PostgreSQL locally
2. **Cloud PostgreSQL** - Connect to remote server (recommended)
3. **Embedded PostgreSQL** - Package PostgreSQL with the app (advanced)

### Environment Configuration

Update `.env` for distribution:

```env
# .env.production
DB_HOST=your-cloud-db.example.com
DB_PORT=5432
DB_NAME=smartq_prod
DB_USER=prod_user
DB_PASSWORD=secure_password_here
DB_SSL=true
PORT=3000
```

---

## Security Best Practices

### 1. Code Signing (Production)

**Windows:**
```bash
npm run build:win -- --publish=never
```

Requires code signing certificate from a trusted CA.

**macOS:**
```bash
# Requires Apple Developer account and signing certificate
npm run build:mac
```

### 2. Notarization (macOS)

For macOS, Apple requires app notarization. See electron-builder docs.

### 3. Environment Variables

Never hardcode sensitive data. Use:
```bash
# .env (git-ignored)
DB_PASSWORD=your_secure_password
```

### 4. Auto-Updates

Implement secure update mechanism to patch vulnerabilities.

---

## Release Checklist

- [ ] All dependencies installed: `npm install`
- [ ] Application tested locally: `npm run desktop:dev`
- [ ] Icons created for all platforms
- [ ] Version bumped in `package.json`
- [ ] `.env.production` configured
- [ ] Built for target platform: `npm run build:win`
- [ ] Installer tested on clean machine
- [ ] README updated with installation instructions
- [ ] Release notes prepared
- [ ] Artifacts uploaded to distribution channel

---

## Troubleshooting

### "Icon not found" error
- Ensure `public/images/icon.ico` exists
- Use `icoconvert.com` to generate from SVG

### "Port 3000 already in use"
- Change port in `.env`: `PORT=3001`
- Or kill process: `npx kill-port 3000`

### "PostgreSQL connection failed"
- Update `.env` with correct database credentials
- Ensure PostgreSQL server is running
- For offline mode, ensure Express can start in memory mode

### "Electron window won't load"
- Check that Express server started successfully
- Verify `npm run desktop:dev` output
- Check browser console: Press `Ctrl+Shift+I` in app

---

## Distribution Channels

### Recommended: GitHub Releases
1. Create GitHub repository
2. Create a release with tag `v1.0.0`
3. Upload built installers as release assets

### Alternative: Website Download
1. Host installers on your web server
2. Create download page
3. Add version checking to app

### Windows Store
1. Setup Microsoft Partner Center account
2. Submit app for certification
3. Users download from Microsoft Store

---

## Monitoring & Support

### Analytics
Add analytics to track:
- Download counts
- Crash reports
- Feature usage

```javascript
// In app.js
app.on('error', (error) => {
  // Send to analytics service
});
```

### Support Portal
- Create help documentation
- Support email/ticket system
- Community forum

---

## Summary

Your BsmartQ app is now ready for distribution as a desktop application:

✅ **Windows**: NSIS installer + portable executable
✅ **macOS**: DMG image + ZIP archive  
✅ **Linux**: AppImage + Debian package

**Next Steps:**
1. Generate application icons
2. Run `npm run build:win` (or your target platform)
3. Distribute the installer file
4. Users can download and install the app

---

## Support

For issues, visit:
- GitHub: https://github.com/your-repo/bsmartq
- Documentation: See README.md
