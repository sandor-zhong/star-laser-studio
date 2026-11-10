// Canvas-only coin material. The scene owns shadows, stock identity and clocks.
// pose maps a unit circle through {a,b,c,d,x,y}; thickness is a distance in that
// same world coordinate system, vertically down from the supported top surface.
const R = 64;
const TAU = Math.PI * 2;
const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
let brushedTile;
const finishedCache=new WeakMap(),blankCache=new Map();

function getBrushedTile() {
  if (brushedTile !== undefined) return brushedTile;
  brushedTile = null;
  // No Image/document dependency: browsers use a tiny reusable texture, while
  // other Canvas implementations can use the direct stroke fallback below.
  if (typeof globalThis.OffscreenCanvas !== 'function') return brushedTile;
  const tile = new globalThis.OffscreenCanvas(512, 512);
  const ctx = tile.getContext('2d');
  if (!ctx) return brushedTile;
  for (let y = 0; y < 512; y++) {
    const wave = .5 + .5 * Math.sin(y * 1.713 + Math.sin(y * .127));
    const left = -40 + Math.sin(y * .37) * 36;
    ctx.lineWidth = .34 + wave * .23;
    ctx.strokeStyle = y % 5 === 0
      ? `rgba(65,41,17,${.035 + wave * .035})`
      : `rgba(255,243,205,${.028 + wave * .047})`;
    ctx.beginPath(); ctx.moveTo(left, y + .5); ctx.lineTo(552, y + .5); ctx.stroke();
  }
  brushedTile = tile;
  return brushedTile;
}

function circle(ctx, radius = R, x = 0, y = 0) {
  ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU);
}

function ring(ctx, outer, inner, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath(); ctx.arc(0, 0, outer, 0, TAU);
  ctx.arc(0, 0, inner, TAU, 0, true); ctx.fill('evenodd');
}

function goldReflection(ctx, phase, reverse = false) {
  const gradient = typeof ctx.createConicGradient === 'function'
    ? ctx.createConicGradient(phase + (reverse ? Math.PI : 0), 0, 0)
    : ctx.createLinearGradient(-R, -R * .3, R, R * .3);
  // Broad, bounded reflections of the workshop. There are no white hot spots,
  // additive glows or time-driven glitter on the metal.
  const colors = [
    [0, '#aa8040'], [.065, '#dfc28b'], [.14, '#966d32'],
    [.25, '#caa768'], [.38, '#b78e4a'], [.48, '#ead29a'],
    [.55, '#c7a260'], [.68, '#80592c'], [.82, '#d6b77a'],
    [.93, '#a1793d'], [1, '#aa8040'],
  ];
  for (const [stop, color] of colors) gradient.addColorStop(stop, color);
  return gradient;
}

function brushing(ctx, opacity = 1) {
  ctx.save(); ctx.globalAlpha *= opacity;
  const tile = getBrushedTile();
  if (tile) ctx.drawImage(tile, -R, -R, R * 2, R * 2);
  else {
    ctx.lineWidth = .075;
    for (let i = 0; i < 148; i++) {
      const y = -R + i * R * 2 / 148;
      ctx.strokeStyle = i % 5 ? '#fff3d00b' : '#50300f0b';
      ctx.beginPath(); ctx.moveTo(-R, y); ctx.lineTo(R, y + .035); ctx.stroke();
    }
  }
  ctx.restore();
}

// Local-space rectangles for the visited print area. null means fully revealed;
// [] means nothing has been engraved yet. Keeping this geometry independent of
// Canvas makes it possible to audit the mask against the actual scan samples.
export function getRasterClipRects(raster, radius = R) {
  if (!raster || raster.complete) return null;
  const rows = Math.max(1, Number.isFinite(raster.rows) ? raster.rows : 1);
  const row = clamp(Number.isFinite(raster.row) ? raster.row : 0, 0, rows);
  const height = radius * 2 / rows;
  const rectangles = row > 0 ? [{ x: -radius, y: -radius, width: radius * 2, height: height * row }] : [];
  if (Array.isArray(raster.lanes)) {
    for (const lane of raster.lanes) {
      // A lane whose clamped endpoint is already inside the disk may still be
      // unvisited: progress/started, rather than u alone, determines occupancy.
      if (lane.started === false || !(lane.progress > 0)
        || !Number.isFinite(lane.row) || lane.row < row || lane.row >= rows) continue;
      const v = Number.isFinite(lane.v) ? clamp(lane.v, -1, 1) : -1 + (lane.row + .5) * 2 / rows;
      const chord = Number.isFinite(lane.chord) ? clamp(lane.chord)
        : Math.sqrt(Math.max(0, 1 - v * v)) * .985;
      const direction = (lane.direction ?? raster.direction) > 0 ? 1 : -1;
      const start = -direction * chord;
      const u = lane.complete ? direction * chord
        : clamp(Number.isFinite(lane.u) ? lane.u : start, -chord, chord);
      const left = direction > 0 ? -chord : u, right = direction > 0 ? u : chord;
      if (right <= left) continue;
      rectangles.push({ x: left * radius, y: -radius + height * lane.row,
        width: (right - left) * radius, height });
    }
    return rectangles;
  }
  // Backward compatibility with the former single-row raster interface.
  const u = clamp(Number.isFinite(raster.u) ? raster.u : -1, -1, 1);
  const y = -radius + height * row;
  if (raster.rowComplete) rectangles.push({ x: -radius, y, width: radius * 2, height });
  else if (raster.direction > 0) rectangles.push({ x: -radius, y, width: (u + 1) * radius, height });
  else rectangles.push({ x: u * radius, y, width: (1 - u) * radius, height });
  return rectangles;
}

