
// Preload: expose a stable electronAPI with getSources + server controls.
// Works even if desktopCapturer isn't available (renderer will fallback).

const { contextBridge, ipcRenderer } = require('electron');
let desktopCapturer = null;
try {
  desktopCapturer = require('electron').desktopCapturer;
} catch (e) {
  // leave null; renderer will fallback
}

contextBridge.exposeInMainWorld('electronAPI', {
  startServer: (params) => ipcRenderer.invoke('start-server', params),
  stopServer: () => ipcRenderer.invoke('stop-server'),
  getSources: async (opts) => {
    if (!desktopCapturer || !desktopCapturer.getSources) {
      return null; // signal renderer to fallback
    }
    const sources = await desktopCapturer.getSources(opts || { types: ['screen', 'window'] });
    return sources.map(s => ({
      id: s.id,
      name: s.name,
      thumbnail: (s.thumbnail && s.thumbnail.toDataURL) ? s.thumbnail.toDataURL() : null
    }));
  }
});
