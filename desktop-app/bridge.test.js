const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const WebSocket = require('ws');
const { createBridge } = require('./bridge');

const TEST_PORT = 48299; // the real app may be running on 48199

// Derive the extension's origin from its manifest key, so this also fails if
// the manifest and bridge.js stop agreeing on which extension may connect.
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../chrome-bridge/manifest.json'), 'utf8'));
const extensionId = [...crypto.createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex').slice(0, 32)]
  .map((h) => String.fromCharCode(97 + parseInt(h, 16))).join('');
const ORIGIN = `chrome-extension://${extensionId}`;

function startBridge() {
  const seen = { status: null, frames: [] };
  const bridge = createBridge({
    port: TEST_PORT,
    onSource: (s) => { seen.status = s; },
    onFrame: (f) => seen.frames.push(f.toString()),
    onError: (e) => { throw e; }
  });
  return { bridge, seen };
}

// A fake tab: answers every capture request with a frame carrying its name.
function connectTab(name, origin = ORIGIN) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`, { origin });
    ws.captures = 0;
    ws.on('message', (data) => {
      if (JSON.parse(data).type !== 'capture') return;
      ws.captures++;
      ws.send(JSON.stringify({ type: 'frame', jpeg: Buffer.from(name).toString('base64') }));
    });
    ws.on('open', () => resolve(ws));
    ws.on('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
    ws.on('error', reject);
  });
}

const sendState = (ws, playing) => ws.send(JSON.stringify({ type: 'state', playing, hasVideo: true, artwork: null }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(check) {
  for (let i = 0; i < 200; i++) {
    if (check()) return;
    await sleep(10);
  }
  assert.fail('condition not reached');
}

test('only the Peek-a-boo extension may connect', async () => {
  const { bridge } = startBridge();
  try {
    await assert.rejects(connectTab('site', 'https://www.youtube.com'), /HTTP 401/);
    await assert.rejects(connectTab('other', 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), /HTTP 401/);
    (await connectTab('ext')).close();
  } finally {
    bridge.close();
  }
});

test('the most recently started tab is the source; paused tabs never steal it', async () => {
  const { bridge, seen } = startBridge();
  try {
    const a = await connectTab('A');
    sendState(a, true);
    await until(() => seen.status?.source?.playing);
    const idA = seen.status.source.id;

    const b = await connectTab('B');
    sendState(b, false);
    await sleep(50);
    assert.strictEqual(seen.status.source.id, idA, 'paused B must not take over');

    sendState(b, true);
    await until(() => seen.status.source.id !== idA);
    const idB = seen.status.source.id;

    sendState(b, false);
    await until(() => seen.status.source.id === idA);

    sendState(a, false);
    await sleep(50);
    assert.strictEqual(seen.status.source.id, idA, 'with everything paused the last source stays');
    assert.strictEqual(seen.status.source.playing, false);

    sendState(b, true);
    await until(() => seen.status.source.id === idB);
    b.close();
    await until(() => seen.status.source.id === idA);
    a.close();
    await until(() => seen.status.connected === false && seen.status.source === null);
  } finally {
    bridge.close();
  }
});

test('frames are pulled only from the source tab, and only while streaming', async () => {
  const { bridge, seen } = startBridge();
  try {
    const a = await connectTab('A');
    const b = await connectTab('B');
    sendState(a, true);
    await until(() => seen.status?.source);

    bridge.setStreaming(true);
    await until(() => seen.frames.length >= 5);
    bridge.setStreaming(false);
    await sleep(100); // let in-flight replies land
    const count = seen.frames.length;
    await sleep(200);

    assert.strictEqual(seen.frames.length, count, 'no frames after streaming stops');
    assert.deepStrictEqual([...new Set(seen.frames)], ['A']);
    assert.strictEqual(b.captures, 0);
    a.close();
    b.close();
  } finally {
    bridge.close();
  }
});
