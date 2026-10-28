// Peek-a-boo bridge (YouTube tab side): reports playback state to the desktop
// island and answers its capture requests with JPEGs of the real <video> pixels.
// Talks to the app through background.js.
//
// All pacing comes from the app's messages, not page timers: background tabs
// throttle timers, but extension messages are delivered promptly.
(() => {
  // background.js also injects this into tabs open at install/reload time; run
  // once per tab unless the earlier copy belongs to a since-reloaded extension.
  if (window.__peekBridgeLive?.()) return;
  window.__peekBridgeLive = () => !!chrome.runtime?.id;

  const RECONNECT_MS = 2000;
  const MAX_W = 960, MAX_H = 540;  // enough for the card at 150% display scaling
  const JPEG_QUALITY = 0.82;
  const MIN_FRAME_GAP_MS = 30;     // ~33 fps cap keeps YouTube's own tab smooth

  let port = null;
  let appConnected = false;
  let lastFrameTime = -1;
  let lastEncodeAt = 0;
  let lastStateJson = '';
  let hookedVideo = null;

  // A plain canvas so toDataURL can encode synchronously: async encoders
  // (convertToBlob/toBlob) wait for idle time, which hidden tabs only get once a second.
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const probe = new OffscreenCanvas(1, 1).getContext('2d');

  // The main player (YouTube and YouTube Music); the miniplayer reuses it.
  // Feed hover-previews live in a different player and are ignored.
  function getVideo() {
    return document.querySelector('#movie_player video');
  }

  function hasFrames(video) {
    return !!video && video.videoWidth > 0 && video.readyState >= 2;
  }

  function post(msg) {
    if (!appConnected) return;
    try { port.postMessage(msg); } catch {}
  }

  function artworkUrl() {
    const art = navigator.mediaSession?.metadata?.artwork;
    return art?.length ? art[art.length - 1].src : null;
  }

  function sendState() {
    const video = getVideo();
    const frames = hasFrames(video);
    const state = {
      type: 'state',
      playing: !!video && !video.paused && !video.ended,
      hasVideo: frames,
      artwork: frames ? null : artworkUrl()
    };
    const json = JSON.stringify(state);
    if (!appConnected || json === lastStateJson) return;
    lastStateJson = json;
    post(state);
  }

  // Chrome stops decoding video in a hidden tab 10s after it is hidden, unless a
  // frame was read within the previous 5s (WebMediaPlayerImpl::IsVideoBeingCaptured).
  // Reading one pixel per tick keeps the picture live so a peek is instant.
  function keepDecoderAwake() {
    const video = getVideo();
    if (document.hidden && hasFrames(video) && !video.paused) probe.drawImage(video, 0, 0, 1, 1);
  }

  function sendFrame() {
    const video = getVideo();
    // Unchanged picture (paused) or too soon: tell the app so it keeps polling.
    const now = performance.now();
    if (!hasFrames(video) || video.currentTime === lastFrameTime || now - lastEncodeAt < MIN_FRAME_GAP_MS) {
      post({ type: 'same' });
      return;
    }
    lastEncodeAt = now;
    try {
      const scale = Math.min(1, MAX_W / video.videoWidth, MAX_H / video.videoHeight);
      const w = Math.round(video.videoWidth * scale);
      const h = Math.round(video.videoHeight * scale);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.drawImage(video, 0, 0, w, h);
      lastFrameTime = video.currentTime;
      const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
      post({ type: 'frame', jpeg: dataUrl.slice(dataUrl.indexOf(',') + 1) });
    } catch (err) {
      console.warn('[Peek-a-boo] frame capture failed:', err);
      post({ type: 'same' });
    }
  }

  function onMessage(msg) {
    switch (msg.type) {
      case 'connected':
        appConnected = true;
        lastStateJson = '';
        sendState();
        break;
      case 'disconnected':
        appConnected = false;
        break;
      case 'capture':
        // A fresh stream must always start with a picture, even when paused.
        if (msg.first) lastFrameTime = lastEncodeAt = -Infinity;
        sendFrame();
        break;
      case 'tick':
        sendState();
        keepDecoderAwake();
        break;
    }
  }

  function connect() {
    try {
      port = chrome.runtime.connect({ name: 'peek' });
    } catch {
      return; // extension was reloaded or removed; this copy of the script is orphaned
    }
    port.onMessage.addListener(onMessage);
    // The worker restarts or the extension reloads: reconnect.
    port.onDisconnect.addListener(() => {
      port = null;
      appConnected = false;
      setTimeout(connect, RECONNECT_MS);
    });
  }

  function hookVideo() {
    const video = getVideo();
    if (!video || video === hookedVideo) return;
    hookedVideo = video;
    for (const evt of ['play', 'playing', 'pause', 'ended', 'loadeddata', 'emptied']) {
      video.addEventListener(evt, sendState, { passive: true });
    }
    sendState();
  }

  // YouTube is a SPA that swaps the player in and out; keep hooking whatever is current.
  new MutationObserver(hookVideo).observe(document.documentElement, { childList: true, subtree: true });

  connect();
  hookVideo();
})();
