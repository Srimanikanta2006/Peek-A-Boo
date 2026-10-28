const { contextBridge, ipcRenderer } = require('electron');

const LAYOUT_ARG = '--peek-layout=';
const layout = JSON.parse(process.argv.find((a) => a.startsWith(LAYOUT_ARG)).slice(LAYOUT_ARG.length));

contextBridge.exposeInMainWorld('peek', {
  layout,
  onExpanded: (cb) => ipcRenderer.on('peek:expanded', (_e, on) => cb(on)),
  onStatus: (cb) => ipcRenderer.on('peek:status', (_e, status) => cb(status)),
  onFrame: (cb) => ipcRenderer.on('peek:frame', (_e, jpeg) => cb(jpeg))
});
