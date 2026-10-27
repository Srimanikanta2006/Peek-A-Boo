const { ipcRenderer } = require('electron');

// DOM Elements
const island = document.getElementById('island');
const syncDot = document.getElementById('sync-dot');
const equalizer = document.getElementById('equalizer');
const pillTitle = document.getElementById('pill-title');
const cardTitle = document.getElementById('card-title');
const statusBadge = document.getElementById('status-badge');
const emptyState = document.getElementById('empty-state');
const progressBar = document.getElementById('progress-bar');
const currTimeEl = document.getElementById('curr-time');
const totalTimeEl = document.getElementById('total-time');
const btnSound = document.getElementById('btn-sound-toggle');
const iconMuted = document.getElementById('icon-muted');
const iconUnmuted = document.getElementById('icon-unmuted');
const ytWebview = document.getElementById('yt-webview');

let currentVideoId = null;
let collapseTimer = null;
let isNotchMuted = true;
let isExpanded = false;
let isWebviewReady = false;

// Format seconds into m:ss
function formatTime(seconds) {
  if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// CSS injected into YouTube page to strip all clutter and show only video
const CLEAN_YOUTUBE_CSS = `
  #masthead-container, ytd-masthead, #secondary, #below, #related, #comments,
  .ytp-chrome-top, .ytp-chrome-bottom, .ytp-gradient-bottom, .ytp-gradient-top,
  .ytp-ce-element, #player-ads, .video-ads, ytd-banner-promo-renderer,
  ytd-playlist-panel-renderer, #chat, tp-yt-app-drawer, ytd-guide-renderer,
  ytd-watch-next-secondary-results-renderer, #chips-wrapper, .ytp-pause-overlay {
    display: none !important;
    visibility: hidden !important;
  }
  html, body {
    overflow: hidden !important;
    background: #000000 !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  #player-container-outer, #player-container-inner, #player-container, #player,
  #movie_player, .html5-video-player, video {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    z-index: 2147483647 !important;
    object-fit: contain !important;
  }
`;

// Setup webview listener
ytWebview.addEventListener('dom-ready', () => {
  isWebviewReady = true;
  ytWebview.insertCSS(CLEAN_YOUTUBE_CSS);
  ytWebview.setAudioMuted(isNotchMuted);
});

// ==========================================================
// 1. DYNAMIC ISLAND HOVER & GRACE DELAY
// ==========================================================
island.addEventListener('mouseenter', () => {
  if (collapseTimer) {
    clearTimeout(collapseTimer);
    collapseTimer = null;
  }

  if (!isExpanded) {
    isExpanded = true;
    ipcRenderer.send('expand-window');
    island.classList.remove('island-collapsed');
    island.classList.add('island-expanded');
  }
});

island.addEventListener('mouseleave', () => {
  // 350ms Grace Period: prevents accidental collapse if mouse slips slightly
  collapseTimer = setTimeout(() => {
    isExpanded = false;
    island.classList.remove('island-expanded');
    island.classList.add('island-collapsed');

    // Wait for CSS spring animation before resizing window bounds back to pill
    setTimeout(() => {
      if (!isExpanded) {
        ipcRenderer.send('collapse-window');
      }
    }, 320);
  }, 350);
});

// Sound Toggle (Muted by default to avoid double audio with Chrome)
btnSound.addEventListener('click', (e) => {
  e.stopPropagation();
  isNotchMuted = !isNotchMuted;
  ytWebview.setAudioMuted(isNotchMuted);

  if (isNotchMuted) {
    iconMuted.classList.remove('hidden');
    iconUnmuted.classList.add('hidden');
  } else {
    iconMuted.classList.add('hidden');
    iconUnmuted.classList.remove('hidden');
  }
});

// ==========================================================
// 2. SYNCHRONIZATION WITH CHROME EXTENSION
// ==========================================================
ipcRenderer.on('chrome-status', (event, { connected }) => {
  if (connected) {
    syncDot.className = 'sync-dot connected';
    statusBadge.textContent = 'Chrome Connected';
    statusBadge.className = 'badge badge-connected';
  } else {
    syncDot.className = 'sync-dot disconnected';
    statusBadge.textContent = 'Chrome Disconnected';
    statusBadge.className = 'badge badge-waiting';
    equalizer.classList.remove('playing');
  }
});

ipcRenderer.on('yt-sync', (event, data) => {
  if (!data || !data.videoId) return;

  // 1. Update Video Titles
  if (data.title) {
    pillTitle.textContent = data.title;
    cardTitle.textContent = data.title;
  }

  // 2. Handle Video Switch
  if (data.videoId !== currentVideoId) {
    currentVideoId = data.videoId;
    emptyState.classList.add('hidden-empty');
    isWebviewReady = false;

    // Load full watch URL to completely bypass Error 150/152/153
    const targetUrl = `https://www.youtube.com/watch?v=${data.videoId}&t=${Math.floor(data.currentTime || 0)}s`;
    ytWebview.loadURL(targetUrl);
  }

  // 3. Sync Play / Pause / Time State in Native Webview
  if (isWebviewReady) {
    const jsSync = `
      (() => {
        const v = document.querySelector('video');
        if (!v) return;
        if (Math.abs(v.currentTime - ${data.currentTime}) > 1.2) {
          v.currentTime = ${data.currentTime};
        }
        if (${data.isPaused}) {
          if (!v.paused) v.pause();
        } else {
          if (v.paused) v.play().catch(()=>{});
        }
      })();
    `;
    ytWebview.executeJavaScript(jsSync).catch(() => {});
  }

  // 4. Equalizer Animation
  if (data.isPaused) {
    equalizer.classList.remove('playing');
  } else {
    equalizer.classList.add('playing');
  }

  // 5. Update Progress Bar & Timestamps
  if (data.duration && data.duration > 0) {
    const percent = Math.min(100, Math.max(0, (data.currentTime / data.duration) * 100));
    progressBar.style.width = `${percent}%`;
    currTimeEl.textContent = formatTime(data.currentTime);
    totalTimeEl.textContent = formatTime(data.duration);
  }
});
