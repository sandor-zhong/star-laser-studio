// One shared, deterministic production clock. All distances use the photo plane.
import { HANDLING_TIMING, getHandlingState } from './handling-cycle.js';
export const TOOL_TIMING = HANDLING_TIMING;
export const PRINT_SURFACE = Object.freeze({ x:535, y:892, rx:36, ry:17, angle:.015 });
export const LASER_ORIGIN = Object.freeze({ x:644, y:752, nozzleY:740 });
export const RASTER_ROWS = 14;
export const TOOL_PARK = Object.freeze({ x:0, y:0, lift:0 });
export const clamp = (value, low=0, high=1) => Math.min(high,Math.max(low,value));
export const ease = value => { const t=clamp(value); return t*t*t*(t*(t*6-15)+10); };
const mix=(a,b,t)=>a+(b-a)*t;
const interval=(t,start,end)=>clamp((t-start)/(end-start));

export function getRasterSample(progress) {
  const p=clamp(progress), q=Math.min(RASTER_ROWS-1e-8,p*RASTER_ROWS);
  const row=Math.floor(q), segment=q-row, direction=row%2===0?1:-1;
  const travel=clamp(segment/.84), advancing=segment>.84 && row<RASTER_ROWS-1;
  const v=-1+(row+.5)*2/RASTER_ROWS;
  const chord=Math.sqrt(Math.max(0,1-v*v))*.985;
  let u=direction*chord*(2*ease(travel)-1), y=v;
  if(advancing) {
    const blend=ease((segment-.84)/.16), nextV=v+2/RASTER_ROWS;
    const nextChord=Math.sqrt(Math.max(0,1-nextV*nextV))*.985;
    u=direction*mix(chord,nextChord,blend); y=mix(v,nextV,blend);
  }
  return { row, rows:RASTER_ROWS, u, v:y, direction,
    laser:segment<.84 && p<1, rowComplete:travel>=1,
    reveal:p, complete:p>=1 };
}
export function getImpact(sample) {
  const p=PRINT_SURFACE,c=Math.cos(p.angle),s=Math.sin(p.angle);
  return { x:p.x+p.rx*sample.u*c-p.ry*sample.v*s,
    y:p.y+p.rx*sample.u*s+p.ry*sample.v*c };
}
function scanPose(progress) {
  const raster=getRasterSample(progress), impact=getImpact(raster);
  return {x:impact.x-LASER_ORIGIN.x,y:impact.y-LASER_ORIGIN.y,lift:0,
    laser:raster.laser,reveal:clamp(progress),raster,phase:'scan'};
}
const start=scanPose(0),end=scanPose(1);

export function getToolPose(elapsed) {
  const t=Number.isFinite(elapsed)?Math.max(0,elapsed):0;
  const handling=getHandlingState(t),phase=handling.phase;
  if(t<TOOL_TIMING.headLoadStart) return {...TOOL_PARK,laser:false,reveal:0,phase};
  if(t<TOOL_TIMING.scanStart) {
    const u=ease(interval(t,TOOL_TIMING.headLoadStart,TOOL_TIMING.scanStart));
    return {x:mix(0,start.x,u),y:mix(0,start.y,u),lift:0,laser:false,reveal:0,phase};
  }
  if(t<TOOL_TIMING.scanEnd) return scanPose(interval(t,TOOL_TIMING.scanStart,TOOL_TIMING.scanEnd));
  if(t<TOOL_TIMING.retractEnd) return {...end,lift:80*ease(interval(t,TOOL_TIMING.scanEnd,TOOL_TIMING.retractEnd)),laser:false,reveal:1,phase};
  if(t<TOOL_TIMING.headReturnEnd) {
    const u=ease(interval(t,TOOL_TIMING.retractEnd,TOOL_TIMING.headReturnEnd));
    return {x:mix(end.x,0,u),y:mix(end.y,0,u),lift:mix(80,0,u),laser:false,reveal:1,phase};
  }
  return {...TOOL_PARK,laser:false,reveal:1,phase};
}
export function getProductionState(elapsed) {
  const state=getHandlingState(elapsed);
  return {...state,pose:getToolPose(elapsed)};
}
