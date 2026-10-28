const { WebSocketServer } = require('ws');

const PORT = 48199;
// Only the Peek-a-boo Chrome extension may connect (its ID is pinned by the "key" in its manifest).
const EXTENSION_ORIGIN = 'chrome-extension://joajgeogncflcgoihbcclmkgbfpjdnlh';
// Windows timers here tick in 15.6ms steps (asking for 16ms yields ~31ms; 8ms yields 15.6ms).
// Polling at ~64Hz catches every frame of a 30fps video; the tab answers "same"
// unless there is a new frame, and caps its own rate.
const FRAME_INTERVAL_MS = 8;
const MAX_IN_FLIGHT = 2;        // hides the tab round-trip without letting requests pile up
const FRAME_TIMEOUT_MS = 1000;  // forget requests that never got a reply
const TICK_MS = 1000;           // state refresh + keeps hidden tabs decoding video

// Owns the Chrome tab connections: decides which tab is the source and, while
// streaming, pulls frames from it on a steady clock with bounded backpressure.
function createBridge({ onSource, onFrame, onError }) {
  const clients = new Map(); // ws -> { id, state, playingAt }
  let nextId = 1;
  let active = null;
  let pump = null;
  let inFlight = 0;
  let lastAnswerAt = 0;

  const wss = new WebSocketServer({
    host: '127.0.0.1',
    port: PORT,
    maxPayload: 4 * 1024 * 1024,
    verifyClient: ({ origin }) => origin === EXTENSION_ORIGIN
  });
  wss.on('error', onError);
  wss.on('connection', (ws) => {
    clients.set(ws, { id: nextId++, state: null, playingAt: 0 });
    ws.on('message', (data) => onMessage(ws, data));
    ws.on('close', () => {
      clients.delete(ws);
      setActive(chooseActive());
      publish();
    });
    ws.on('error', () => {});
    publish();
  });

  const ticker = setInterval(() => {
    for (const ws of clients.keys()) ws.send('{"type":"tick"}');
  }, TICK_MS);

  function onMessage(ws, data) {
    const client = clients.get(ws);
    if (!client) return;
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    if (msg.type === 'frame' || msg.type === 'same') {
      if (ws !== active) return;
      if (msg.type === 'frame' && typeof msg.jpeg === 'string') onFrame(Buffer.from(msg.jpeg, 'base64'));
      inFlight = Math.max(0, inFlight - 1);
      lastAnswerAt = Date.now();
    } else if (msg.type === 'state') {
      const playing = !!msg.playing;
      if (playing && !client.state?.playing) client.playingAt = Date.now();
      client.state = {
        playing,
        hasVideo: !!msg.hasVideo,
        artwork: typeof msg.artwork === 'string' && msg.artwork.startsWith('https://') ? msg.artwork : null
      };
      setActive(chooseActive());
      publish();
    }
  }

  // The tab that most recently started playing wins; a paused source stays
  // until another tab starts playing.
  function chooseActive() {
    const known = [...clients].filter(([, c]) => c.state);
    const byRecent = (a, b) => b[1].playingAt - a[1].playingAt;
    const playing = known.filter(([, c]) => c.state.playing).sort(byRecent);
    if (playing.length) return playing[0][0];
    if (active && clients.has(active)) return active;
    return known.sort(byRecent)[0]?.[0] ?? null;
  }

  function setActive(ws) {
    if (ws === active) return;
    active = ws;
    if (pump) requestFrame(true);
  }

  function publish() {
    const client = active && clients.get(active);
    onSource({
      connected: clients.size > 0,
      source: client?.state ? { id: client.id, ...client.state } : null
    });
  }

  // `first` restarts the window: the tab answers with a picture even if paused.
  function requestFrame(first) {
    if (first) {
      inFlight = 0;
      lastAnswerAt = Date.now();
    }
    if (!active) return;
    inFlight++;
    active.send(JSON.stringify({ type: 'capture', first }));
  }

  function pumpTick() {
    if (Date.now() - lastAnswerAt > FRAME_TIMEOUT_MS) requestFrame(true);
    else if (inFlight < MAX_IN_FLIGHT) requestFrame(false);
  }

  function stopPump() {
    clearInterval(pump);
    pump = null;
  }

  return {
    setStreaming(on) {
      stopPump();
      if (!on) return;
      requestFrame(true);
      pump = setInterval(pumpTick, FRAME_INTERVAL_MS);
    },
    close() {
      clearInterval(ticker);
      stopPump();
      wss.close();
      for (const ws of clients.keys()) ws.terminate();
    }
  };
}

module.exports = { createBridge, PORT };
