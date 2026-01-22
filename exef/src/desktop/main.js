const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs')
const dotenv = require('dotenv')

if (!process.env.EXEF_ENV_FILE && process.env.NODE_ENV === 'test') {
  try {
    if (!fs.existsSync('.env') && fs.existsSync('.env.test')) {
      fs.copyFileSync('.env.test', '.env')
    }
  } catch (_e) {
  }
}

const envFile = process.env.EXEF_ENV_FILE || (
  process.env.NODE_ENV === 'test' && fs.existsSync('.env.test') ? '.env.test' : null
)
dotenv.config(envFile ? { path: envFile } : {})

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
