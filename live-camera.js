import { HANDLING_TIMING as T } from './handling-cycle.js';

export const PHOTO_SIZE = Object.freeze({ width:941, height:1672 });
export const LIVE_SIZE = Object.freeze({ width:1080, height:1920 });
// Leave room above the physical machine for its floating monitor. The
// machine camera stays fixed during production, inspection and tray exchange.
const scale=1.08,ty=260;
export const FIXED_CAMERA = Object.freeze({
  x:PHOTO_SIZE.width/2,y:(LIVE_SIZE.height/2-ty)/scale,
  zoom:1,detail:0,scale,tx:(LIVE_SIZE.width-PHOTO_SIZE.width*scale)/2,ty,
});
export const WIDE_CAMERA = FIXED_CAMERA;
// Compatibility aliases for callers from the previous camera layout.
export const PORTRAIT_CAMERA = FIXED_CAMERA;
export const SHOWCASE_FADE = 0;

const clamp = t => Math.max(0,Math.min(1,t));
export function getLiveCamera() {
  return {...FIXED_CAMERA};
}

export function getShowcaseState(elapsed,active=true) {
  const t=Number.isFinite(elapsed)?elapsed:0;
  if(!active||t<T.displayStart||t>=T.displayEnd)return {visible:false,alpha:0,scoreProgress:0};
  // This is the monitor's scoring window, not a full-frame camera transition.
  const scoreProgress=clamp((t-T.displayStart)/1.6);
  return {visible:true,alpha:1,scoreProgress};
}

export function photoToScreen(point,camera) {
  return {x:point.x*camera.scale+camera.tx,y:point.y*camera.scale+camera.ty};
}
