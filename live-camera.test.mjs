import test from 'node:test';
import assert from 'node:assert/strict';
import { getLiveCamera, getShowcaseState, photoToScreen, WIDE_CAMERA, PORTRAIT_CAMERA, LIVE_SIZE, SHOWCASE_FADE } from './live-camera.js';
import { getHandlingState, HANDLING_TIMING as T, HANDLING_PHASES } from './handling-cycle.js';
import { PRINT_SURFACE, getToolPose, TOOL_PARK } from './scan-path.js';
import { INSPECTION_CAMERA, INSPECTION_TOKEN, INSPECTION_THICKNESS } from './showcase-view.js';

test('the machining portrait fills approximately sixty percent of the live frame',()=>{
  for(const t of [T.scanStart,(T.scanStart+T.scanEnd)/2,T.scanEnd]){
    const camera=getLiveCamera(t),center=photoToScreen(PRINT_SURFACE,camera);
    assert.equal(camera.zoom,PORTRAIT_CAMERA.zoom);
    const widthFraction=PRINT_SURFACE.rx*2*camera.scale/LIVE_SIZE.width;
    assert.ok(widthFraction>=.58&&widthFraction<=.62,`portrait width is ${widthFraction}`);
    assert.ok(center.y>LIVE_SIZE.height*.5&&center.y<LIVE_SIZE.height*.65);
    assert.ok(Math.abs(center.x-LIVE_SIZE.width/2)<1e-6);
  }
});

test('the near-overhead inspection token fills seventy percent of the frame and is nearly circular',()=>{
  const token=INSPECTION_TOKEN;
  const rx=Math.hypot(token.a,token.c),ry=Math.hypot(token.b,token.d);
  const widthFraction=2*rx/LIVE_SIZE.width,aspect=ry/rx;
  assert.ok(widthFraction>=.68&&widthFraction<=.72);
  assert.ok(aspect>=.9&&aspect<=1.05,`inspection aspect is ${aspect}`);
  assert.equal(token.x,LIVE_SIZE.width/2);
  assert.ok(token.x-rx>=0&&token.x+rx<=LIVE_SIZE.width);
  assert.ok(token.y-ry>0&&token.y+ry+INSPECTION_THICKNESS<LIVE_SIZE.height);
  assert.ok(INSPECTION_THICKNESS>0&&INSPECTION_THICKNESS<rx*.05);
  for(const value of Object.values(INSPECTION_CAMERA))assert.ok(Number.isFinite(value));
  assert.ok(INSPECTION_CAMERA.scale>0);
});

test('all carried material and the receiving tray remain in the wide frame',()=>{
  const bounds=[{x:165,y:840},{x:578,y:930},{x:263,y:1118},{x:881,y:1366}];
  for(let t=0;t<=T.total;t+=.01){
    const state=getHandlingState(t);
    if(!state.carried&&t<T.beltIndexStart)continue;
    const camera=getLiveCamera(t);
    assert.equal(camera.zoom,WIDE_CAMERA.zoom,`cropped handling at ${t}`);
    for(const point of bounds){const p=photoToScreen(point,camera);assert.ok(p.x>=0&&p.x<=LIVE_SIZE.width&&p.y>=0&&p.y<=LIVE_SIZE.height);}
  }
});

test('camera transitions are continuous and start the next job without a cut',()=>{
  const times=[...Object.values(T),T.displayStart+SHOWCASE_FADE,T.displayEnd-SHOWCASE_FADE,...HANDLING_PHASES.flatMap(p=>[p.start,p.end])];
  for(const t of times){
    const before=getLiveCamera(t-1e-6),after=getLiveCamera(t+1e-6);
    assert.ok(Math.hypot(after.tx-before.tx,after.ty-before.ty)<.1,`camera jump at ${t}`);
    assert.ok(Math.abs(after.scale-before.scale)<.0001);
    const oldShot=getShowcaseState(t-1e-6),newShot=getShowcaseState(t+1e-6);
    assert.ok(Math.abs(oldShot.alpha-newShot.alpha)<.0001,`inspection cut at ${t}`);
    assert.ok(Math.abs(oldShot.alpha*oldShot.scoreProgress-newShot.alpha*newShot.scoreProgress)<.0001,`visible score jumps at ${t}`);
  }
  assert.deepEqual(getLiveCamera(T.total),getLiveCamera(0));
  assert.deepEqual(getShowcaseState(T.total),getShowcaseState(0));
  assert.deepEqual(getLiveCamera(T.scanStart,false),getLiveCamera(0));
  assert.equal(getShowcaseState((T.displayStart+T.displayEnd)/2,false).visible,false);
});

test('score presentation keeps the same completed token supported with the laser parked',()=>{
  let previousScore=0,fullScoreSeen=false;
  for(let t=T.displayStart;t<T.displayEnd;t+=.02){
    const state=getHandlingState(t),head=getToolPose(t),shot=getShowcaseState(t);
    assert.ok(shot.alpha>=0&&shot.alpha<=1);
    assert.ok(shot.scoreProgress>=previousScore&&shot.scoreProgress<=1);
    previousScore=shot.scoreProgress;
    if(shot.scoreProgress===1)fullScoreSeen=true;
    assert.equal(shot.visible,shot.alpha>0);
    assert.equal(state.partLocation,'fixture');
    assert.equal(state.fixtureOccupied,true);
    assert.equal(state.clamped,1);
    assert.equal(state.carried,null);
    assert.equal(state.vacuum,false);
    assert.equal(state.beltProgress,0);
    assert.equal(head.laser,false);
    assert.equal(head.reveal,1);
    assert.equal(head.x,TOOL_PARK.x);assert.equal(head.y,TOOL_PARK.y);assert.equal(head.lift,TOOL_PARK.lift);
  }
  assert.equal(fullScoreSeen,true);
  for(const t of [T.scanStart,T.displayStart-.01,T.displayEnd,T.total])assert.equal(getShowcaseState(t).visible,false);
});

test('the inspection shot conceals the camera return before unloading starts',()=>{
  const enterComplete=T.displayStart+SHOWCASE_FADE;
  const leaveStart=T.displayEnd-SHOWCASE_FADE;
  assert.ok(Math.abs(getShowcaseState(enterComplete).alpha-1)<1e-10);
  assert.ok(Math.abs(getShowcaseState(leaveStart).alpha-1)<1e-10);
  assert.ok(Math.abs(getLiveCamera(enterComplete).zoom-PORTRAIT_CAMERA.zoom)<1e-10);
  assert.ok(Math.abs(getLiveCamera(leaveStart).zoom-WIDE_CAMERA.zoom)<1e-10);
  assert.equal(getLiveCamera(T.displayEnd).zoom,WIDE_CAMERA.zoom);
  assert.ok(T.displayEnd<=T.unclampStart&&T.unclampEnd<T.fixtureGrip);
});
