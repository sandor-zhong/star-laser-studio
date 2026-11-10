import { HANDLING_TIMING as T, HANDLING_PHASES } from './handling-cycle.js';

export const PHOTO_SIZE = Object.freeze({ width:941, height:1672 });
export const LIVE_SIZE = Object.freeze({ width:1080, height:1920 });
export const WIDE_CAMERA = Object.freeze({ x:473, y:894, zoom:1.08 });
export const PORTRAIT_CAMERA = Object.freeze({ x:530, y:878, zoom:7.85 });

const clamp = t => Math.max(0,Math.min(1,t));
const smooth = t => {const u=clamp(t);return u*u*u*(u*(u*6-15)+10);};
const mix = (a,b,t) => a+(b-a)*t;

const approachStart=HANDLING_PHASES.find(p=>p.name==='park-for-print').start;
export const SHOWCASE_FADE=.35;
// The machining view fills ~60% of the output width. It returns to the wide
// camera underneath the opaque inspection shot, before the completed disk moves.
export function getLiveCamera(elapsed, active=true) {
  const t=Number.isFinite(elapsed)?Math.max(0,elapsed):0;
  const enter=smooth((t-approachStart)/(T.scanStart-approachStart));
  const leave=smooth((t-T.displayStart-SHOWCASE_FADE)/(T.displayEnd-T.displayStart-2*SHOWCASE_FADE));
  const detail=active?enter*(1-leave):0;
  const zoom=mix(WIDE_CAMERA.zoom,PORTRAIT_CAMERA.zoom,detail);
  const x=mix(WIDE_CAMERA.x,PORTRAIT_CAMERA.x,detail);
  const y=mix(WIDE_CAMERA.y,PORTRAIT_CAMERA.y,detail);
  const scale=Math.max(LIVE_SIZE.width/PHOTO_SIZE.width,LIVE_SIZE.height/PHOTO_SIZE.height)*zoom;
  return {x,y,zoom,detail,scale,tx:LIVE_SIZE.width/2-x*scale,ty:LIVE_SIZE.height/2-y*scale};
}

export function getShowcaseState(elapsed,active=true) {
  const t=Number.isFinite(elapsed)?elapsed:0;
  if(!active||t<T.displayStart||t>=T.displayEnd)return {visible:false,alpha:0,scoreProgress:0};
  const alpha=smooth((t-T.displayStart)/SHOWCASE_FADE)*smooth((T.displayEnd-t)/SHOWCASE_FADE);
  const scoreProgress=clamp((t-T.displayStart-SHOWCASE_FADE)/1.6);
  return {visible:alpha>0,alpha,scoreProgress};
}

export function photoToScreen(point,camera) {
  return {x:point.x*camera.scale+camera.tx,y:point.y*camera.scale+camera.ty};
}
