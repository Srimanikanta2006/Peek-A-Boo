// What the card shows. Between playlist songs YouTube briefly has no frames;
// keep the tab's last frame up instead of flashing the empty message.
function mediaFor(source, hasFrame) {
  if (source?.hasVideo) return 'video';
  if (source?.artwork) return 'artwork';
  return source && hasFrame ? 'video' : 'none';
}

// Whether hovering should open the card. With nothing to show, the robot
// waves instead. While playing it always opens: frames can lag a song change.
function canOpen(source) {
  return !!source && (source.playing || source.hasVideo || !!source.artwork);
}

if (typeof module === 'object') module.exports = { mediaFor, canOpen };
