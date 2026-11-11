// Runs content.js in a fake YouTube tab: no Chrome needed.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'content.js'), 'utf8');

function fakeVideo(over) {
  const hooked = [];
  return {
    videoWidth: 1280, videoHeight: 720, readyState: 4,
    paused: true, ended: false, currentTime: 5,
    hooked,
    addEventListener: (evt) => hooked.push(evt),
    ...over
  };
}

function fakeTab(video) {
  const posted = [];
  let listener = null;
  const tab = { video };
  const canvas = {
    width: 0, height: 0,
    getContext: () => ({ drawImage() {} }),
    toDataURL: () => 'data:image/jpeg;base64,QUJD'
  };
  const context = {
    console,
    setTimeout,
    performance,
    navigator: {},
    OffscreenCanvas: class { getContext() { return { drawImage() {} }; } },
    document: {
      hidden: false,
      createElement: () => canvas,
      querySelector: () => tab.video
    },
    chrome: {
      runtime: {
        id: 'test',
        connect: () => ({
          postMessage: (m) => posted.push(JSON.parse(JSON.stringify(m))), // like Chrome, which copies messages
          onMessage: { addListener: (fn) => { listener = fn; } },
          onDisconnect: { addListener() {} }
        })
      }
    }
  };
  context.window = context;
  vm.runInNewContext(source, context);
  tab.send = (msg) => listener(msg);
  tab.posted = posted;
  tab.last = () => posted[posted.length - 1].type;
  return tab;
}

test('a fresh stream always starts with a picture, even when paused', () => {
  const tab = fakeTab(fakeVideo({ paused: true }));
  tab.send({ type: 'connected' });
  tab.send({ type: 'capture', first: true });
  assert.strictEqual(tab.last(), 'frame');
  tab.send({ type: 'capture', first: false });
  assert.strictEqual(tab.last(), 'same'); // paused: nothing new to send
  tab.send({ type: 'capture', first: true });
  assert.strictEqual(tab.last(), 'frame');
});

test('reports state on connect and hooks a replaced video on the next tick', () => {
  const first = fakeVideo({ paused: false });
  const tab = fakeTab(first);
  tab.send({ type: 'connected' });
  assert.deepStrictEqual(tab.posted[0], { type: 'state', playing: true, hasVideo: true, artwork: null });
  assert.ok(first.hooked.includes('pause'));

  const second = fakeVideo({ paused: true });
  tab.video = second;
  tab.send({ type: 'tick' });
  assert.ok(second.hooked.includes('pause'));
  assert.strictEqual(tab.last(), 'state');
  assert.strictEqual(tab.posted[tab.posted.length - 1].playing, false);
});
