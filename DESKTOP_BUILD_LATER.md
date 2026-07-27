# Desktop Build Guide - For Later

When you're ready to build the desktop application, follow these steps.

---

## Prerequisites

- Node.js 16+ and npm installed
- Application icons (`.ico`, `.icns`, `.png`)
- ~1-2 hours for first build (downloads ~500MB of dependencies)

---

## Step 1: Prepare Icons

Your app icons are located at: `public/images/`

### Option 1: Use Online Converter (Easiest)

1. Go to https://icoconvert.com/
2. Upload this image as your template: `public/images/icon.svg`
3. Convert and download:
   - **Windows ICO** → Save as `public/images/icon.ico`
   - **macOS ICNS** → Save as `public/images/icon.icns` (use Mac tool or online)
   - **Linux PNG** → Save as `public/images/icon.png` (512x512)

### Option 2: Use ImageMagick (CLI)

```bash
# Install ImageMagick first
# Windows: choco install imagemagick

# Generate Windows icon
convert public/images/icon.svg -define icon:auto-resize=256,128,96,64,48,32,16 public/images/icon.ico

# Generate Linux icon
convert public/images/icon.svg -resize 512x512 public/images/icon.png

# macOS requires special handling - use online tool
```

---

## Step 2: Install Dependencies

This only needs to be done once:

```bash
npm install
```

This will take 3-5 minutes and download ~500MB.

---

## Step 3: Build for Your Platform

### Windows
```bash
npm run build:win
```

Creates:
- `dist/BsmartQ Desktop-1.0.0-x64.exe` (NSIS Installer)
- `dist/BsmartQ Desktop 1.0.0.exe` (Portable)

### macOS
```bash
npm run build:mac
```

Creates:
- `dist/BsmartQ Desktop-1.0.0.dmg` (DMG Image)
- `dist/BsmartQ Desktop-1.0.0.zip` (ZIP Archive)

### Linux
```bash
npm run build:linux
```

Creates:
- `dist/BsmartQ Desktop-1.0.0.AppImage` (Standalone)
- `dist/BsmartQ Desktop-1.0.0.deb` (Debian Package)

### All Platforms
```bash
npm run build:all
```

---

## Step 4: Distribute

After build completes:

1. Find installers in `dist/` folder
2. Share the `.exe` (Windows), `.dmg` (macOS), or `.AppImage` (Linux)
3. Users download and install like any desktop app

---

## Common Issues During Build

### "Icon not found"
- Ensure icons are in `public/images/`
- Use icoconvert.com if missing

### "Port 3000 already in use"
- The app uses port 3001 if 3000 is busy (automatic)

### Build takes too long
- First build: 10-15 minutes (normal)
- Subsequent builds: 2-5 minutes
- Downloads Electron binaries (~150MB each platform)

### Out of disk space
- Need ~2GB free during build
- `node_modules/` takes ~1.5GB
- Build artifacts: ~300MB

---

## File Sizes

Typical installer sizes:
- **Windows NSIS**: 250-300 MB
- **Windows Portable**: 250-300 MB
- **macOS DMG**: 250-300 MB
- **Linux AppImage**: 200-250 MB
- **Linux Deb**: 200-250 MB

---

## Version Updates

When ready for a new version:

1. Edit `package.json`:
```json
{
  "version": "1.0.1"
}
```

2. Rebuild:
```bash
npm run build:win  # or your platform
```

3. New versions go in `dist/`

---

## Scripts Available

```bash
# Development
npm run desktop:dev      # Start server + Electron
npm run desktop          # Run desktop (server must run separately)

# Building
npm run build:win        # Windows only
npm run build:mac        # macOS only
npm run build:linux      # Linux only
npm run build:all        # All platforms

# Quick builds
./build-desktop.bat      # Windows batch script
./build-desktop.sh       # macOS/Linux shell script
```

---

## Troubleshooting Desktop Build

### Application won't start
- Check that PostgreSQL is running
- Verify `.env` database credentials
- Check terminal output for errors

### Installer won't install
- Ensure Windows Installer service is running
- Try portable version instead
- Disable antivirus temporarily

### App crashes on launch
- Check that Express server started
- Review logs in user's %APPDATA% folder
- Try running `npm run desktop:dev` first

---

## When You're Ready

Just run one command:

```bash
./build-desktop.bat  # Windows users
./build-desktop.sh   # macOS/Linux users
```

Installers will appear in `dist/` folder ready for distribution!

---

**Keep your web system running for now:**
```bash
npm start
# Server runs on http://localhost:3001
```

**When ready for desktop, just follow the 4 steps above!**
