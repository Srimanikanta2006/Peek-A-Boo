// The little robot that lives in the pill while nothing is playing; the glass
// pill is its face. createRobot is its brain: cursor samples + time in, a pose
// out. drawRobot paints a pose. No DOM or Electron, so the brain is testable.

const SLEEP_AFTER_MS = 30_000;
const STILL_MS = 2500;        // cursor resting this long starts the idle reactions
const REACTION_MS = 2200;     // how long one idle reaction plays
const REACTIONS = ['happy', 'curious', 'bashful'];
const HELLO_AFTER_MS = 1500;  // moving again after resting this long: a little wave
const NEAR_PX = 160;
const CELEBRATE_MS = 700;
const LOOK_RANGE_X = 280;     // cursor distance that turns the eyes all the way
const LOOK_RANGE_Y = 180;
const LOOK_SPEED = 10;        // per second; eyes ease toward the cursor, never snap
const FACE_SPEED = 12;        // expressions blend into each other over ~0.25s
const BLINK_SPEED = 30;       // eyelids are quick, except when dozing off
const DOZE_SPEED = 4;
const BLINK_MS = 130;

// Gestures, read from the last few seconds of cursor movement.
const TRAIL_MS = 3000;
const WIGGLE_MS = 1000;       // wiggle: this many left/right flips within this long
const WIGGLE_FLIPS = 4;
const DIZZY_TURNS = 3;        // tight circles: full turns within TRAIL_MS...
const DIZZY_SIZE_PX = 300;    // ...inside an area this small
const SHY_TURNS = 1.5;        // slow circles near the top...
const SHY_NEAR_PX = 260;      // ...within this distance of the face
const SHY_MAX_SPEED = 700;    // px/s
const GESTURE_MS = { happy: 1500, curious: 1200, bashful: 2200, dizzy: 1800 };

const clamp1 = (v) => Math.max(-1, Math.min(1, v));

// How much of each expression a mood shows (0..1). The painter blends them.
function faceFor(mood, blink) {
  return {
    open: mood === 'sleep' || blink ? 0 : 1,
    happy: mood === 'happy' ? 1 : 0,
    shy: mood === 'shy' || mood === 'bashful' ? 1 : 0,
    hands: mood === 'bashful' ? 1 : 0,
    curious: mood === 'curious' ? 1 : 0,
    dizzy: mood === 'dizzy' ? 1 : 0,
    sleep: mood === 'sleep' ? 1 : 0
  };
}

// Which gesture, if any, the recent cursor trail [{ x, y, t }] draws: a quick
// left-right wiggle ('happy'), tight circles ('dizzy'), or slow circles near
// the face ('bashful'). x, y are relative to the face centre.
function detectGesture(trail) {
  if (trail.length < 6) return null;
  const end = trail[trail.length - 1].t;
  let flips = 0, wigglePath = 0, lastDir = 0;
  let turn = 0, heading = null, path = 0, farthest = 0;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < trail.length; i++) {
    const b = trail[i];
    minX = Math.min(minX, b.x);
    maxX = Math.max(maxX, b.x);
    minY = Math.min(minY, b.y);
    maxY = Math.max(maxY, b.y);
    farthest = Math.max(farthest, Math.hypot(b.x, b.y));
    if (i === 0) continue;
    const a = trail[i - 1];
    const sx = b.x - a.x;
    const sy = b.y - a.y;
    const len = Math.hypot(sx, sy);
    path += len;
    if (b.t > end - WIGGLE_MS) {
      wigglePath += len;
      if (Math.abs(sx) >= 4) {
        const dir = Math.sign(sx);
        if (lastDir && dir !== lastDir) flips++;
        lastDir = dir;
      }
    }
    if (len >= 2) {
      const h = Math.atan2(sy, sx);
      if (heading !== null) {
        const d = Math.atan2(Math.sin(h - heading), Math.cos(h - heading));
        if (Math.abs(d) < 2.5) turn += d; // sharp reversals belong to wiggles, not circles
      }
      heading = h;
    }
  }
  const turns = Math.abs(turn) / (2 * Math.PI);
  const speed = path / Math.max(0.001, (end - trail[0].t) / 1000);
  if (flips >= WIGGLE_FLIPS && wigglePath > 600) return 'happy';
  if (turns >= DIZZY_TURNS && Math.max(maxX - minX, maxY - minY) < DIZZY_SIZE_PX) return 'dizzy';
  if (turns >= SHY_TURNS && farthest < SHY_NEAR_PX && speed < SHY_MAX_SPEED) return 'bashful';
  return null;
}

