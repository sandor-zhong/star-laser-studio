import { makeAvatar } from './art.js';
import { TOOL_TIMING as LEGACY_T, ease, clamp } from './scan-path.js';
import { PRODUCTION_TIMING as T, toLegacyElapsed, getFinishedHandling } from './production-cycle.js';
import { CellInventory } from './cell-inventory.js';
import { drawPickArm } from './pick-arm.js';
import { drawMetalCoin } from './coin-material.js';
import { getMonitorState } from './monitor-state.js';
import { drawLaserContact } from './laser-effects.js';
import { drawChallengeHud, getChallengeBoardData } from './challenge-hud.js';
import { createChallengeAssessment, normalizeChallengeAssessment, formatChallengeScore } from './challenge-score.js';
import { PRODUCTION_LAYOUT as L, BELT_SLOTS, BELT_STEP, BELT_LOAD, fixturePose, beltPose, collectorPose, getOutletPose } from './production-layout.js';
import { getProductionTool, projectMacroTool, MACRO_FEED, MACRO_SCREEN } from './production-optics.js';

export const LIVE_WIDTH=1080, LIVE_HEIGHT=1920;
export { collectorPose } from './production-layout.js';
const CAMERA=Object.freeze({scale:LIVE_WIDTH/L.width,tx:0,ty:0,detail:0});
const loadImage=async url=>{const im=new Image();im.src=url;await im.decode();return im;};
const [background,reference,spindle]=await Promise.all([
 loadImage('./assets/challenge-through-belt-v2.png'),loadImage('./output/structure-concept-v3.png'),
 loadImage('./assets/spindle-layer.png'),
]);
const fixture=fixturePose(),gripOffset=L.fixtureGripOffset,gripFixture={...fixture,y:fixture.y+gripOffset};
const points={fixture:gripFixture,beltLoad:BELT_LOAD,park:L.park};
const blend=(a,b,u)=>Object.fromEntries(['x','y','a','b','c','d'].map(k=>[k,a[k]+(b[k]-a[k])*u]));
const polygon=(c,pts)=>{c.beginPath();c.moveTo(...pts[0]);for(const p of pts.slice(1))c.lineTo(...p);c.closePath();};
const FONT='"Microsoft YaHei","Segoe UI",sans-serif';
// A workpiece keeps its identity and score throughout the physical cycle.
export class LaserScene {
 constructor(container,{demoStock=true}={}){
  this.canvas=document.createElement('canvas');this.canvas.width=LIVE_WIDTH;this.canvas.height=LIVE_HEIGHT;
  this.canvas.setAttribute('role','img');this.canvas.setAttribute('aria-label','1080乘1920立式头像激光雕刻直播画面');
  container.append(this.canvas);this.ctx=this.canvas.getContext('2d',{alpha:false});this.ctx.imageSmoothingQuality='high';
  this.defaults=[0,1,2].map(seed=>makeAvatar('示例作品',seed));
  this.inventory=new CellInventory(demoStock?this.defaults:[],24,{initialAssessments:demoStock?this.defaults.map(()=>createChallengeAssessment()):[],outputMode:'through'});
  this.elapsed=0;this.beltOffset=0;this.paused=false;this.frozenTime=0;this.closeupEnabled=true;
  this.assessment=null;this.nickname='';this.completedRecords=[];this.completedCount=0;this.sessionState=null;
  this.update(0,0);
 }
 canStart(){return this.inventory.canStart();}
 setCloseup(enabled){this.closeupEnabled=Boolean(enabled);}
 setSessionState({completedCount=0,ranking=[]}={}){this.sessionState={completedCount:Math.max(0,Number(completedCount)||0),ranking:Array.isArray(ranking)?ranking.slice(0,10):[]};}
 prepare(portrait,{nickname='',assessment=null}={}){
  if(!this.canStart())return false;
  const score=normalizeChallengeAssessment(assessment)??createChallengeAssessment();
  if(!this.inventory.begin(portrait,{assessment:score,nickname}))return false;
  this.elapsed=0;this.assessment=this.inventory.active.assessment;this.nickname=String(nickname);return true;
 }
 updateEngraving(elapsed){this.elapsed=clamp(Number.isFinite(elapsed)?elapsed:0,0,T.total);}
 complete(){
  const record=this.inventory.active;if(!record)return;
  this.completedRecords.push(record);this.completedCount++;
  this.completedRecords.sort((a,b)=>b.assessment.score-a.assessment.score);this.completedRecords=this.completedRecords.slice(0,10);
  this.inventory.commit();this.beltOffset+=BELT_STEP;this.elapsed=T.total;
 }
 requestTrayExchange(){return {status:'not-required',count:0};}
 clearCollector(){return this.requestTrayExchange();}
 advanceTrayExchange(){}
 trayState(){return {phase:'through-belt',busy:false,queued:false,offsetX:0,offsetY:0,exchangedCount:this.exchangedCount,exchanges:0};}
 get exchangedCount(){return this.inventory.exitedCount;}
 get exchangeCount(){return 0;}
 reset(){this.inventory.reset();this.elapsed=0;this.beltOffset=0;this.assessment=null;this.nickname='';this.completedRecords=[];this.completedCount=0;this.sessionState=null;}
 get collectorCount(){return this.inventory.collector.length;}
 get collectorCapacity(){return 0;}
 getState(){return this.inventory.active?getFinishedHandling(this.elapsed,points):{phase:'idle',armTarget:{...L.park,lift:40},vacuum:false,carried:null,partLocation:null,sourceConsumed:false,placedOnBelt:false,beltProgress:0,chuteProgress:0,clamped:0};}
 activePose(state){
  if(state.partLocation==='fixture')return fixture;
  if(state.partLocation==='belt')return beltPose(BELT_LOAD.u+state.beltProgress*BELT_STEP);
  const t=state.armTarget,from=gripFixture,to=BELT_LOAD;
  const dx=to.x-from.x,dy=to.y-from.y,u=clamp(((t.x-from.x)*dx+(t.y-from.y)*dy)/(dx*dx+dy*dy));
  return {...blend(fixture,BELT_LOAD,u),x:t.x,y:t.y-t.lift-gripOffset*(1-u)};
 }
 outgoingPose(state=this.getState()){
  const pose=getOutletPose({t:toLegacyElapsed(this.elapsed),beltProgress:state.beltProgress});
  return {pose,location:pose.phase};
 }
 drawCoin(image,p,{blank=false,raster=null,thickness=4.5,cache=true}={}){drawMetalCoin(this.ctx,image,p,{blank,raster,thickness,cache});}
 drawBelt(state){
  const c=this.ctx,v=L.belt.corners;c.save();polygon(c,[v.rearLeft,v.rearRight,v.frontRight,v.frontLeft].map(p=>[p.x,p.y]));c.clip();
  c.strokeStyle='#bca46716';c.lineWidth=1;const shift=(this.beltOffset+state.beltProgress*BELT_STEP)%1;
  for(let i=-24;i<35;i++){const u=i/28+shift/12;if(u<0||u>1)continue;const a=beltPose(u,0).contact,b=beltPose(u,1).contact;c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();}c.restore();
  const belt=this.inventory.belt;for(let i=1;i<4;i++)if(belt[i]){
   const out=i===3&&this.inventory.active?this.outgoingPose(state):{pose:beltPose(BELT_SLOTS[i].u+state.beltProgress*BELT_STEP),location:'belt'};
   this.drawProductShadow(out.pose);this.drawCoin(belt[i].portrait,out.pose,{thickness:7,cache:state.beltProgress===0||state.beltProgress===1});
  }
 }
 drawActive(state,tool){
  const active=this.inventory.active;if(!active||state.partLocation==='source')return;const pose=this.activePose(state);if(state.partLocation==='belt')this.drawProductShadow(pose);
  if(this.closeupEnabled&&state.partLocation==='fixture'){
   const c=this.ctx,r=Math.hypot(pose.a,pose.c);c.save();c.strokeStyle='#ffc34f';c.shadowColor='#ff9c11';c.shadowBlur=14;c.lineWidth=2;c.beginPath();c.ellipse(pose.x,pose.y,r+2,Math.hypot(pose.b,pose.d)+2,0,0,Math.PI*2);c.stroke();c.restore();
  }
  this.drawCoin(active.portrait,pose,{blank:this.elapsed<T.scanStart,raster:state.partLocation==='fixture'?tool.raster:null,thickness:state.partLocation==='belt'?7:4.5,cache:state.partLocation==='fixture'});
 }
 drawProductShadow(p){
  const c=this.ctx;c.save();c.translate(p.x,p.y+7);c.scale(Math.hypot(p.a,p.c)/70,Math.hypot(p.b,p.d)/70);
  const shadow=c.createRadialGradient(0,0,44,0,0,84);shadow.addColorStop(0,'#000b');shadow.addColorStop(1,'#0000');c.fillStyle=shadow;c.fillRect(-85,-85,170,170);c.restore();
 }
 drawPedestal(){
  const c=this.ctx,g=c.createLinearGradient(197,0,245,0);g.addColorStop(0,'#454947');g.addColorStop(.25,'#b9afa1');g.addColorStop(.48,'#ddd3bf');g.addColorStop(.7,'#6f726a');g.addColorStop(1,'#292f2d');c.fillStyle=g;c.fillRect(198,735,46,91);c.strokeStyle='#191f1c';c.lineWidth=3;c.strokeRect(198,735,46,91);
  for(const y of [749,785,818]){c.strokeStyle='#dfd5b880';c.lineWidth=1;c.beginPath();c.ellipse(221,y,23,5,0,0,Math.PI);c.stroke();}
 }
 drawHead(tool){
  const c=this.ctx,{tip,angle}=tool,scale=.19,rear={x:tip.x+Math.sin(angle)*135,y:tip.y-Math.cos(angle)*135};c.save();
  c.strokeStyle='#111a1b';c.lineWidth=21;c.beginPath();c.moveTo(rear.x,540);c.lineTo(rear.x,rear.y);c.stroke();c.strokeStyle='#a7aaa0';c.lineWidth=8;c.stroke();c.strokeStyle='#323c38';c.lineWidth=2;c.stroke();
  c.fillStyle='#383c36';c.fillRect(rear.x-27,516,54,45);c.strokeStyle='#b6aa8c';c.lineWidth=1;c.strokeRect(rear.x-27,516,54,45);
  c.strokeStyle='#071b1c';c.lineWidth=6;c.beginPath();c.moveTo(rear.x-18,523);c.bezierCurveTo(rear.x+38,530,rear.x+25,rear.y-40,rear.x+8,rear.y);c.stroke();c.strokeStyle='#739087';c.lineWidth=1;c.stroke();
  c.translate(tip.x,tip.y);c.rotate(angle);c.scale(scale,scale);c.translate(-536,-1460);c.beginPath();c.rect(350,720,400,780);c.clip();c.drawImage(spindle,0,0);c.restore();
 }
 beltScores(state=this.getState(),camera=CAMERA){
  const labels=[],add=(p,pose)=>{if(!p?.assessment)return;labels.push({id:p.id,score:p.assessment.score,x:(pose.x+Math.hypot(pose.a,pose.c)+12)*camera.scale,y:(pose.y+8)*camera.scale,alpha:1});};
  const belt=this.inventory.belt;for(let i=1;i<4;i++)if(belt[i]){const out=i===3&&this.inventory.active?this.outgoingPose(state):{pose:beltPose(BELT_SLOTS[i].u+state.beltProgress*BELT_STEP),location:'belt'};if(out.location==='belt')add(belt[i],out.pose);}
  if(this.inventory.active&&state.partLocation==='belt')add(this.inventory.active,this.activePose(state));return labels;
 }
 drawBeltScores(state){
  const c=this.ctx;c.save();c.setTransform(1,0,0,1,0,0);c.textAlign='left';c.textBaseline='middle';
  const top=this.ranking()[0]?.assessment?.score;
  for(const p of this.beltScores(state)){const best=p.score===top,width=best?235:205,x=Math.min(1040-width,p.x-12),y=p.y;
   c.fillStyle='#322006eb';c.strokeStyle='#ffce56';c.lineWidth=2;c.shadowColor='#ff8b00';c.shadowBlur=17;c.beginPath();c.roundRect(x,y-29,width,58,17);c.fill();c.stroke();
   c.fillStyle='#fff09a';c.font=`700 ${best?32:29}px ${FONT}`;c.fillText(`${best?'♛ ':''}${formatChallengeScore(p.score)}分`,x+14,y+1);c.shadowBlur=0;}c.restore();
 }
 monitorState(state=this.getState()){
  const m=getMonitorState(toLegacyElapsed(this.elapsed),this.inventory.active,{paused:this.paused}),tool=getProductionTool(this.inventory.active?toLegacyElapsed(this.elapsed):LEGACY_T.total);
  return {...m,visible:false,style:'main-workcell',giftFocus:this.closeupEnabled,screen:{...MACRO_SCREEN},feed:{...MACRO_FEED},connector:{from:{x:MACRO_SCREEN.x+MACRO_SCREEN.width*.88,y:MACRO_SCREEN.y+MACRO_SCREEN.height},to:{x:tool.tip.x*CAMERA.scale,y:tool.tip.y*CAMERA.scale},visible:false}};
 }
 ranking(){return this.sessionState?.ranking??this.completedRecords;}
 diagnostics(state=this.getState()){
  const s=this.inventory.snapshot(),owners=[];s.collector.forEach(p=>owners.push({id:p.id,location:'collector'}));s.belt.forEach((p,i)=>{if(p)owners.push({id:p.id,location:i===3&&s.active?this.outgoingPose(state).location:'belt'});});if(s.active)owners.push({id:s.active.id,location:state.partLocation});
  const tool=getProductionTool(s.active?toLegacyElapsed(this.elapsed):LEGACY_T.total),monitor=this.monitorState(state);
  const scoring=getChallengeBoardData({...monitor,active:s.active});
  return {phase:state.phase,elapsed:this.elapsed,held:state.carried,vacuum:state.vacuum,collector:this.collectorCount,capacity:this.collectorCapacity,owners,stockUnique:new Set(owners.map(p=>p.id)).size===owners.length,camera:{...CAMERA},rating:monitor.score===null?null:this.assessment,scoring:{displayed:scoring.displayScore,final:scoring.score,progress:scoring.scoreProgress,complete:Boolean(s.active&&tool.reveal>=1)},outputMode:'through',exited:this.exchangedCount,monitor,monitorLaser:this.monitorLaser,tool:{tip:tool.tip,impact:tool.impact,laser:tool.laser},toolReveal:s.active?tool.reveal:0,beltScores:this.beltScores(state),tray:this.trayState(),ranking:this.ranking().map(p=>({id:p.id,nickname:p.nickname,score:p.assessment?.score})),assessmentMode:'random'};
 }
 update(delta,now){
  if(this.paused)now=this.frozenTime;else this.frozenTime=now;
  const c=this.ctx,state=this.getState(),tool=getProductionTool(this.inventory.active?toLegacyElapsed(this.elapsed):LEGACY_T.total);
  c.setTransform(CAMERA.scale,0,0,CAMERA.scale,0,0);c.drawImage(background,0,0,L.width,L.height);
  this.drawBelt(state);this.drawActive(state,tool);this.drawPedestal();this.drawHead(tool);
  drawPickArm(c,reference,state.armTarget,{vacuum:state.vacuum,spindleHeight:108});
  drawLaserContact(c,{tip:tool.tip,impact:tool.impact,time:now,active:tool.laser,paused:this.paused,scale:.65});
  this.drawBeltScores(state);this.monitorLaser={...projectMacroTool(tool),on:false};
  c.setTransform(1,0,0,1,0,0);const monitor=this.monitorState(state);
  drawChallengeHud(c,{...monitor,active:this.inventory.active,ranking:this.ranking(),completedCount:this.sessionState?.completedCount??this.completedCount});
 }
}
