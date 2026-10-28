const { app, BrowserWindow, Tray, Menu, nativeImage, screen } = require('electron');
const path = require('path');
const { createBridge, PORT } = require('./bridge');

app.setName('Peek-a-boo');
app.setAppUserModelId('Peek-a-boo');

// Layout in DIPs. The window never resizes: the island animates inside it, and
// the window ignores the mouse while collapsed so it never blocks clicks.
const TOP_GAP = 6;      // space between screen top (camera) and the island
const MARGIN = 32;      // room for the card's shadow
const PILL = { w: 74, h: 26 };
const CARD = { w: 560, h: 322 };
const WIN = { w: CARD.w + 2 * MARGIN, h: TOP_GAP + CARD.h + MARGIN };
const HIT_SLOP = 10;

// Hover zones in window coordinates. Both start at y=0 so flicking the cursor
// to the top edge of the screen counts.
const PILL_HIT = {
  x: (WIN.w - PILL.w) / 2 - HIT_SLOP, y: 0,
  w: PILL.w + 2 * HIT_SLOP, h: TOP_GAP + PILL.h + HIT_SLOP
};
const CARD_HIT = { x: (WIN.w - CARD.w) / 2, y: 0, w: CARD.w, h: TOP_GAP + CARD.h };

const HOVER_POLL_MS = 30;
const EXPAND_DELAY_MS = 110;   // brief intent check so passing cursors don't trigger it
const COLLAPSE_DELAY_MS = 260; // grace period if the cursor slips off the card

const LOGIN_ITEM = app.isPackaged ? {} : { path: process.execPath, args: [app.getAppPath()] };

let win = null;
let tray = null;
let bridge = null;
let expanded = false;
let lastStatus = { connected: false, source: null };

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(start);
}

function start() {
  createWindow();
  createTray();
  bridge = createBridge({
    onSource: (status) => {
      lastStatus = status;
      send('peek:status', status);
      updateTray();
    },
    onFrame: (jpeg) => send('peek:frame', jpeg),
    onError: (err) => {
      const msg = err.code === 'EADDRINUSE' ? `port ${PORT} is already in use` : err.message;
      console.error('Bridge error:', msg);
      tray?.setToolTip(`Peek-a-boo: can't listen for Chrome (${msg})`);
    }
  });

  setInterval(trackHover, HOVER_POLL_MS);
  for (const evt of ['display-added', 'display-removed', 'display-metrics-changed']) {
    screen.on(evt, placeWindow);
  }
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function windowBounds() {
  const { bounds } = screen.getPrimaryDisplay();
  return {
    x: bounds.x + Math.round((bounds.width - WIN.w) / 2),
    y: bounds.y,
    width: WIN.w,
    height: WIN.h
  };
}

function placeWindow() {
  if (win && !win.isDestroyed()) win.setBounds(windowBounds());
}

function createWindow() {
  win = new BrowserWindow({
    ...windowBounds(),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      additionalArguments: [`--peek-layout=${JSON.stringify({ TOP_GAP, PILL, CARD })}`]
    }
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true);
  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', () => win.showInactive());

  const contents = win.webContents;
  contents.on('did-finish-load', () => {
    send('peek:status', lastStatus);
    send('peek:expanded', expanded);
  });
  contents.on('render-process-gone', () => contents.reload());
  contents.on('will-navigate', (e) => e.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

// Polling the cursor is immune to the focus and click-through quirks of
// transparent windows, and costs one cheap call per tick.
let zoneChangedAt = 0;
let wasInside = false;

function trackHover() {
  if (!win || win.isDestroyed()) return;
  const cursor = screen.getCursorScreenPoint();
  const b = win.getBounds();
  const zone = expanded ? CARD_HIT : PILL_HIT;
  const x = cursor.x - b.x;
  const y = cursor.y - b.y;
  const inside = x >= zone.x && x < zone.x + zone.w && y >= zone.y && y < zone.y + zone.h;

  const now = Date.now();
  if (inside !== wasInside) {
    wasInside = inside;
    zoneChangedAt = now;
  }
  const held = now - zoneChangedAt;
  if (!expanded && inside && held >= EXPAND_DELAY_MS) setExpanded(true);
  else if (expanded && !inside && held >= COLLAPSE_DELAY_MS) setExpanded(false);
}

function setExpanded(on) {
  expanded = on;
  // The hover zone just changed size; restart intent timing from here.
  wasInside = on;
  zoneChangedAt = Date.now();
  // While open, swallow clicks so they don't land on whatever is underneath.
  win.setIgnoreMouseEvents(!on);
  if (on) win.moveTop();
  bridge?.setStreaming(on);
  send('peek:expanded', on);
}

// A soft mint dot with a glow, drawn in code so there is no asset to go missing.
function dotIcon() {
  const image = nativeImage.createEmpty();
  for (const scale of [1, 2]) {
    const size = 16 * scale;
    const buf = Buffer.alloc(size * size * 4);
    const c = (size - 1) / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x - c, y - c) / (size / 2);
        const core = Math.min(1, Math.max(0, (0.42 - d) * 8 + 1));
        const glow = Math.max(0, 1 - d) ** 2 * 0.55;
        const a = Math.min(1, core + glow * (1 - core));
        const i = (y * size + x) * 4; // BGRA, premultiplied
        buf[i] = Math.round(0xb2 * a);
        buf[i + 1] = Math.round(0xff * a);
        buf[i + 2] = Math.round(0x7c * a);
        buf[i + 3] = Math.round(255 * a);
      }
    }
    image.addRepresentation({ scaleFactor: scale, width: size, height: size, buffer: buf });
  }
  return image;
}

function createTray() {
  tray = new Tray(dotIcon());
  updateTray();
}

function updateTray() {
  if (!tray) return;
  const { connected, source } = lastStatus;
  const status = !connected ? 'Waiting for YouTube in Chrome'
    : !source ? 'Chrome connected'
    : source.playing ? 'Mirroring YouTube' : 'YouTube paused';
  tray.setToolTip(`Peek-a-boo: ${status}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: status, enabled: false },
    { type: 'separator' },
    {
      label: 'Start with Windows',
      type: 'checkbox',
      checked: app.getLoginItemSettings(LOGIN_ITEM).openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked, ...LOGIN_ITEM })
    },
    { label: 'Quit Peek-a-boo', click: () => app.quit() }
  ]));
}

app.on('before-quit', () => bridge?.close());
