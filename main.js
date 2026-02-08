const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const sharp = require('sharp');
const heicConvert = require('heic-convert');
const fs = require('fs').promises;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 800,
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

// Handle file conversion
ipcMain.handle('convert-images', async (event, files, quality) => {
  const results = [];
  
  for (const filePath of files) {
    try {
      const originalStats = await fs.stat(filePath);
      const originalSize = originalStats.size;
      
      const parsedPath = path.parse(filePath);
      const outputPath = path.join(parsedPath.dir, `${parsedPath.name}.webp`);
      const ext = parsedPath.ext.toLowerCase();

      let inputBuffer;
      if (ext === '.heic' || ext === '.heif') {
        const heicBuffer = await fs.readFile(filePath);
        const outputBuffer = await heicConvert({
          buffer: heicBuffer,
          format: 'PNG'
        });
        inputBuffer = Buffer.from(outputBuffer);
      }

      const sharpInput = inputBuffer || filePath;
      await sharp(sharpInput)
        .webp({ quality: parseInt(quality) })
        .toFile(outputPath);
      
      const newStats = await fs.stat(outputPath);
      const newSize = newStats.size;
      const savings = ((originalSize - newSize) / originalSize * 100).toFixed(1);
      
      results.push({
        success: true,
        original: path.basename(filePath),
        output: path.basename(outputPath),
        originalSize: formatBytes(originalSize),
        newSize: formatBytes(newSize),
        savings: savings
      });
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

// Handle file selection via dialog
ipcMain.handle('select-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'heic', 'heif'] }
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

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
