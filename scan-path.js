// One shared, deterministic production clock. All distances use the photo plane.
import { HANDLING_TIMING, getHandlingState } from './handling-cycle.js';
export const TOOL_TIMING = HANDLING_TIMING;
// Calibrated to the shallow vacuum nest. Its support floor is 3.5px below
// this top face, matching the rendered token's metal sidewall thickness.
export const PRINT_SURFACE = Object.freeze({ x:530, y:891, rx:36, ry:17, angle:.015 });
export const LASER_ORIGIN = Object.freeze({ x:644, y:752, nozzleY:740 });
export const MECHANICAL_ROWS = 16;
export const SUBSCAN_LINES = 4;
export const RASTER_ROWS = MECHANICAL_ROWS * SUBSCAN_LINES;
export const RASTER_STROKE_FRACTION = .9;
export const TOOL_PARK = Object.freeze({ x:0, y:0, lift:0 });
export const clamp = (value, low=0, high=1) => Math.min(high,Math.max(low,value));
export const ease = value => { const t=clamp(value); return t*t*t*(t*(t*6-15)+10); };
const mix=(a,b,t)=>a+(b-a)*t;
const interval=(t,start,end)=>clamp((t-start)/(end-start));

const bands=Array.from({length:MECHANICAL_ROWS},(_,pass)=>{
  const lanes=Array.from({length:SUBSCAN_LINES},(_,index)=>{
    const row=pass*SUBSCAN_LINES+index,v=-1+(row+.5)*2/RASTER_ROWS;
    return {row,v,chord:Math.sqrt(Math.max(0,1-v*v))*.985};
  });
  return {v:-1+(pass+.5)*2/MECHANICAL_ROWS,chord:Math.max(...lanes.map(lane=>lane.chord)),lanes};
});

// Four fine local tracks share each smooth mechanical pass. Their horizontal
// coordinate is the nozzle's current axis; tracks outside the circular stock
// stay blank until that axis enters their chord. Vertical beam deflection is
// bounded to 0.8 photo pixels, so no full-width galvo jump detaches the spot
// from the physical head. A renderer clips each lane's visited portion only.
export function getRasterSample(progress) {
  const p=clamp(progress),q=Math.min(MECHANICAL_ROWS-1e-8,p*MECHANICAL_ROWS);
  const pass=Math.floor(q),segment=q-pass,direction=pass%2===0?1:-1;
  const band=bands[pass],travel=clamp(segment/RASTER_STROKE_FRACTION);
  const rowComplete=travel>=1,advancing=rowComplete&&pass<MECHANICAL_ROWS-1;
  let headU=direction*band.chord*(2*ease(travel)-1),headV=band.v;
  if(advancing){
    const next=bands[pass+1],blend=ease((segment-RASTER_STROKE_FRACTION)/(1-RASTER_STROKE_FRACTION));
    headU=direction*mix(band.chord,next.chord,blend);headV=mix(band.v,next.v,blend);
  }
  const lanes=band.lanes.map(lane=>{
    const progress=rowComplete?1:clamp((direction>0?headU+lane.chord:lane.chord-headU)/(2*lane.chord));
    return {...lane,u:clamp(headU,-lane.chord,lane.chord),direction,progress,
      started:progress>0,complete:progress>=1,
      active:!rowComplete&&p<1&&Math.abs(headU)<=lane.chord+1e-10};
  });
  const footprint=band.lanes.filter(lane=>Math.abs(headU)<=lane.chord+1e-10);
  const v=footprint.length?footprint.reduce((sum,lane)=>sum+lane.v,0)/footprint.length:headV;
  return {row:pass*SUBSCAN_LINES,rows:RASTER_ROWS,pass,passes:MECHANICAL_ROWS,
    u:headU,v,headU,headV,direction,lanes,
    laser:lanes.some(lane=>lane.active),rowComplete,reveal:p,complete:p>=1};
}
export function getImpact(sample) {
  const p=PRINT_SURFACE,c=Math.cos(p.angle),s=Math.sin(p.angle);
  return { x:p.x+p.rx*sample.u*c-p.ry*sample.v*s,
    y:p.y+p.rx*sample.u*s+p.ry*sample.v*c };
}
export function getHeadImpact(sample) {
  return getImpact({u:sample.headU??sample.u,v:sample.headV??sample.v});
}
function scanPose(progress) {
  const raster=getRasterSample(progress),impact=getImpact(raster),head=getHeadImpact(raster);
  return {x:head.x-LASER_ORIGIN.x,y:head.y-LASER_ORIGIN.y,lift:0,impact,
    microImpacts:raster.lanes.filter(lane=>lane.active).map(getImpact),
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
