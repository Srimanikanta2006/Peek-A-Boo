// What the card shows. Between playlist songs YouTube briefly has no frames;
// keep the tab's last frame up instead of flashing the empty message.
function mediaFor(source, hasFrame) {
  if (source?.hasVideo) return 'video';
  if (source?.artwork) return 'artwork';
  return source && hasFrame ? 'video' : 'none';
}

if (typeof module === 'object') module.exports = { mediaFor };
