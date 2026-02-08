# Building WebP Converter for Windows 11

## Quick Start (Recommended)

### Option 1: Build on Windows PC

1. **Prerequisites on Windows 11:**
   - Install [Node.js 18+](https://nodejs.org/) (LTS version recommended)
   - Open PowerShell or Command Prompt

2. **Transfer the project:**
   - Copy the entire `webp-converter` folder to your Windows PC
   - Or clone from GitHub if you push it there

3. **Build:**
   ```powershell
   cd path\to\webp-converter
   npm install
   npm run build:win
   ```

4. **Install:**
   - Find `dist/WebP Converter Setup X.X.X.exe`
   - Double-click to install
   - Launch from Start Menu

### Option 2: Cross-compile from Linux (Current Machine)

**Note:** Cross-compiling for Windows from Linux can have issues with native dependencies (sharp). Building directly on Windows is recommended.

If you want to try anyway:

```bash
cd ~/Documents/GitHub/webp-converter
npm install
npm run build:win
```

Then transfer `dist/WebP Converter Setup X.X.X.exe` to Windows PC.

## What You Get

- **Installer:** `WebP Converter Setup X.X.X.exe` (~150MB)
- **Install location:** `C:\Users\<username>\AppData\Local\Programs\webp-converter\`
- **Start Menu shortcut:** "WebP Converter"
- **Uninstaller:** Included in Control Panel

## Development Mode (Test Before Building)

To test the app before building the installer:

```bash
npm install
npm start
```

This launches the app in development mode - perfect for testing on your current Linux machine!

## File Structure

```
webp-converter/
├── main.js           # Electron main process
├── preload.js        # Context bridge for security
├── renderer.js       # UI logic
├── index.html        # App UI
├── style.css         # Styling
├── package.json      # Dependencies & build config
└── README.md         # User documentation
```

## Build Configuration

The build is configured in `package.json` under the `build` section:
- **Target:** Windows 64-bit (NSIS installer)
- **One-click install:** Disabled (user can choose install location)
- **App ID:** com.webp.converter
- **Icon:** icon.ico (optional - create a 256x256 icon if desired)

## Troubleshooting

**"sharp" installation errors:**
- Windows: Run `npm install --platform=win32 --arch=x64 sharp`
- This pre-downloads the Windows binary

**Build fails on Linux:**
- Cross-compilation can be tricky
- Recommended: Build directly on Windows 11 machine

**Large installer size (~150MB):**
- Normal for Electron apps
- Includes Chromium runtime + Node.js + your app

**Need 32-bit version?**
- Change `"target": ["nsis"]` to include both
- Update build script: `--win --ia32 --x64`

## Publishing

Once built, you can:
1. Share the .exe installer directly
2. Push to GitHub and use GitHub Releases
3. Sign the executable (optional, requires code signing certificate)