function rasterClip(ctx, raster) {
  const rectangles = getRasterClipRects(raster);
  if (rectangles === null) return;
  ctx.beginPath();
  for (const { x, y, width, height } of rectangles) ctx.rect(x, y, width, height);
  ctx.clip();
}

function drawSide(ctx, pose, determinant, thickness, phase) {
  if (thickness <= 0) return;
  // Invert the affine basis for a world displacement of (0, thickness).
  // This preserves the actual contact plane even when c introduces shear.
  const dx = -pose.c * thickness * R / determinant;
  const dy = pose.a * thickness * R / determinant;
  const right = Math.atan2(pose.c, pose.a), direction = determinant > 0 ? 1 : -1;
  const left = right + direction * Math.PI;
  ctx.save(); ctx.beginPath();
  ctx.arc(0, 0, R, right, left, direction < 0);
  ctx.lineTo(Math.cos(left) * R + dx, Math.sin(left) * R + dy);
  ctx.arc(dx, dy, R, left, right, direction > 0);
  ctx.closePath(); ctx.clip();
  const shift = Math.sin(phase) * R * .28;
  const side = ctx.createLinearGradient(-R + shift, 0, R + shift, 0);
  for (const [stop, color] of [
    [0, '#62421f'], [.12, '#a47c3d'], [.27, '#c9a561'],
    [.36, '#e2c386'], [.45, '#b48c48'], [.67, '#a07836'],
    [.79, '#c6a265'], [.91, '#8d652e'], [1, '#563b20'],
  ]) side.addColorStop(stop, color);
  ctx.fillStyle = side; ctx.fillRect(-R - Math.abs(dx) - 1, -R - 1,
    R * 2 + Math.abs(dx) * 2 + 2, R * 2 + Math.abs(dy) + 2);
  // Very shallow edge machining marks, subordinate to the broad reflections.
  ctx.lineWidth = .14;
  for (let index = 1; index < 64; index++) {
    const angle = right + direction * index / 64 * Math.PI;
    const x = Math.cos(angle) * R, y = Math.sin(angle) * R;
    ctx.strokeStyle = index % 4 ? '#f5dc9d18' : '#4f321b25';
    ctx.beginPath(); ctx.moveTo(x + dx * .2, y + dy * .2);
    ctx.lineTo(x + dx * .88, y + dy * .88); ctx.stroke();
  }
  ctx.strokeStyle = '#50371d77'; ctx.lineWidth = .3;
  ctx.beginPath(); ctx.arc(dx, dy, R - .1, right, left, direction < 0); ctx.stroke();
  ctx.restore();
}

/**
 * Draw one metal workpiece, without its shadow. All state is restored.
 * lightOffset is an optional angle in radians; the default reflection also
 * changes slowly with the coin's world position, and remains still when paused.
 * Image pixels are never edited, so the original assessment stays unchanged.
 */
