# Building WebP Converter for Windows 11

## Quick Start (Recommended)

### Option 1: Build on Windows PC

1. **Prerequisites on Windows 11:**
   - Install [Node.js 18+](https://nodejs.org/) (LTS version recommended)
   - **Enable Developer Mode** (Settings → System → For developers → Developer Mode).
     electron-builder's code-signing toolchain extracts an archive containing macOS
     symlinks; without Developer Mode, Windows refuses to create them and the build
     fails at the signing step. See Troubleshooting below if you hit it.
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

### Option 2: Cross-compile from Linux

**Note:** Cross-compiling for Windows from Linux can have issues with native dependencies (sharp, which needs the win32-x64 prebuilt binary). Building directly on Windows is recommended.

If you want to try anyway:

```bash
cd path/to/webp-converter
npm install
npm run build:win
```

Then transfer `dist/WebP Converter Setup X.X.X.exe` to the Windows PC.

## What You Get

- **Installer:** `WebP Converter Setup X.X.X.exe` (~100MB)
- **Install location:** `C:\Users\<username>\AppData\Local\Programs\webp-converter\`
- **Start Menu shortcut:** "WebP Converter"
- **Uninstaller:** Included in Control Panel

## Development Mode (Test Before Building)

To test the app before building the installer:

```bash
npm install
npm start
```

This launches the app in development mode - no packaging step, fast iteration.

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
- **One-click install:** Enabled (`oneClick: true`) — installs per-user to the default
  location with no wizard; `allowToChangeInstallationDirectory` is `false`
- **App ID:** com.webp.converter
- **Icon:** icon.ico (optional - create a 256x256 icon if desired)

### Expected npm warnings

`npm install` prints deprecation warnings (`inflight`, `glob@7`, `rimraf@2`, `boolean`) and
`npm audit` reports vulnerabilities. These are all transitive dependencies of
`electron-builder` / `electron-builder`'s toolchain — build-time only. The shipped app's
dependency tree is clean:

```powershell
npm audit --omit=dev   # found 0 vulnerabilities
```

Don't run `npm audit fix --force` — it will try to downgrade or major-bump the build
toolchain. `electron` itself is the one devDependency whose binary *does* ship, so keep it
patched (`npm update electron`).

## Troubleshooting

**Build fails: "Cannot create symbolic link : A required privilege is not held by the client"**

Full error looks like:

```
⨯ cannot execute  cause=exit status 2
  errorOut=ERROR: Cannot create symbolic link : ...\winCodeSign\<id>\darwin\10.12\lib\libcrypto.dylib
```

electron-builder downloads `winCodeSign-2.6.0.7z`, which contains two macOS symlinks.
Creating a symlink on Windows needs the `SeCreateSymbolicLinkPrivilege`, which a normal
account only has when Developer Mode is on. 7-Zip exits non-zero, electron-builder treats
the whole extraction as failed, retries 4x, and gives up — even though the two files are
macOS-only and irrelevant to a Windows build.

Pick one fix:

1. **Enable Developer Mode** (preferred, permanent) — Settings → System → For developers.
   Then delete the failed cache and rebuild:
   ```powershell
   Remove-Item -Recurse -Force "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
   npm run build:win
   ```
2. **Run the build once from an elevated (Administrator) terminal** — the admin token holds
   the privilege. The cache persists, so later builds work unelevated.
3. **Extract the cache manually, skipping the two symlinks** (no admin, no Developer Mode):
   ```powershell
   $c = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
   Get-ChildItem $c -Directory | Remove-Item -Recurse -Force   # clear failed attempts
   $dst = Join-Path $c 'winCodeSign-2.6.0'
   New-Item -ItemType Directory -Path $dst -Force | Out-Null
   & .\node_modules\7zip-bin\win\x64\7za.exe x -bd -y "-o$dst" (Get-ChildItem $c -Filter *.7z)[0].FullName `
       '-x!darwin\10.12\lib\libcrypto.dylib' '-x!darwin\10.12\lib\libssl.dylib'
   Get-ChildItem $c -Filter *.7z | Remove-Item -Force
   ```
   `winCodeSign-2.6.0` is the exact directory name electron-builder looks for; if it exists,
   the download and extraction are skipped entirely.

**"sharp" installation errors:**
- Windows: Run `npm install --platform=win32 --arch=x64 sharp`
- This pre-downloads the Windows binary

**Build fails on Linux:**
- Cross-compilation can be tricky
- Recommended: Build directly on Windows 11 machine

**Large installer size (~100MB):**
- Normal for Electron apps
- Includes Chromium runtime + Node.js + your app
- Note: `build.extraResources` copies `node_modules/sharp` into `resources\sharp` in
  addition to `build.asarUnpack` already unpacking it. That duplication is worth removing
  if size matters.

**Need 32-bit version?**
- Change `"target": ["nsis"]` to include both
- Update build script: `--win --ia32 --x64`

## Publishing

Once built, you can:
1. Share the .exe installer directly
2. Push to GitHub and use GitHub Releases
3. Sign the executable (optional, requires code signing certificate)
