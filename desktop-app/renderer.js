const { layout, onExpanded, onStatus, onFrame } = window.peek;

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

onExpanded((on) => island.classList.toggle('expanded', on));

onStatus(({ source }) => {
  island.dataset.state = !source ? 'idle' : source.playing ? 'playing' : 'paused';
  island.dataset.media = source?.hasVideo ? 'video' : source?.artwork ? 'artwork' : 'none';

  // A different tab took over: don't flash the previous tab's last picture.
  if ((source?.id ?? null) !== sourceId) {
    sourceId = source?.id ?? null;
    island.classList.remove('has-frame');
  }
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
