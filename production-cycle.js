import { HANDLING_TIMING as OLD, getHandlingState } from './handling-cycle.js';
import { getToolPose } from './scan-path.js';
// No raw-stock trip: a blank starts in the processing fixture. The arm only
// visits the finished workpiece, then places it directly on the moving belt.
const entries=[
 ['clamp',0,.15,OLD.clampStart,OLD.clampEnd],
 ['head-load',.15,.40,OLD.headLoadStart,OLD.scanStart],
 ['scan',.40,4,OLD.scanStart,OLD.scanEnd],
 ['head-retract',4,4.15,OLD.scanEnd,OLD.retractEnd],
 ['head-return',4.15,4.35,OLD.retractEnd,OLD.headReturnEnd],
 ['show-finished',4.35,5.75,OLD.displayStart,OLD.displayEnd],
 ['unclamp',5.75,5.85,OLD.unclampStart,OLD.unclampEnd],
 ['approach-fixture',5.85,6.05,12.75,13.2],
 ['lower-for-pickup',6.05,6.15,13.2,13.5],
 ['grip-finished',6.15,6.21,13.5,13.65],
 ['lift-finished',6.21,6.31,13.65,13.95],
 ['transfer-to-belt',6.31,6.64,13.95,14.7],
 ['lower-to-belt',6.64,6.75,14.7,15],
 ['release-belt',6.75,6.81,15,15.15],
 ['retract-from-belt',6.81,6.92,15.15,15.45],
 ['park-after-unload',6.92,7.10,15.45,16],
 ['belt-index',7.10,7.75,OLD.beltIndexStart,OLD.indexEnd],
 ['chute-delivery',7.75,7.85,OLD.indexEnd,OLD.chuteEnd],
 ['settle',7.85,8,OLD.chuteEnd,OLD.total],
];
export const PRODUCTION_PHASES=Object.freeze(entries.map(([name,start,end])=>Object.freeze({name,start,end})));
export const PRODUCTION_TIMING=Object.freeze({clampStart:0,clampEnd:.15,headLoadStart:.15,scanStart:.4,scanEnd:4,retractEnd:4.15,headReturnEnd:4.35,displayStart:4.35,displayEnd:5.75,unclampStart:5.75,unclampEnd:5.85,fixtureGrip:6.15,fixtureLiftStart:6.21,beltRelease:6.75,handoffEnd:7.10,beltIndexStart:7.10,indexEnd:7.75,chuteEnd:7.85,total:8});
export function toLegacyElapsed(elapsed=0){
 const t=Math.min(8,Math.max(0,Number.isFinite(elapsed)?elapsed:0));
 const [,start,end,from,to]=entries.find(e=>t<e[2])??entries.at(-1);
 return from+(to-from)*(t-start)/(end-start);
}
export function getFinishedHandling(elapsed,points){return getHandlingState(toLegacyElapsed(elapsed),points);}
export function getProductionClockPose(elapsed){return getToolPose(toLegacyElapsed(elapsed));}
