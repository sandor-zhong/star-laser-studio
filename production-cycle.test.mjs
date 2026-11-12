import test from 'node:test';
import assert from 'node:assert/strict';
import {PRODUCTION_PHASES as phases,PRODUCTION_TIMING as T,toLegacyElapsed,getFinishedHandling,getProductionClockPose}from './production-cycle.js';
import {HANDLING_TIMING as OLD}from './handling-cycle.js';
import {fixturePose,BELT_LOAD,PRODUCTION_LAYOUT as L}from './production-layout.js';
import {solveArm}from './pick-arm.js';
import {getMonitorState}from './monitor-state.js';
import {getChallengeBoardData}from './challenge-hud.js';
const fixture=fixturePose(),points={fixture:{x:fixture.x,y:fixture.y+L.fixtureGripOffset},beltLoad:BELT_LOAD,park:L.park};
test('cycle has no source trip, starts in the fixture, and shortens finished transfer',()=>{
 assert.equal(T.total,8);assert.ok(T.handoffEnd-T.unclampEnd<1.3);
 assert.equal(toLegacyElapsed(0),OLD.clampStart);assert.equal(toLegacyElapsed(T.total),OLD.total);
 assert.equal(getFinishedHandling(0,points).partLocation,'fixture');
 for(const p of phases)assert.ok(!p.name.includes('source')&&!p.name.includes('to-fixture'));
});
test('time remapping is continuous at every motion boundary',()=>{
 for(const p of phases){assert.ok(p.end>p.start);for(const t of[p.start,p.end])assert.ok(Math.abs(toLegacyElapsed(Math.max(0,t-1e-8))-toLegacyElapsed(Math.min(T.total,t+1e-8)))<1e-5);}
 for(let t=0;t<T.total;t+=.001){const state=getFinishedHandling(t,points);assert.notEqual(state.carried,'blank');assert.notEqual(state.partLocation,'source');if(t<T.unclampEnd)assert.deepEqual(state.armTarget,{...L.park,lift:40});}
});
test('quick finished-only pickup preserves rigid reach and exact suction contact',()=>{
 let previous;
 for(let t=0;t<T.total;t+=.001){const target=getFinishedHandling(t,points).armTarget,arm=solveArm(target,{spindleHeight:108});assert.equal(arm.reachable,true);assert.ok(Math.abs(arm.tip.x-target.x)<1e-6&&Math.abs(arm.tip.y-target.y+target.lift)<1e-6);if(previous)assert.ok(Math.hypot(arm.tip.x-previous.x,arm.tip.y-previous.y)<7);previous=arm.tip;}
});
test('laser, score and shortened production clock finish in the same sample',()=>{
 const active={nickname:'测试',assessment:{score:96830}};
 for(let t=0;t<=T.total;t+=.005){const clock=toLegacyElapsed(t),state=getMonitorState(clock,active),board=getChallengeBoardData({...state,active}),tool=getProductionClockPose(t);if(t<T.scanStart)assert.equal(board.displayScore,null);else if(t<T.scanEnd){assert.equal(board.displayScore,Math.floor(96830*tool.reveal));assert.ok(board.displayScore<96830);}else assert.equal(board.displayScore,96830);if(tool.laser)assert.ok(t>=T.scanStart&&t<T.scanEnd);}
 const done=getChallengeBoardData({...getMonitorState(toLegacyElapsed(T.scanEnd),active),active});assert.equal(done.displayScore,96830);
});
