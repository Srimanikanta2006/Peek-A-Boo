const { test } = require('node:test');
const assert = require('node:assert');
const { createHover } = require('./hover');

// Pill is a small zone at the top; the card is a larger zone around it.
const make = () => createHover({
  pillZone: { x: 40, y: 0, w: 20, h: 10 },
  cardZone: { x: 0, y: 0, w: 100, h: 60 },
  expandDelayMs: 100,
  collapseDelayMs: 250
});
const PILL = [50, 5];
const CARD_ONLY = [5, 50]; // inside the card, outside the pill
const AWAY = [500, 500];

test('expands only once the cursor rests on the pill', () => {
  const hover = make();
  assert.strictEqual(hover(...PILL, 0), null);
  assert.strictEqual(hover(...PILL, 99), null);
  assert.strictEqual(hover(...PILL, 100), true);
});

test('a cursor passing over the pill does not expand it', () => {
  const hover = make();
  hover(...PILL, 0);
  assert.strictEqual(hover(...AWAY, 50), null);
  assert.strictEqual(hover(...AWAY, 500), null);
});

test('stays open anywhere on the card, closes after the grace period off it', () => {
  const hover = make();
  hover(...PILL, 0);
  hover(...PILL, 100);
  assert.strictEqual(hover(...CARD_ONLY, 1000), null);
  assert.strictEqual(hover(...AWAY, 1100), null);
  assert.strictEqual(hover(...CARD_ONLY, 1200), null); // came back in time
  assert.strictEqual(hover(...AWAY, 1300), null);
  assert.strictEqual(hover(...AWAY, 1550), false);
});
