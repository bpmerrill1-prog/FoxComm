
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
let serverProc = null;

function createWindow () {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    backgroundColor: '#0d0d10',
    title: 'FoxComm',
    icon: path.join(__dirname, 'foxcomm_icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  win.setMenuBarVisibility(false);
  win.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('start-server', async (event, { port, room }) => {
  if (serverProc) return { success: false, message: 'Server already running' };
  const serverPath = path.join(__dirname, 'signaling_server.js');
  serverProc = spawn(process.execPath, [serverPath, String(port)], { stdio: 'ignore', detached: true });
  serverProc.unref();
  return { success: true };
});

ipcMain.handle('stop-server', async () => {
  if (!serverProc) return { success: false, message: 'Not running' };
  try { process.kill(serverProc.pid); } catch (e) {}
  serverProc = null;
  return { success: true };
});
