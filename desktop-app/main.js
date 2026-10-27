const { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage, session } = require('electron');
const { WebSocketServer } = require('ws');
const path = require('path');

app.name = 'Peek-a-boo';
app.setPath('userData', path.join(app.getPath('appData'), 'peek-a-boo-data'));

let win = null;
let tray = null;
let wss = null;

const COLLAPSED_W = 240;
const COLLAPSED_H = 42;
const EXPANDED_W = 600;
const EXPANDED_H = 390;
const TOP_OFFSET = 0;

function createTrayIcon() {
  const iconBase64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAExJREFUOE9jZKAQMFKon2H4f+p/JroZ8N//f4QcBhQxGIZB4zCg+IAGiDEh84d6A4bdAxozAMyGf3//E3IEkgH//iNiwK0Bw94DANp/X2O46vD9AAAAAElFTkSuQmCC';
  return nativeImage.createFromDataURL(`data:image/png;base64,${iconBase64}`);
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, x: displayX, y: displayY } = primaryDisplay.bounds;

  const startX = displayX + Math.round((screenWidth - COLLAPSED_W) / 2);
  const startY = displayY + TOP_OFFSET;

  win = new BrowserWindow({
    width: COLLAPSED_W,
    height: COLLAPSED_H,
    x: startX,
    y: startY,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    show: true,
    webPreferences: {
      webviewTag: true, // Native full Chromium webview
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    }
  });

  win.setAlwaysOnTop(true);

  win.loadFile(path.join(__dirname, 'index.html'));

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  // Expand bounds when hovered
  ipcMain.on('expand-window', () => {
    if (!win || win.isDestroyed()) return;
    const { width: curW, x: curX, y: curY } = screen.getPrimaryDisplay().bounds;
    const x = curX + Math.round((curW - EXPANDED_W) / 2);
    win.setBounds({ x, y: curY + TOP_OFFSET, width: EXPANDED_W, height: EXPANDED_H });
  });

  // Collapse bounds when mouse leaves
  ipcMain.on('collapse-window', () => {
    if (!win || win.isDestroyed()) return;
    const { width: curW, x: curX, y: curY } = screen.getPrimaryDisplay().bounds;
    const x = curX + Math.round((curW - COLLAPSED_W) / 2);
    win.setBounds({ x, y: curY + TOP_OFFSET, width: COLLAPSED_W, height: COLLAPSED_H });
  });

  ipcMain.on('close-app', () => {
    app.quit();
  });

  setupTray();
  startWebSocketServer();
}

function setupTray() {
  try {
    const icon = createTrayIcon();
    tray = new Tray(icon);
    tray.setToolTip('Peek-a-boo: YouTube Desktop Notch');

    const updateMenu = () => {
      const isAutoStart = app.getLoginItemSettings().openAtLogin;
      const contextMenu = Menu.buildFromTemplate([
        { label: 'Peek-a-boo: Active', enabled: false },
        { type: 'separator' },
        {
          label: 'Re-center Under Camera',
          click: () => {
            if (win && !win.isDestroyed()) {
              const { width: curW, x: curX, y: curY } = screen.getPrimaryDisplay().bounds;
              win.setBounds({
                x: curX + Math.round((curW - COLLAPSED_W) / 2),
                y: curY + TOP_OFFSET,
                width: COLLAPSED_W,
                height: COLLAPSED_H
              });
              win.show();
            }
          }
        },
        {
          label: 'Start on Windows Boot',
          type: 'checkbox',
          checked: isAutoStart,
          click: (menuItem) => {
            app.setLoginItemSettings({
              openAtLogin: menuItem.checked,
              path: app.getPath('exe')
            });
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          click: () => {
            app.quit();
          }
        }
      ]);
      tray.setContextMenu(contextMenu);
    };

    updateMenu();
  } catch (err) {
    console.error('Tray notice:', err.message);
  }
}

function startWebSocketServer() {
  try {
    wss = new WebSocketServer({ port: 48199 });

    wss.on('connection', (ws) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('chrome-status', { connected: true });
      }

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          if (win && !win.isDestroyed()) {
            win.webContents.send('yt-sync', data);
          }
        } catch (e) {}
      });

      ws.on('close', () => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('chrome-status', { connected: false });
        }
      });
    });

    wss.on('error', (err) => {
      console.error('WebSocket server error:', err.message);
    });
  } catch (err) {
    console.error('WebSocket error:', err.message);
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (wss) wss.close();
    app.quit();
  }
});
