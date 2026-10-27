// Peek Island - YouTube Content Script Bridge
(() => {
  const WS_URL = 'ws://127.0.0.1:48199';
  let socket = null;
  let isConnected = false;
  let lastSyncTime = 0;
  let lastVideoId = null;
  let currentVideoElement = null;

  console.log('%c[Peek Island]%c Extension loaded on YouTube', 'color: #38bdf8; font-weight: bold;', 'color: inherit;');

  // Extract YouTube Video ID from current URL
  function getVideoId() {
    try {
      const url = new URL(window.location.href);
      if (url.pathname === '/watch') {
        return url.searchParams.get('v');
      } else if (url.pathname.startsWith('/shorts/')) {
        return url.pathname.split('/')[2];
      }
    } catch (e) {}
    return null;
  }

  // Extract clean video title
  function getVideoTitle() {
    const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, #title h1 yt-formatted-string, h1.title');
    if (titleEl && titleEl.textContent.trim()) {
      return titleEl.textContent.trim();
    }
    return document.title.replace(/ - YouTube$/, '').trim();
  }

  // Connect to the local Peek Island desktop application
  function connectWebSocket() {
    if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
      return;
    }

    try {
      socket = new WebSocket(WS_URL);

      socket.onopen = () => {
        isConnected = true;
        console.log('%c[Peek Island]%c Connected to Desktop Notch! 🏝️', 'color: #4ade80; font-weight: bold;', 'color: inherit;');
        sendCurrentState(true);
      };

      socket.onclose = () => {
        isConnected = false;
        socket = null;
        setTimeout(connectWebSocket, 3000);
      };

      socket.onerror = () => {
        if (isConnected) {
          isConnected = false;
        }
      };
    } catch (err) {
      setTimeout(connectWebSocket, 3000);
    }
  }

  // Send current playback state to desktop app
  function sendCurrentState(force = false) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    const videoId = getVideoId();
    if (!videoId) return;

    const video = currentVideoElement || document.querySelector('video');
    if (!video) return;

    const now = Date.now();
    // Throttle routine timeupdates to every 1200ms unless forced (e.g. play/pause/seek)
    if (!force && now - lastSyncTime < 1200) return;
    lastSyncTime = now;

    const isAd = !!document.querySelector('.ad-showing, .ad-interrupting');

    const payload = {
      type: 'YOUTUBE_STATE',
      videoId: videoId,
      title: getVideoTitle(),
      currentTime: video.currentTime || 0,
      duration: video.duration || 0,
      isPaused: video.paused,
      isAd: isAd,
      timestamp: now
    };

    try {
      socket.send(JSON.stringify(payload));
    } catch (e) {}
  }

  // Attach event listeners to the video element
  function hookVideoElement() {
    const video = document.querySelector('video');
    if (!video || video === currentVideoElement) return;

    currentVideoElement = video;

    const events = ['play', 'pause', 'seeked', 'ratechange', 'playing'];
    events.forEach(evt => {
      video.addEventListener(evt, () => sendCurrentState(true), { passive: true });
    });

    video.addEventListener('timeupdate', () => sendCurrentState(false), { passive: true });
    sendCurrentState(true);
  }

  // Observe DOM for YouTube SPA navigation and video element replacement
  const observer = new MutationObserver(() => {
    hookVideoElement();
    const currentId = getVideoId();
    if (currentId && currentId !== lastVideoId) {
      lastVideoId = currentId;
      sendCurrentState(true);
    }
  });

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true
  });

  // YouTube navigation custom events
  window.addEventListener('yt-navigate-finish', () => {
    lastVideoId = getVideoId();
    setTimeout(() => {
      hookVideoElement();
      sendCurrentState(true);
    }, 400);
  });

  // Start connection
  connectWebSocket();
  hookVideoElement();
})();
