const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  convertImages: (files, quality) => ipcRenderer.invoke('convert-images', files, quality),
  selectFiles: () => ipcRenderer.invoke('select-files'),
  selectOutputFolder: () => ipcRenderer.invoke('select-output-folder'),
  getPathForFile: (file) => webUtils.getPathForFile(file)
});