function createRobot({ random = Math.random } = {}) {
  let cursor = null;          // { dx, dy, onPill }, relative to the face centre
  let movedAt = null;
  let celebrateUntil = -Infinity;
  let gesture = null;         // a reaction to how the cursor moved
  let gestureUntil = -Infinity;
  let reaction = null;        // the idle reaction playing now, if any
  let reactionUntil = -Infinity;
  let reactAt = null;
  let blinkAt = null;
  let blinkUntil = -Infinity;
  let lookX = 0;
  let lookY = 0;
  let lastStep = null;
  const trail = [];
  const face = faceFor('watch', false);

  const blinkGap = () => 2500 + random() * 3500;
  const reactionGap = () => 1500 + random() * 2500;
  // A random reaction, never the same one twice in a row.
  const pickReaction = () => {
    const options = REACTIONS.filter((r) => r !== reaction);
    return options[Math.floor(random() * options.length)];
  };
  const react = (mood, now) => {
    gesture = mood;
    gestureUntil = now + GESTURE_MS[mood];
    trail.length = 0; // one gesture, one reaction
  };

  return {
    // Moving the cursor ends any idle reaction; they restart once it rests.
    move(sample, now) {
      if (cursor) {
        const restedFor = now - movedAt;
        if (restedFor >= SLEEP_AFTER_MS) blinkAt = now + 250; // wakes, then blinks
        else if (restedFor >= HELLO_AFTER_MS) react('curious', now);
      }
      cursor = sample;
      movedAt = now;
      reactionUntil = -Infinity;
      reactAt = now + STILL_MS;
      trail.push({ x: sample.dx, y: sample.dy, t: now });
      while (trail[0].t < now - TRAIL_MS) trail.shift();
      const drawn = detectGesture(trail);
      if (drawn) react(drawn, now);
    },

    celebrate(now) {
      celebrateUntil = now + CELEBRATE_MS;
    },

    step(now) {
      if (lastStep === null) {
        lastStep = now;
        movedAt ??= now;
        reactAt ??= now + STILL_MS;
        blinkAt ??= now + blinkGap();
      }
      const dt = Math.min(0.1, (now - lastStep) / 1000);
      lastStep = now;

      const asleep = now - movedAt >= SLEEP_AFTER_MS;
      if (!asleep && now >= reactAt) {
        reaction = pickReaction();
        reactionUntil = now + REACTION_MS;
        reactAt = reactionUntil + reactionGap();
      }
      const dist = cursor ? Math.hypot(cursor.dx, cursor.dy) : Infinity;
      const mood = now < celebrateUntil || cursor?.onPill ? 'happy'
        : now < gestureUntil ? gesture
        : asleep ? 'sleep'
        : now < reactionUntil ? reaction
        : dist < NEAR_PX ? 'shy'
        : 'watch';

      const ease = (speed) => 1 - Math.exp(-speed * dt);
      const awake = cursor && mood !== 'sleep';
      lookX += ((awake ? clamp1(cursor.dx / LOOK_RANGE_X) : 0) - lookX) * ease(LOOK_SPEED);
      lookY += ((awake ? clamp1(cursor.dy / LOOK_RANGE_Y) : 0) - lookY) * ease(LOOK_SPEED);

      if (now >= blinkAt) {
        blinkUntil = now + BLINK_MS;
        blinkAt = now + blinkGap();
      }
      const blink = now < blinkUntil && (mood === 'watch' || mood === 'shy');

      const target = faceFor(mood, blink);
      for (const key in face) {
        const speed = key !== 'open' ? FACE_SPEED : mood === 'sleep' ? DOZE_SPEED : BLINK_SPEED;
        face[key] += (target[key] - face[key]) * ease(speed);
      }
      return { mood, lookX, lookY, blink, t: now, face: { ...face } };
    }
  };
}

const GLOW = { idle: '#5b9dff', paused: '#ffc56b' };
const GLOW_CORE = { idle: '#dce9ff', paused: '#fff4de' };
// The face is designed at this size and scaled to fit the pill, centred.
const FACE = { w: 112, h: 44 };

