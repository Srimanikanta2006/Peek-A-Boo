const { test } = require('node:test');
const assert = require('node:assert');
const { mediaFor } = require('./media');

const tab = (over) => ({ id: 1, playing: true, hasVideo: false, artwork: null, ...over });

test('shows video, then artwork, then the empty message', () => {
  assert.strictEqual(mediaFor(tab({ hasVideo: true }), false), 'video');
  assert.strictEqual(mediaFor(tab({ artwork: 'https://x/a.jpg' }), false), 'artwork');
  assert.strictEqual(mediaFor(tab(), false), 'none');
  assert.strictEqual(mediaFor(null, false), 'none');
});

test('keeps the last frame while the same tab loads its next song', () => {
  assert.strictEqual(mediaFor(tab({ hasVideo: false }), true), 'video');
});

test('no source means the empty message, even with an old frame', () => {
  assert.strictEqual(mediaFor(null, true), 'none');
});
