import test from 'node:test';
import assert from 'node:assert/strict';
import { getLiveCamera, getShowcaseState, photoToScreen, FIXED_CAMERA, LIVE_SIZE, PHOTO_SIZE } from './live-camera.js';
import { getHandlingState, HANDLING_TIMING as T, HANDLING_PHASES } from './handling-cycle.js';
import { getToolPose, TOOL_PARK } from './scan-path.js';
import { BELT, BELT_SLOTS, beltCoin } from './belt-plane.js';

const inFrame = (point, camera, margin=0) => {
  const screen=photoToScreen(point,camera);
  assert.ok(screen.x>=margin&&screen.x<=LIVE_SIZE.width-margin, `horizontal crop at ${JSON.stringify(point)}`);
  assert.ok(screen.y>=margin&&screen.y<=LIVE_SIZE.height-margin, `vertical crop at ${JSON.stringify(point)}`);
};

test('production, scoring, idle and tray exchange share one fixed machine camera',()=>{
  assert.equal(FIXED_CAMERA.scale,1.08);
  assert.equal(FIXED_CAMERA.ty,260);
  assert.equal(FIXED_CAMERA.zoom,1);
  assert.equal(FIXED_CAMERA.detail,0);
  assert.equal(FIXED_CAMERA.x,PHOTO_SIZE.width/2);
  assert.ok(Math.abs(FIXED_CAMERA.tx-31.86)<1e-10);
  assert.ok(Math.abs(FIXED_CAMERA.y-(960-260)/1.08)<1e-10);
  for(let t=0;t<=T.total;t+=.01){
    assert.deepEqual(getLiveCamera(t,true),FIXED_CAMERA);
    assert.deepEqual(getLiveCamera(t,false),FIXED_CAMERA);
  }
  for(const t of [undefined,NaN,Infinity,-1,T.total+100])assert.deepEqual(getLiveCamera(t),FIXED_CAMERA);
  const snapshot=getLiveCamera();snapshot.scale=0;
  assert.equal(getLiveCamera().scale,1.08);
});

test('the complete machine and docked collector fit below the monitor area',()=>{
  const camera=getLiveCamera();
  const machineTop=photoToScreen({x:85,y:342},camera);
  const trayBottom=photoToScreen({x:890,y:1369},camera);
  assert.ok(Math.abs(machineTop.y-629.36)<1e-8);
  assert.ok(machineTop.y>600);
  assert.ok(Math.abs(trayBottom.y-1738.52)<1e-8);
  for(const point of [{x:85,y:342},{x:808,y:342},{x:114,y:1320},{x:808,y:1320},
    {x:548,y:1211},{x:890,y:1369}])inFrame(point,camera);
});

test('all carried workpieces and indexed belt stock remain in the fixed frame',()=>{
  const camera=getLiveCamera();
  for(let t=0;t<=T.total;t+=.01){
    const state=getHandlingState(t);
    if(state.carried){
      const center={x:state.armTarget.x,y:state.armTarget.y-state.armTarget.lift};
      for(const [dx,dy] of [[-44,0],[44,0],[0,-25],[0,25]])inFrame({x:center.x+dx,y:center.y+dy},camera);
    }
    for(const slot of BELT_SLOTS){
      const p=beltCoin(slot.u+state.beltProgress*BELT.slotStep);
      const rx=Math.hypot(p.a,p.c),ry=Math.hypot(p.b,p.d);
      for(const [dx,dy] of [[-rx,0],[rx,0],[0,-ry],[0,ry]])inFrame({x:p.x+dx,y:p.y+dy},camera);
    }
  }
});

test('the monitor scoring window keeps its physical workpiece supported in the fixture',()=>{
  let previousScore=0,fullScoreSeen=false;
  for(let t=T.displayStart;t<T.displayEnd;t+=.02){
    const state=getHandlingState(t),head=getToolPose(t),score=getShowcaseState(t);
    assert.equal(score.visible,true);assert.equal(score.alpha,1);
    assert.ok(score.scoreProgress>=previousScore&&score.scoreProgress<=1);
    previousScore=score.scoreProgress;
    if(score.scoreProgress===1)fullScoreSeen=true;
    assert.equal(state.partLocation,'fixture');assert.equal(state.fixtureOccupied,true);
    assert.equal(state.clamped,1);assert.equal(state.carried,null);assert.equal(state.vacuum,false);
    assert.equal(state.beltProgress,0);assert.equal(head.laser,false);assert.equal(head.reveal,1);
    assert.equal(head.x,TOOL_PARK.x);assert.equal(head.y,TOOL_PARK.y);assert.equal(head.lift,TOOL_PARK.lift);
    assert.deepEqual(getLiveCamera(t),FIXED_CAMERA);
  }
  assert.equal(fullScoreSeen,true);
  for(const t of [T.scanStart,T.displayStart-.01,T.displayEnd,T.total])assert.equal(getShowcaseState(t).visible,false);
  assert.equal(getShowcaseState((T.displayStart+T.displayEnd)/2,false).visible,false);
});

test('every phase boundary and the next cycle have the identical camera transform',()=>{
  for(const t of [...Object.values(T),...HANDLING_PHASES.flatMap(p=>[p.start,p.end])]){
    assert.deepEqual(getLiveCamera(t-1e-6),getLiveCamera(t+1e-6));
  }
  assert.deepEqual(getLiveCamera(T.total,true),getLiveCamera(0,true));
  assert.deepEqual(getLiveCamera(T.total,false),getLiveCamera(0,true));
  assert.deepEqual(getShowcaseState(T.total),getShowcaseState(0));
});
