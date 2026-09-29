const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  convertImages: (files, options) => ipcRenderer.invoke('convert-images', files, options),
  previewImages: (files, options) => ipcRenderer.invoke('preview-images', files, options),
  cropLoad: (filePath) => ipcRenderer.invoke('crop-load', filePath),
  cropPreview: (filePath, options) => ipcRenderer.invoke('crop-preview', filePath, options),
  cropSave: (filePath, options) => ipcRenderer.invoke('crop-save', filePath, options),
  selectFiles: (multiple = true) => ipcRenderer.invoke('select-files', multiple),
  selectOutputFolder: () => ipcRenderer.invoke('select-output-folder'),
  getPathForFile: (file) => webUtils.getPathForFile(file)
});
