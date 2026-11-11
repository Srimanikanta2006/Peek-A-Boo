const { test } = require('node:test');
const assert = require('node:assert');
const { createRobot, detectGesture, SLEEP_AFTER_MS } = require('./robot');

const at = (dx, dy, onPill = false) => ({ dx, dy, onPill });
// random() = 0: the first blink lands 2500ms after the first step, reactions
// come 1500ms apart, and the first reaction picked is 'happy'.
const make = () => createRobot({ random: () => 0 });

test('watches, falls asleep when the cursor rests, and wakes on movement', () => {
  const robot = make();
  robot.move(at(400, 300), 0);
  assert.strictEqual(robot.step(0).mood, 'watch');
  assert.strictEqual(robot.step(1000).mood, 'watch');
  assert.strictEqual(robot.step(SLEEP_AFTER_MS).mood, 'sleep');
  robot.move(at(410, 300), SLEEP_AFTER_MS + 500);
  assert.strictEqual(robot.step(SLEEP_AFTER_MS + 500).mood, 'watch');
});

test('gets shy when the cursor is near and is happy on the pill', () => {
  const robot = make();
  robot.move(at(60, 40), 0);
  assert.strictEqual(robot.step(0).mood, 'shy');
  robot.move(at(0, 0, true), 1000);
  assert.strictEqual(robot.step(1000).mood, 'happy');
});

test('plays its reactions one after another while the cursor rests', () => {
  const robot = make();
  robot.move(at(400, 300), 0);
  assert.strictEqual(robot.step(2499).mood, 'watch');
  assert.strictEqual(robot.step(2500).mood, 'happy');
  assert.strictEqual(robot.step(4699).mood, 'happy');
  assert.strictEqual(robot.step(4700).mood, 'watch'); // a pause between reactions
  assert.strictEqual(robot.step(6200).mood, 'curious'); // never the same one twice in a row
  robot.move(at(420, 300), 6300);
  assert.strictEqual(robot.step(6300).mood, 'curious', 'moving after a rest: a little hello wave');
  assert.strictEqual(robot.step(7500).mood, 'watch', 'then back to watching');
  assert.strictEqual(robot.step(8799).mood, 'watch', 'reactions restart only once it rests again');
});

test('fast mouse moves do not startle or shake it', () => {
  const robot = make();
  robot.move(at(0, 400), 0);
  robot.move(at(900, 400), 30); // ~30000 px/s
  const pose = robot.step(30);
  assert.strictEqual(pose.mood, 'watch');
});

test('eyes ease toward the cursor and stay inside their range', () => {
  const robot = make();
  robot.move(at(5000, -5000), 0);
  robot.step(0);
  const first = robot.step(16);
  assert.ok(first.lookX > 0 && first.lookX < 0.5, `eased, not snapped: ${first.lookX}`);
  let pose;
  for (let t = 32; t <= 3000; t += 16) pose = robot.step(t);
  assert.ok(Math.abs(pose.lookX - 1) < 0.01 && Math.abs(pose.lookY + 1) < 0.01, 'reaches the clamped edge');
});

test('blinks every few seconds while watching', () => {
  const robot = make();
  robot.move(at(400, 300), 0);
  assert.strictEqual(robot.step(0).blink, false);
  robot.move(at(410, 300), 1400); // keep it watching (too soon for a hello or a reaction)
  assert.strictEqual(robot.step(2500).blink, true);
  assert.strictEqual(robot.step(2700).blink, false);
});

test('celebrates when a video starts', () => {
  const robot = make();
  robot.move(at(400, 300), 0);
  robot.celebrate(100);
  assert.strictEqual(robot.step(100).mood, 'happy');
  assert.strictEqual(robot.step(900).mood, 'watch');
});

test('expressions blend instead of switching, and dozing off is slow', () => {
  const robot = make();
  robot.move(at(400, 300), 0);
  robot.step(0);
  robot.step(100);
  // Cursor comes close: shy cheeks fade in over a few frames, not in one.
  robot.move(at(60, 40), 100);
  const first = robot.step(116).face.shy;
  assert.ok(first > 0 && first < 0.5, `fading in: ${first}`);
  let pose;
  for (let t = 132; t <= 1000; t += 16) pose = robot.step(t);
  assert.ok(pose.face.shy > 0.95, 'fully shy');

  // Left alone: the eyes droop shut over about a second.
  let t = 1000;
  while (pose.mood !== 'sleep') pose = robot.step((t += 16));
  assert.ok(pose.face.open > 0.9, `just started dozing: ${pose.face.open}`);
  for (const end = t + 1200; t < end;) pose = robot.step((t += 16));
  assert.ok(pose.face.open < 0.05 && pose.face.sleep > 0.95, 'asleep');
});

// Cursor paths for gestures, sampled every 30ms like the app does.
const circle = (cx, cy, radius, msPerTurn, ms) => {
  const trail = [];
  for (let t = 0; t <= ms; t += 30) {
    const a = (t / msPerTurn) * 2 * Math.PI;
    trail.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius, t });
  }
  return trail;
};

test('gestures: a quick wiggle cheers, tight circles make it dizzy, slow circles near it make it bashful', () => {
  const wiggle = [0, 1, 2, 3, 4, 5].map((i) => ({ x: 400 + (i % 2 ? 80 : -80), y: 300, t: i * 30 }));
  assert.strictEqual(detectGesture(wiggle), 'happy');
  assert.strictEqual(detectGesture(circle(500, 400, 50, 600, 2400)), 'dizzy');
  assert.strictEqual(detectGesture(circle(0, 120, 60, 1800, 2900)), 'bashful');
});

test('gestures: ordinary movement, and slow circles far from it, mean nothing', () => {
  const line = Array.from({ length: 30 }, (_, i) => ({ x: i * 40, y: 300 + i * 5, t: i * 30 }));
  assert.strictEqual(detectGesture(line), null);
  assert.strictEqual(detectGesture(circle(600, 400, 60, 1800, 2900)), null);
  const slowWiggle = [0, 1, 2, 3, 4, 5].map((i) => ({ x: 400 + (i % 2 ? 10 : -10), y: 300, t: i * 30 }));
  assert.strictEqual(detectGesture(slowWiggle), null, 'tiny jitters are not a wiggle');
});

test('reacts to gestures live: dizzy from spinning, then settles back', () => {
  const robot = make();
  let t = 0;
  for (const p of circle(500, 400, 50, 600, 2400)) robot.move(at(p.x, p.y), (t = p.t));
  assert.strictEqual(robot.step(t).mood, 'dizzy');
  assert.strictEqual(robot.step(t + 2000).mood, 'watch');
});

test('waves hello after a rest, but only blinks awake after sleeping', () => {
  const robot = make();
  robot.move(at(400, 300), 0);
  robot.step(0);
  robot.move(at(405, 300), 1600);
  assert.strictEqual(robot.step(1600).mood, 'curious');
  robot.step(SLEEP_AFTER_MS + 1700);
  robot.move(at(406, 300), SLEEP_AFTER_MS + 1700);
  const woke = robot.step(SLEEP_AFTER_MS + 1700);
  assert.strictEqual(woke.mood, 'watch', 'no hello when waking up');
  assert.strictEqual(robot.step(SLEEP_AFTER_MS + 1950).blink, true, 'blinks right after waking');
});
