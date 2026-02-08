# WebP Converter

A simple, beautiful desktop application to convert JPG and PNG images to WebP format with significant file size savings.

## Features

- 🎨 Clean, modern UI with drag-and-drop support
- 📦 Batch conversion (multiple files at once)
- ⚙️ Adjustable quality settings (1-100)
- 📊 Real-time file size comparison
- 💾 Shows savings percentage for each conversion
- 🖥️ Runs completely offline (no internet required)
- ⚡ Fast conversion using sharp library

## Installation & Usage

### For Development

1. **Install dependencies:**
   ```bash
   cd ~/Documents/GitHub/webp-converter
   npm install
   ```

2. **Run the app:**
   ```bash
   npm start
   ```

### Building for Windows 11

1. **Install dependencies (if not already done):**
   ```bash
   npm install
   ```

2. **Build Windows executable:**
   ```bash
   npm run build:win
   ```

3. **Find the installer:**
   - The installer will be in `dist/` folder
   - Look for `WebP Converter Setup X.X.X.exe`
   - Transfer this .exe file to your Windows 11 PC

4. **On Windows 11:**
   - Double-click the installer
   - Follow installation wizard
   - Launch "WebP Converter" from Start Menu

## How to Use

1. **Launch the app**
2. **Adjust quality slider** (default: 85)
   - Higher = better quality, larger file
   - Lower = more compression, smaller file
   - Recommended: 75-90 for most uses
3. **Add images:**
   - Drag and drop JPG/PNG files onto the drop zone
   - OR click the drop zone to browse files
4. **Click "Convert to WebP"**
5. **Check results** - shows file size savings for each conversion
6. **Output files** are saved in the same folder as originals with `.webp` extension

## Technical Details

- **Framework:** Electron (cross-platform desktop apps)
- **Image Processing:** Sharp (fast, high-quality WebP conversion)
- **Supported Formats:** JPG, JPEG, PNG → WebP
- **Output Location:** Same directory as source files
- **Quality Range:** 1-100 (default: 85)

## File Size Savings

WebP typically achieves:
- **30-50% smaller** than JPEG at same quality
- **25-35% smaller** than PNG (lossy)
- **26% smaller** than PNG (lossless mode)

## Requirements

### Development
- Node.js 18+ 
- npm

### Windows Build
- Windows 11 (64-bit)
- ~100MB disk space for installation

## Troubleshooting

**"App won't start"**
- Make sure Node.js 18+ is installed
- Run `npm install` again

**"Conversion failed"**
- Check that files are valid JPG/PNG images
- Ensure you have write permission in the output directory

**"Build failed"**
- Run `npm install` to ensure all dependencies are present
- Check that electron-builder is installed

## License

MIT - Feel free to use and modify as needed!

## Credits

Built with:
- [Electron](https://www.electronjs.org/) - Desktop app framework
- [Sharp](https://sharp.pixelplumbing.com/) - High-performance image processing
