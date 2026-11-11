// Decides when the island opens and closes from where the cursor has been.
// No Electron here, so it can be tested with fake positions and times.
function createHover({ pillZone, cardZone, expandDelayMs, collapseDelayMs }) {
  let expanded = false;
  let wasInside = false;
  let changedAt = 0;

  // x, y are window coordinates. Returns true/false when the island should
  // expand/collapse, or null to leave it as it is.
  return function update(x, y, now) {
    const zone = expanded ? cardZone : pillZone;
    const inside = x >= zone.x && x < zone.x + zone.w && y >= zone.y && y < zone.y + zone.h;
    if (inside !== wasInside) {
      wasInside = inside;
      changedAt = now;
    }
    const held = now - changedAt;
    const flip = expanded ? !inside && held >= collapseDelayMs : inside && held >= expandDelayMs;
    if (!flip) return null;
    expanded = !expanded;
    // The hover zone just changed size; restart intent timing from here.
    wasInside = expanded;
    changedAt = now;
    return expanded;
  };
}

module.exports = { createHover };