function renderMetalCoin(ctx, image, pose, {
  raster = null, blank = false, thickness = 3.5, lightOffset = 0,
} = {}) {
  if (!ctx || !pose || !['x', 'y', 'a', 'b', 'c', 'd'].every(key => Number.isFinite(pose[key]))) return;
  const determinant = pose.a * pose.d - pose.b * pose.c;
  if (Math.abs(determinant) < 1e-8) return;
  const depth = Number.isFinite(thickness) ? Math.max(0, thickness) : 3.5;
  const phase = .12 + pose.x * .00041 + pose.y * .00017
    + (Number.isFinite(lightOffset) ? lightOffset : 0);
  ctx.save(); ctx.transform(pose.a / R, pose.b / R, pose.c / R, pose.d / R, pose.x, pose.y);
  drawSide(ctx, pose, determinant, depth, phase);

  // A satin gold substrate remains visible only in unengraved areas.
  ctx.save(); circle(ctx); ctx.clip();
  const shift = Math.sin(phase) * R * .22;
  const gold = ctx.createLinearGradient(-R + shift, -R * .65, R + shift, R * .65);
  for (const [stop, color] of [
    [0, '#b58d47'], [.22, '#d9bd7e'], [.42, '#e6cf99'],
    [.62, '#ccb078'], [.82, '#b99251'], [1, '#98733a'],
  ]) gold.addColorStop(stop, color);
  ctx.fillStyle = gold; ctx.fillRect(-R, -R, R * 2, R * 2); brushing(ctx);
  if (image && !blank) {
    ctx.save(); circle(ctx, 60.55); ctx.clip(); rasterClip(ctx, raster);
    ctx.drawImage(image, -R, -R, R * 2, R * 2);
    // A restrained coating reflection, clipped by the exact same raster mask.
    const coating = ctx.createLinearGradient(-R, -R, R, R);
    coating.addColorStop(0, '#fff0d10d'); coating.addColorStop(.42, '#fff8e300');
    coating.addColorStop(.76, '#f4d99c05'); coating.addColorStop(1, '#30231407');
    ctx.fillStyle = coating; ctx.fillRect(-R, -R, R * 2, R * 2);
    brushing(ctx, .28); ctx.restore();
  }
  ctx.restore();

  // Outer rolled shoulder, broad machined face, and the inward-facing bevel
  // have distinct surface normals rather than three flat painted outlines.
  ring(ctx, R, 63.05, goldReflection(ctx, phase + .18, true));
  ring(ctx, 63.05, 61.2, goldReflection(ctx, phase));
  ring(ctx, 61.2, 60.55, goldReflection(ctx, phase + .2, true));
  ctx.lineWidth = .075;
  for (let index = 0; index < 5; index++) {
    ctx.strokeStyle = index % 2 ? '#f5dfac20' : '#6d4a2620';
    circle(ctx, 61.45 + index * .32); ctx.stroke();
  }
  ctx.strokeStyle = '#49321c90'; ctx.lineWidth = .24; circle(ctx, 63.9); ctx.stroke();
  ctx.strokeStyle = '#5e411f86'; ctx.lineWidth = .26; circle(ctx, 60.55); ctx.stroke();
  ctx.restore();
}

// Completed portraits are immutable in the production scene. Cache the complete
// material, while partially engraved workpieces keep their live raster mask.
// Lighting is quantized by less than one degree, never by animation time.
export function drawMetalCoin(ctx,image,pose,options={}) {
  if(!ctx||!pose||!['x','y','a','b','c','d'].every(key=>Number.isFinite(pose[key])))return;
  if(options.cache===false||typeof globalThis.OffscreenCanvas!=='function'||(options.raster&&!options.raster.complete)){
    renderMetalCoin(ctx,image,pose,options);return;
  }
  const portrait=options.blank?null:image;
  const thickness=Number.isFinite(options.thickness)?Math.max(0,options.thickness):3.5;
  const phase=Math.round((.12+pose.x*.00041+pose.y*.00017+(Number.isFinite(options.lightOffset)?options.lightOffset:0))*64)/64;
  const key=[pose.a,pose.b,pose.c,pose.d,thickness,phase].map(n=>n.toFixed(4)).join('/');
  let cache=blankCache;
  if(portrait&&(typeof portrait==='object'||typeof portrait==='function')){
    cache=finishedCache.get(portrait);if(!cache){cache=new Map();finishedCache.set(portrait,cache);}
  }
  let tile=cache.get(key);
  if(!tile){
    const rx=Math.hypot(pose.a,pose.c),ry=Math.hypot(pose.b,pose.d);
    const left=-rx-1,top=-ry-1,width=rx*2+2,height=ry*2+thickness+2;
    const density=Math.min(10,1024/Math.max(width,height));
    const canvas=new globalThis.OffscreenCanvas(Math.ceil(width*density),Math.ceil(height*density));
    const material=canvas.getContext('2d');material.setTransform(density,0,0,density,-left*density,-top*density);
    renderMetalCoin(material,portrait,{...pose,x:0,y:0},{...options,raster:null,lightOffset:phase-.12});
    tile={canvas,left,top,width:canvas.width/density,height:canvas.height/density};cache.set(key,tile);
    if(cache.size>24)cache.delete(cache.keys().next().value);
  }
  ctx.drawImage(tile.canvas,pose.x+tile.left,pose.y+tile.top,tile.width,tile.height);
}
