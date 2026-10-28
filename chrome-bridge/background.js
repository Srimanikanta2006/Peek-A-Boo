// Relays each YouTube tab to the Peek-a-boo app over its own local WebSocket.
// The connection lives here, not in the tab, because Chrome blocks websites from
// reaching 127.0.0.1 without a permission prompt; extensions with host
// permission are allowed. App messages also keep this worker alive.
const APP_URL = 'ws://127.0.0.1:48199';
const RETRY_MS = 2000;

// Chrome only injects content scripts into pages loaded after install, so on
// install/reload/update add content.js to YouTube tabs that are already open.
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: ['https://www.youtube.com/*', 'https://music.youtube.com/*'] });
  for (const tab of tabs) {
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }).catch(() => {});
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'peek') return;
  let ws = null;
  let retry = null;
  let done = false;

  function open() {
    const socket = new WebSocket(APP_URL);
    ws = socket;
    socket.onopen = () => port.postMessage({ type: 'connected' });
    socket.onmessage = (e) => {
      try { port.postMessage(JSON.parse(e.data)); } catch {}
    };
    socket.onclose = () => {
      if (ws !== socket) return;
      ws = null;
      if (done) return;
      port.postMessage({ type: 'disconnected' });
      retry = setTimeout(open, RETRY_MS);
    };
  }

  port.onMessage.addListener((msg) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  });
  port.onDisconnect.addListener(() => {
    done = true;
    clearTimeout(retry);
    ws?.close();
  });

  open();
});