const quadPoint = (p0, c, p1, s) => {
  const u = 1 - s;
  return [u * u * p0[0] + 2 * u * s * c[0] + s * s * p1[0], u * u * p0[1] + 2 * u * s * c[1] + s * s * p1[1]];
};

// Paints a pose on a canvas the size of the pill. The face sits on the app's
// own glass, so only the features are drawn.
function drawRobot(ctx, pose, { width: canvasW, height: canvasH, dpr, paused }) {
  const canvas = ctx.canvas;
  const w = Math.round(canvasW * dpr);
  const h = Math.round(canvasH * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, canvasW, canvasH);
  // Draw in FACE units, scaled down to fit. Glow (shadowBlur) ignores the
  // transform, so it is scaled by hand with k.
  const k = canvasH / FACE.h;
  ctx.translate((canvasW - FACE.w * k) / 2, 0);
  ctx.scale(k, k);
  const { w: width, h: height } = FACE;

  const { lookX, lookY, t, face: f } = pose;
  const glow = paused ? GLOW.paused : GLOW.idle;
  const core = paused ? GLOW_CORE.paused : GLOW_CORE.idle;
  const radius = height / 2;
  const bob = Math.sin(t / 700) * 0.5 * (1 - f.sleep)
    + Math.sin(t / 1100) * 0.8 * f.sleep
    - Math.abs(Math.sin(t / 130)) * 1.2 * f.happy;
  // The face leans a little toward the cursor; the pupils do most of the looking.
  // Dizzy adds a slow sway that settles.
  const cx = width / 2 + lookX * 3 + Math.sin(t / 160) * 2 * f.dizzy;
  const cy = height / 2 + lookY * 1 + bob;

  const capsule = () => {
    ctx.beginPath();
    ctx.roundRect(0.75, 0.75, width - 1.5, height - 1.5, radius - 0.75);
  };
  const dot = (x, y, r) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  // Glowing LED dots along a curve, like the dotted eyes in the design.
  const dottedCurve = (alpha, p0, c, p1, count = 7, r = 1.55) => {
    if (alpha < 0.02) return;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = glow;
    ctx.shadowBlur = 5 * k * dpr;
    for (let i = 0; i < count; i++) dot(...quadPoint(p0, c, p1, i / (count - 1)), r);
  };
  // A paw: a lobed palm pad and four oval toe beans fanned above it, each
  // softly shaded so it reads as a squishy pad rather than a flat stamp.
  const TOES = [[-2.55, -1.2, -0.55], [-0.9, -2.5, -0.18], [0.9, -2.5, 0.18], [2.55, -1.2, 0.55]];
  const paw = (alpha, x, y, rot, size = 1) => {
    if (alpha < 0.02) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(size * 1.3, size * 1.3);
    ctx.shadowBlur = 5 * k * dpr;
    const shaded = (gx, gy, r) => {
      const g = ctx.createRadialGradient(gx - r * 0.3, gy - r * 0.35, 0, gx, gy, r * 1.2);
      g.addColorStop(0, core);
      g.addColorStop(1, glow);
      return g;
    };
    ctx.fillStyle = shaded(0, 1.3, 2.4);
    ctx.beginPath();
    ctx.moveTo(0, -0.3);
    ctx.bezierCurveTo(1.5, -0.3, 2.7, 1.0, 2.35, 2.2);
    ctx.bezierCurveTo(2.1, 3.15, 1.15, 3.05, 0.6, 2.75);
    ctx.quadraticCurveTo(0, 2.5, -0.6, 2.75);
    ctx.bezierCurveTo(-1.15, 3.05, -2.1, 3.15, -2.35, 2.2);
    ctx.bezierCurveTo(-2.7, 1.0, -1.5, -0.3, 0, -0.3);
    ctx.fill();
    for (const [tx, ty, tr] of TOES) {
      ctx.fillStyle = shaded(tx, ty, 1);
      ctx.beginPath();
      ctx.ellipse(tx, ty, 0.78, 1.05, tr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  // Everything stays inside the pill's rounded edge.
  capsule();
  ctx.save();
  ctx.clip();

  // Blush: a soft rosy flush on each cheek, just below and outside the eyes.
  if (f.shy > 0.02) {
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(cx + side * 22, cy + 8);
      ctx.scale(8, 4.2);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, `rgba(255, 120, 140, ${0.8 * f.shy})`);
      g.addColorStop(0.45, `rgba(255, 120, 140, ${0.45 * f.shy})`);
      g.addColorStop(1, 'rgba(255, 120, 140, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    }
  }

  ctx.shadowColor = glow;
  ctx.lineCap = 'round';

  // Eyes: tall glowing capsules that glide toward the cursor, dotted closed
  // and happy arcs, and dotted spirals for dizzy, all blended.
  for (const side of [-1, 1]) {
    const ex = cx + side * 18;
    const ey = cy - 1;
    const R = 7 * (1 + f.curious * (side < 0 ? 0.2 : -0.22));
    const plain = Math.max(0, 1 - f.happy - f.dizzy);
    if (f.open > 0.06 && plain > 0.02) {
      const ew = R * 1.45;
      const eh = R * 2.1;
      ctx.save();
      ctx.globalAlpha = plain;
      ctx.translate(ex + lookX * 3.5, ey + lookY * 2.2);
      ctx.scale(1, f.open); // blinking squashes the eye flat
      const fill = ctx.createLinearGradient(0, -eh / 2, 0, eh / 2);
      fill.addColorStop(0, core);
      fill.addColorStop(0.55, glow);
      fill.addColorStop(1, glow);
      ctx.fillStyle = fill;
      ctx.shadowBlur = 9 * k * dpr;
      ctx.beginPath();
      ctx.roundRect(-ew / 2, -eh / 2, ew, eh, ew / 2);
      ctx.fill();
      // Sparkles: a big one up-left and a tiny one below it.
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      dot(-ew * 0.16, -eh * 0.2, ew * 0.22);
      dot(ew * 0.14, eh * 0.06, ew * 0.1);
      ctx.restore();
    }
    dottedCurve(plain * (1 - f.open), [ex - R, ey - 1], [ex, ey + R * 0.9], [ex + R, ey - 1]);
    dottedCurve(f.happy, [ex - R, ey + 3], [ex, ey - R * 1.3], [ex + R, ey + 3]);
    if (f.dizzy > 0.02) {
      ctx.globalAlpha = f.dizzy;
      ctx.fillStyle = glow;
      ctx.shadowBlur = 5 * k * dpr;
      const spin = (t / 140) * side;
      for (let a = 0.6; a <= Math.PI * 4; a += 0.62) {
        const rr = (a / (Math.PI * 4)) * R;
        dot(ex + Math.cos(a + spin) * rr, ey + Math.sin(a + spin) * rr, 1.35);
      }
    }
  }

  // Paws: cheering high (happy), one waving by the ear (curious), held
  // together under the eyes (bashful), resting (asleep).
  const wave = Math.sin(t / 120);
  paw(f.happy, cx - 40, cy - 7 + wave * 1.2, -0.55 + wave * 0.25);
  paw(f.happy, cx + 40, cy - 7 - wave * 1.2, 0.55 - wave * 0.25);
  paw(f.curious, cx + 40, cy - 6, 0.4 + Math.sin(t / 90) * 0.35);
  paw(f.hands, cx - 6.5, cy + 12, -0.2, 0.9);
  paw(f.hands, cx + 6.5, cy + 12, 0.2, 0.9);
  paw(f.sleep, cx - 7, cy + 13, -0.35, 0.85);
  paw(f.sleep, cx + 7, cy + 13, 0.35, 0.85);

  // Asleep: z, Z, Z drifting up and fading.
  if (f.sleep > 0.02) {
    ctx.fillStyle = glow;
    ctx.shadowBlur = 5 * k * dpr;
    for (const i of [0, 1, 2]) {
      const p = (t / 2400 + i / 3) % 1;
      ctx.globalAlpha = f.sleep * Math.min(1, (1 - p) * 1.5);
      ctx.font = `bold ${7 + i * 2.5}px "Segoe UI", sans-serif`;
      ctx.fillText(i ? 'Z' : 'z', cx + 27 + i * 4.5 + p * 3, cy - 1 - i * 2.5 - p * 4);
    }
  }

  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

if (typeof module === 'object') module.exports = { createRobot, drawRobot, detectGesture, SLEEP_AFTER_MS, CELEBRATE_MS };
