const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const sharp = require('sharp');
const heicConvert = require('heic-convert');
const fs = require('fs').promises;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 950,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    autoHideMenuBar: true
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// HEIC decoding is slow, so keep recently decoded files around for previews.
const heicCache = new Map();
const HEIC_CACHE_LIMIT = 10;

async function loadInput(filePath, stats) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.heic' && ext !== '.heif') return filePath;

  const key = `${filePath}|${stats.mtimeMs}`;
  if (heicCache.has(key)) return heicCache.get(key);

  const heicBuffer = await fs.readFile(filePath);
  const outputBuffer = await heicConvert({ buffer: heicBuffer, format: 'PNG' });
  const buffer = Buffer.from(outputBuffer);

  heicCache.set(key, buffer);
  if (heicCache.size > HEIC_CACHE_LIMIT) {
    heicCache.delete(heicCache.keys().next().value);
  }
  return buffer;
}

function normalizeOptions(options = {}) {
  const toPositiveInt = (value) => {
    const n = parseInt(value, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const targetKB = parseFloat(options.targetKB);
  const crop = options.crop;
  const exactW = toPositiveInt(options.exactWidth);
  const exactH = toPositiveInt(options.exactHeight);

  return {
    quality: Math.min(100, Math.max(1, parseInt(options.quality, 10) || 85)),
    width: toPositiveInt(options.width),
    height: toPositiveInt(options.height),
    targetBytes: Number.isFinite(targetKB) && targetKB > 0 ? Math.round(targetKB * 1024) : null,
    crop: crop && crop.width > 0 && crop.height > 0
      ? {
        left: Math.round(crop.left) || 0,
        top: Math.round(crop.top) || 0,
        width: Math.round(crop.width),
        height: Math.round(crop.height)
      }
      : null,
    // Exact output size (crop tab only). Overrides max width/height.
    exact: exactW && exactH ? { width: exactW, height: exactH } : null
  };
}

// Keeps a crop rectangle inside the image bounds.
function clampCrop(crop, imgW, imgH) {
  const left = Math.min(Math.max(0, crop.left), imgW - 1);
  const top = Math.min(Math.max(0, crop.top), imgH - 1);
  return {
    left,
    top,
    width: Math.max(1, Math.min(crop.width, imgW - left)),
    height: Math.max(1, Math.min(crop.height, imgH - top))
  };
}

// Shrinks a crop to the largest centered rectangle with the given aspect ratio, so the
// crop box's pixel rounding never stretches the output.
function trimToRatio(crop, ratio) {
  let width = crop.width;
  let height = Math.round(width / ratio);
  if (height > crop.height) {
    height = crop.height;
    width = Math.max(1, Math.round(height * ratio));
  }
  return {
    left: crop.left + Math.floor((crop.width - width) / 2),
    top: crop.top + Math.floor((crop.height - height) / 2),
    width,
    height: Math.max(1, height)
  };
}

// Dimensions after EXIF auto-rotation, optional crop, and resize. Never enlarges: with an
// exact size larger than the crop, the output keeps the exact size's shape at the crop's size.
function computeOutputSize(meta, opts) {
  const swap = meta.orientation >= 5;
  const imgW = swap ? meta.height : meta.width;
  const imgH = swap ? meta.width : (meta.pageHeight || meta.height);
  let crop = opts.crop ? clampCrop(opts.crop, imgW, imgH) : null;
  if (crop && opts.exact) crop = trimToRatio(crop, opts.exact.width / opts.exact.height);
  const srcW = crop ? crop.width : imgW;
  const srcH = crop ? crop.height : imgH;

  let outW;
  let outH;
  let enlargeBlocked = false;
  if (crop && opts.exact) {
    enlargeBlocked = srcW < opts.exact.width;
    outW = enlargeBlocked ? srcW : opts.exact.width;
    outH = enlargeBlocked ? srcH : opts.exact.height;
  } else {
    let scale = 1;
    if (opts.width) scale = Math.min(scale, opts.width / srcW);
    if (opts.height) scale = Math.min(scale, opts.height / srcH);
    outW = Math.max(1, Math.round(srcW * scale));
    outH = Math.max(1, Math.round(srcH * scale));
  }

  return {
    crop,
    srcW,
    srcH,
    outW,
    outH,
    enlargeBlocked,
    resizing: outW !== srcW || outH !== srcH
  };
}

// Returns a function that encodes the (rotated, cropped, resized) image to WebP with the given options.
async function createEncoder(input, meta, opts, size) {
  const { crop, outW, outH, resizing } = size;
  // Cropping works on the first frame only.
  const animated = !crop && (meta.pages || 1) > 1;

  const pipeline = () => {
    let img = sharp(input, { animated }).rotate();
    if (crop) img = img.extract(crop);
    if (resizing && animated) {
      // Let sharp scale each frame to fit the max width/height.
      img = img.resize({
        width: opts.width || undefined,
        height: opts.height || undefined,
        fit: 'inside',
        withoutEnlargement: true,
        kernel: 'lanczos3'
      });
    } else if (resizing) {
      // Exact computed size, so the reported and written dimensions always match.
      img = img.resize({ width: outW, height: outH, fit: 'fill', kernel: 'lanczos3' });
    }
    return img;
  };

  if (animated) {
    return (webpOptions) => pipeline().webp(webpOptions).toBuffer();
  }

  // Decode, crop and resize once so repeated encodes (target size search) only pay for encoding.
  const { data, info } = await pipeline().raw().toBuffer({ resolveWithObject: true });
  const raw = { width: info.width, height: info.height, channels: info.channels };
  return (webpOptions) => sharp(data, { raw }).webp(webpOptions).toBuffer();
}

// Finds the highest quality (up to opts.quality) whose output fits in opts.targetBytes.
async function encodeToTarget(encode, opts) {
  const cache = new Map();
  const encodeAt = async (q) => {
    if (!cache.has(q)) cache.set(q, await encode({ quality: q }));
    return cache.get(q);
  };

  const top = await encodeAt(opts.quality);
  if (top.length <= opts.targetBytes) {
    return { buffer: top, quality: opts.quality, hitTarget: true };
  }

  let lo = 1;
  let hi = opts.quality - 1;
  let best = null;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const buffer = await encodeAt(mid);
    if (buffer.length <= opts.targetBytes) {
      best = { buffer, quality: mid, hitTarget: true };
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (best) return best;
  return { buffer: await encodeAt(1), quality: 1, hitTarget: false };
}

// Runs the full conversion in memory. Used by batch preview/convert and the crop tab.
async function processImage(filePath, opts) {
  const stats = await fs.stat(filePath);
  const input = await loadInput(filePath, stats);
  const meta = await sharp(input).metadata();
  const size = computeOutputSize(meta, opts);

  const encode = await createEncoder(input, meta, opts, size);

  let buffer;
  let quality = opts.quality;
  let hitTarget = null;
  if (opts.targetBytes) {
    ({ buffer, quality, hitTarget } = await encodeToTarget(encode, opts));
  } else {
    buffer = await encode({ quality });
  }

  return {
    originalSize: stats.size,
    width: size.srcW,
    height: size.srcH,
    outWidth: size.outW,
    outHeight: size.outH,
    enlargeBlocked: size.enlargeBlocked,
    quality,
    hitTarget,
    newSize: buffer.length,
    buffer
  };
}

function outputPathFor(filePath) {
  const parsedPath = path.parse(filePath);
  // Never overwrite a WebP source with its own output.
  const suffix = parsedPath.ext.toLowerCase() === '.webp' ? '-optimized' : '';
  return path.join(parsedPath.dir, `${parsedPath.name}${suffix}.webp`);
}

function toReport(filePath, result) {
  const { buffer, ...rest } = result;
  return { success: true, original: path.basename(filePath), ...rest };
}

// Estimate output sizes without writing anything. A newer request cancels older ones.
let latestPreviewId = 0;
ipcMain.handle('preview-images', async (event, files, options) => {
  const previewId = ++latestPreviewId;
  const opts = normalizeOptions(options);
  const results = [];

  for (const filePath of files) {
    if (previewId !== latestPreviewId) return null;
    try {
      results.push(toReport(filePath, await processImage(filePath, opts)));
    } catch (error) {
      results.push({ success: false, original: path.basename(filePath), error: error.message });
    }
  }

  return previewId === latestPreviewId ? results : null;
});

// Handle file conversion
ipcMain.handle('convert-images', async (event, files, options) => {
  latestPreviewId++;
  const opts = normalizeOptions(options);
  const results = [];

  for (const filePath of files) {
    try {
      const result = await processImage(filePath, opts);
      const report = toReport(filePath, result);

      const outputPath = outputPathFor(filePath);
      await fs.writeFile(outputPath, result.buffer);
      report.output = path.basename(outputPath);

      results.push(report);
    } catch (error) {
      results.push({
        success: false,
        original: path.basename(filePath),
        error: error.message
      });
    }
  }

  return results;
});

// Crop tab: load an image for the crop editor. Returns a downscaled, upright copy for display
// plus the real dimensions, so crop coordinates can be scaled back to full resolution.
const CROP_DISPLAY_MAX = 1600;
ipcMain.handle('crop-load', async (event, filePath) => {
  const stats = await fs.stat(filePath);
  const input = await loadInput(filePath, stats);
  const meta = await sharp(input).metadata();
  const { srcW, srcH } = computeOutputSize(meta, {});

  const display = await sharp(input)
    .rotate()
    .resize({ width: CROP_DISPLAY_MAX, height: CROP_DISPLAY_MAX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 90 })
    .toBuffer({ resolveWithObject: true });

  return {
    path: filePath,
    name: path.basename(filePath),
    originalSize: stats.size,
    width: srcW,
    height: srcH,
    displayWidth: display.info.width,
    displayUrl: `data:image/webp;base64,${display.data.toString('base64')}`
  };
});

// Crop tab: encode the current crop and return the result for the side-by-side preview.
let latestCropPreviewId = 0;
ipcMain.handle('crop-preview', async (event, filePath, options) => {
  const previewId = ++latestCropPreviewId;
  const { buffer, ...report } = await processImage(filePath, normalizeOptions(options));
  if (previewId !== latestCropPreviewId) return null;
  return { ...report, dataUrl: `data:image/webp;base64,${buffer.toString('base64')}` };
});

// Crop tab: encode first so the suggested name can include the final resolution
// (e.g. "Photo-2560x1100.webp"), then ask where to save.
ipcMain.handle('crop-save', async (event, filePath, options) => {
  const { buffer, ...report } = await processImage(filePath, normalizeOptions(options));

  const parsedPath = path.parse(filePath);
  const { canceled, filePath: savePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: path.join(parsedPath.dir, `${parsedPath.name}-${report.outWidth}x${report.outHeight}.webp`),
    filters: [{ name: 'WebP image', extensions: ['webp'] }]
  });
  if (canceled || !savePath) return null;

  await fs.writeFile(savePath, buffer);
  return { ...report, output: path.basename(savePath) };
});

// Handle file selection via dialog
ipcMain.handle('select-files', async (event, multiple = true) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths;
  }
  return [];
});

// Handle folder selection
ipcMain.handle('select-output-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});
