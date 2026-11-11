const { layout, onExpanded, onStatus, onFrame, onCursor } = window.peek;

const root = document.documentElement.style;
root.setProperty('--top-gap', `${layout.TOP_GAP}px`);
root.setProperty('--pill-w', `${layout.PILL.w}px`);
root.setProperty('--pill-h', `${layout.PILL.h}px`);
root.setProperty('--card-w', `${layout.CARD.w}px`);
root.setProperty('--card-h', `${layout.CARD.h}px`);

const island = document.getElementById('island');
const video = document.getElementById('video');
const view = video.getContext('bitmaprenderer');
const artwork = document.getElementById('artwork');
const artworkBg = document.getElementById('artwork-bg');

let sourceId = null;

onExpanded((on) => {
  island.classList.toggle('expanded', on);
  if (!on) wakeRobot();
});

onStatus(({ source }) => {
  // A different tab took over: don't flash the previous tab's last picture.
  if ((source?.id ?? null) !== sourceId) {
    sourceId = source?.id ?? null;
    island.classList.remove('has-frame');
  }
  const state = !source ? 'idle' : source.playing ? 'playing' : 'paused';
  if (state === 'playing' && island.dataset.state !== 'playing') {
    // Music started: the robot waves first, then morphs into the dot and bars.
    if (!pendingPlay) {
      robot.celebrate(performance.now());
      pendingPlay = setTimeout(() => {
        pendingPlay = null;
        island.dataset.state = 'playing';
      }, CELEBRATE_MS);
    }
  } else {
    clearTimeout(pendingPlay);
    pendingPlay = null;
    island.dataset.state = state;
  }
  wakeRobot();
  island.dataset.media = mediaFor(source, island.classList.contains('has-frame'));
  if (source?.artwork && artwork.getAttribute('src') !== source.artwork) {
    artwork.src = artworkBg.src = source.artwork;
  }
});

// Decode off the main thread; if frames arrive faster than we draw, keep only the newest.
let latest = null;
let drawing = false;

onFrame((jpeg) => {
  latest = jpeg;
  if (!drawing) drawFrames();
});

async function drawFrames() {
  drawing = true;
  while (latest) {
    const jpeg = latest;
    latest = null;
    try {
      const bitmap = await createImageBitmap(new Blob([jpeg], { type: 'image/jpeg' }));
      // The canvas keeps its own size; match the frame so it isn't resampled to 300x150.
      if (video.width !== bitmap.width || video.height !== bitmap.height) {
        video.width = bitmap.width;
        video.height = bitmap.height;
      }
      view.transferFromImageBitmap(bitmap);
      island.classList.add('has-frame');
    } catch (err) {
      console.warn('Bad frame:', err);
    }
  }
  drawing = false;
}

// The robot shows while nothing plays. It only draws while visible, and at
// ~10fps while asleep.
const robotCtx = document.getElementById('robot').getContext('2d');
const robot = createRobot();
let pendingPlay = null;
let robotRunning = false;
let robotDrawnAt = 0;

const robotShown = () => island.dataset.state !== 'playing' && !island.classList.contains('expanded');

function wakeRobot() {
  if (robotRunning || !robotShown()) return;
  robotRunning = true;
  requestAnimationFrame(robotFrame);
}

function robotFrame(now) {
  if (!robotShown()) {
    robotRunning = false;
    return;
  }
  requestAnimationFrame(robotFrame);
  const pose = robot.step(now);
  if (pose.mood === 'sleep' && now - robotDrawnAt < 100) return;
  robotDrawnAt = now;
  drawRobot(robotCtx, pose, {
    width: layout.PILL.w,
    height: layout.PILL.h,
    dpr: devicePixelRatio,
    paused: island.dataset.state === 'paused'
  });
}

onCursor((sample) => {
  robot.move(sample, performance.now());
  wakeRobot();
});
wakeRobot();
