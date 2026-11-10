import { makeAvatar } from './art.js';
import { getToolPose, PRINT_SURFACE, LASER_ORIGIN, TOOL_TIMING, ease, clamp } from './scan-path.js';
import { getHandlingState } from './handling-cycle.js';
import { BELT, BELT_SLOTS, BELT_LOAD, beltCoin } from './belt-plane.js';
import { CellInventory } from './cell-inventory.js';
import { drawPickArm } from './pick-arm.js';
import { getLiveCamera, getShowcaseState } from './live-camera.js';
import { INSPECTION_CAMERA, INSPECTION_TOKEN, INSPECTION_THICKNESS } from './showcase-view.js';
import { analyzePortrait } from './portrait-score.js';
import { drawScoreOverlay } from './score-overlay.js';
import { drawMetalCoin } from './coin-material.js';
import { getTrayExchangePose } from './tray-exchange.js';

export const LIVE_WIDTH=1080, LIVE_HEIGHT=1920;
const W=941,H=1672;
const loadImage=async url=>{const im=new Image();im.src=url;await im.decode();return im;};
const assessPortrait=portrait=>{
 const canvas=document.createElement('canvas');canvas.width=canvas.height=320;
 const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(portrait,0,0,320,320);
 return analyzePortrait(c.getImageData(0,0,320,320));
};
const [background,reference,spindle,inspectionPhoto,machiningPhoto,trayPhoto]=await Promise.all([
 loadImage('./assets/workcell-exchange-base-v1.png'),loadImage('./output/structure-concept-v3.png'),
 loadImage('./assets/spindle-layer.png'),
 loadImage('./assets/portrait-inspection-camera-v1.png'),
 loadImage('./assets/machining-detail-plate-v1.png'),
 loadImage('./assets/receiving-tray-layer-v1.png'),
]);
const machiningCamera=getLiveCamera(TOOL_TIMING.scanStart);
const machiningScale=LIVE_WIDTH/machiningPhoto.width;
const machiningTop=1108-992*machiningScale;
const mix=(a,b,t)=>a+(b-a)*t;
const vectorPose=(x,y,rx,ry,angle=0)=>({x,y,a:Math.cos(angle)*rx,b:Math.sin(angle)*rx,c:-Math.sin(angle)*ry,d:Math.cos(angle)*ry});
const fixturePose=vectorPose(PRINT_SURFACE.x,PRINT_SURFACE.y,PRINT_SURFACE.rx,PRINT_SURFACE.ry,PRINT_SURFACE.angle);
const sourcePose=vectorPose(239,964,31,15,.10);
const parkPoint={x:360,y:900};
const points={source:sourcePose,fixture:fixturePose,beltLoad:BELT_LOAD,park:parkPoint};
const mixPose=(a,b,t)=>Object.fromEntries(['x','y','a','b','c','d'].map(key=>[key,mix(a[key],b[key],t)]));
const slidePose=(p,x,y)=>({...p,x,y});
const cubic=(a,b,c,d,t)=>(1-t)**3*a+3*(1-t)**2*t*b+3*(1-t)*t*t*c+t**3*d;
const invEase=value=>{let a=0,b=1;for(let i=0;i<30;i++){const m=(a+b)/2;if(ease(m)<value)a=m;else b=m;}return(a+b)/2;};
const outgoingThreshold=(1-BELT_SLOTS[3].u)/BELT.slotStep;
const outgoingStart=TOOL_TIMING.beltIndexStart+(TOOL_TIMING.indexEnd-TOOL_TIMING.beltIndexStart)*invEase(outgoingThreshold);
const chuteEntry=vectorPose(734,1142,41,24,-.025);
const chuteLip=vectorPose(785,1220,42,26,.04);

export function collectorPose(index) {
 const spots=[[792,1294],[714,1300],[635,1303],[786,1259],[708,1264],[630,1268]];
 const [x,y]=spots[index%spots.length],level=Math.floor(index/spots.length);
 return vectorPose(x,y-level*4.5,40.5,21.5,-.05);
}

export class LaserScene {
 constructor(container) {
  this.container=container;this.canvas=document.createElement('canvas');
  this.canvas.width=LIVE_WIDTH;this.canvas.height=LIVE_HEIGHT;
  this.canvas.setAttribute('aria-label','1080乘1920自动上下料雕刻工作站：取料、加工、输送与收料');this.canvas.setAttribute('role','img');
  container.append(this.canvas);this.ctx=this.canvas.getContext('2d',{alpha:false});this.ctx.imageSmoothingQuality='high';
  this.defaults=[0,1,2].map(seed=>makeAvatar('示例作品',seed));
  this.inventory=new CellInventory(this.defaults,24,{initialAssessments:this.defaults.map(assessPortrait)});this.elapsed=0;this.beltOffset=0;this.paused=false;this.frozenTime=0;
  this.trayExchange=null;this.pendingCollectorClear=false;this.exchangedCount=0;this.exchangeCount=0;
  this.update(0,0);
 }
 canStart(){return !this.trayExchange&&!this.pendingCollectorClear&&this.inventory.canStart();}
 prepare(portrait,{nickname=''}={}){
  if(!this.canStart())return false;
  const assessment=assessPortrait(portrait);
  if(!this.inventory.begin(portrait,{assessment,nickname}))return false;
  this.elapsed=0;this.assessment=assessment;this.nickname=String(nickname);return true;
 }
 updateEngraving(elapsed){this.elapsed=Math.max(0,Math.min(TOOL_TIMING.total,elapsed));}
 complete(){
  if(!this.inventory.active)return;
  this.inventory.commit();this.beltOffset+=BELT.slotStep;this.elapsed=TOOL_TIMING.total;
  if(this.pendingCollectorClear||this.collectorCount>=this.collectorCapacity)this.startTrayExchange();
 }
 requestTrayExchange(){
  if(this.trayExchange||this.pendingCollectorClear)return {status:'busy',count:this.collectorCount};
  if(!this.collectorCount&&!this.inventory.active)return {status:'empty',count:0};
  this.pendingCollectorClear=true;
  if(this.inventory.active)return {status:'queued',count:this.collectorCount};
  this.startTrayExchange();return {status:'started',count:this.collectorCount};
 }
 clearCollector(){return this.requestTrayExchange();}
 startTrayExchange(){
  if(this.inventory.active||this.trayExchange)return;
  this.pendingCollectorClear=false;this.trayExchange={elapsed:0,transferred:false,count:this.collectorCount};
 }
 advanceTrayExchange(delta){
  if(!this.trayExchange||this.paused)return;
  const exchange=this.trayExchange;exchange.elapsed+=clamp(Number.isFinite(delta)?delta:0,0,.1);
  const pose=getTrayExchangePose(exchange.elapsed);
  if(pose.transferReady&&!exchange.transferred){
   this.exchangedCount+=this.inventory.clearCollector().length;exchange.transferred=true;
  }
  if(pose.complete){this.trayExchange=null;this.exchangeCount++;}
 }
 trayState(){
  const pose=this.trayExchange?getTrayExchangePose(this.trayExchange.elapsed):{phase:'ready',offsetX:0,loaded:true,transferReady:false,complete:true};
  return {...pose,offsetY:-pose.offsetX*.018,busy:Boolean(this.trayExchange),queued:this.pendingCollectorClear,elapsed:this.trayExchange?.elapsed??0,exchangedCount:this.exchangedCount,exchanges:this.exchangeCount};
 }
 reset(){this.inventory.reset();this.elapsed=0;this.beltOffset=0;this.pendingCollectorClear=false;this.trayExchange=null;this.exchangedCount=0;this.exchangeCount=0;this.assessment=null;this.nickname='';}
 get collectorCount(){return this.inventory.collector.length;}
 get collectorCapacity(){return this.inventory.capacity;}
 getState(){return this.inventory.active?getHandlingState(this.elapsed,points):{
  phase:'idle',armTarget:{...parkPoint,lift:40},vacuum:false,carried:null,partLocation:null,sourceConsumed:false,placedOnBelt:false,beltProgress:0,chuteProgress:0,clamped:0,
 };}

 drawShadow(p,lift=0) {
  const c=this.ctx,r=64;c.save();c.transform(p.a/r,p.b/r,p.c/r,p.d/r,p.x,p.y+4);
  c.scale(1+lift*.002,1+lift*.002);const g=c.createRadialGradient(0,0,35,0,0,76);
  g.addColorStop(0,`rgba(0,0,0,${Math.max(.06,.26-lift*.004)})`);g.addColorStop(1,'#00000000');c.fillStyle=g;c.fillRect(-85,-85,170,170);c.restore();
 }
 drawCoin(image,p,{raster=null,blank=false,shadow=true,thickness=3.5,cache=true}={}) {
  if(shadow)this.drawShadow(p);
  drawMetalCoin(this.ctx,image,p,{raster,blank,thickness,cache});
 }

 drawFeeder(state) {
  const c=this.ctx,active=this.inventory.active;
  const advance=active&&state.sourceConsumed?ease((this.elapsed-TOOL_TIMING.sourceLiftStart)/.55):0;
  c.save();c.beginPath();c.moveTo(173,847);c.lineTo(234,844);c.lineTo(277,987);c.lineTo(210,998);c.closePath();c.clip();
  for(let i=3;i>=1;i--){const x=sourcePose.x-i*10+advance*10,y=sourcePose.y-i*44+advance*44;
   this.drawCoin(null,vectorPose(x,y,31-i*.9,15-i*.4,.1),{blank:true});}
  if(!active||!state.sourceConsumed)this.drawCoin(null,sourcePose,{blank:true});c.restore();
 }

 activePose(state) {
  if(state.partLocation==='source')return sourcePose;
  if(state.partLocation==='fixture')return fixturePose;
  if(state.partLocation==='belt')return beltCoin(BELT_LOAD.u+state.beltProgress*BELT.slotStep);
  const t=state.armTarget;
  const from=state.carried==='blank'?sourcePose:fixturePose,to=state.carried==='blank'?fixturePose:BELT_LOAD;
  const vx=to.x-from.x,vy=to.y-from.y;
  const u=clamp(((t.x-from.x)*vx+(t.y-from.y)*vy)/(vx*vx+vy*vy));
  return {...mixPose(from,to,u),x:t.x,y:t.y-t.lift};
 }
 drawActive(state,pose) {
  const active=this.inventory.active;if(!active||state.partLocation==='source')return;
  const p=this.activePose(state);
  if(state.partLocation==='gripper')this.drawShadow({...p,y:p.y+state.armTarget.lift},state.armTarget.lift);
  const blank=this.elapsed<TOOL_TIMING.scanStart;
  const moving=state.partLocation==='gripper'||(state.partLocation==='belt'&&state.beltProgress>0&&state.beltProgress<1);
  this.drawCoin(active.portrait,p,{blank,raster:state.partLocation==='fixture'?pose.raster:null,shadow:state.partLocation!=='gripper',cache:!moving});
 }

 outgoingPose(state) {
  const t=this.elapsed,start=beltCoin(1);
  if(t<=outgoingStart)return {pose:beltCoin(BELT_SLOTS[3].u+state.beltProgress*BELT.slotStep),location:'belt'};
  if(t<TOOL_TIMING.indexEnd){const u=ease((t-outgoingStart)/(TOOL_TIMING.indexEnd-outgoingStart));return {pose:mixPose(start,chuteEntry,u),location:'chute'};}
  const target=collectorPose(this.inventory.collector.length);
  const u=clamp((t-TOOL_TIMING.indexEnd)/(TOOL_TIMING.chuteEnd-TOOL_TIMING.indexEnd));
  if(u<.48)return {pose:mixPose(chuteEntry,chuteLip,ease(u/.48)),location:'chute'};
  // First fall beneath the fixed outlet, then slide on the tray floor. Stock
  // cannot steer sideways in mid-air to reach a receiving position.
  const landing=vectorPose(788,1257,40.5,21.5,-.05);
  if(u<.73){const v=(u-.48)/.25,p=mixPose(chuteLip,landing,v);p.y=cubic(chuteLip.y,1224,1246,landing.y,v);return {pose:p,location:'chute'};}
  const v=ease((u-.73)/.27),p=mixPose(landing,target,v);
  return {pose:p,location:u>=1?'collector':'chute'};
 }

 drawCollector() {
  const pieces=this.inventory.collector,c=this.ctx,tray=this.trayState();
  c.save();c.translate(tray.offsetX,tray.offsetY);
  const order=pieces.map((_,i)=>i).sort((a,b)=>collectorPose(a%6).y-collectorPose(b%6).y||a-b);
  for(const i of order)this.drawCoin(pieces[i].portrait,collectorPose(i));
  c.restore();
 }
 drawTraySupport(){
  const c=this.ctx;c.save();
  for(const y of [1263,1353]){
   const g=c.createLinearGradient(0,y-3,0,y+5);g.addColorStop(0,'#6d716e');g.addColorStop(.18,'#d5d5c9');g.addColorStop(.4,'#676e69');g.addColorStop(.6,'#292e2b');g.addColorStop(1,'#a0a498');
   c.fillStyle='#00000042';c.beginPath();c.moveTo(562,y+6);c.lineTo(1000,y-2);c.lineTo(1000,y+7);c.lineTo(562,y+15);c.closePath();c.fill();
   c.fillStyle=g;c.beginPath();c.moveTo(562,y-3);c.lineTo(1000,y-11);c.lineTo(1000,y-3);c.lineTo(562,y+5);c.closePath();c.fill();
  }
  c.restore();
 }
 drawTray(){
  const c=this.ctx,tray=this.trayState();c.save();c.translate(tray.offsetX,tray.offsetY);
  c.save();c.translate(718,1368);c.scale(1,.12);const shadow=c.createRadialGradient(0,0,80,0,0,190);shadow.addColorStop(0,'#00000074');shadow.addColorStop(1,'#00000000');c.fillStyle=shadow;c.fillRect(-195,-195,390,390);c.restore();
  c.drawImage(trayPhoto,80,110,1590,715,548,1211,342,158);c.restore();
 }
 drawBelt(state) {
  const c=this.ctx;
  // The photographed texture translates in the same projected plane as stock.
  const q=state.beltProgress;
  c.save();const v=BELT.corners;c.beginPath();c.moveTo(v.rearLeft.x,v.rearLeft.y);c.lineTo(v.rearRight.x,v.rearRight.y);c.lineTo(v.frontRight.x,v.frontRight.y);c.lineTo(v.frontLeft.x,v.frontLeft.y);c.closePath();c.clip();
  if(!this.beltPattern){const tile=document.createElement('canvas');tile.width=90;tile.height=32;tile.getContext('2d').drawImage(background,420,1070,90,32,0,0,90,32);this.beltPattern=c.createPattern(tile,'repeat');}
  const amount=(this.beltOffset+q*BELT.slotStep)*435;
  this.beltPattern.setTransform(new DOMMatrix().translate(amount,-amount*.028));c.globalAlpha=.20;c.fillStyle=this.beltPattern;c.fillRect(220,1020,490,125);c.restore();
  const belt=this.inventory.belt;
  for(let i=1;i<3;i++)if(belt[i])this.drawCoin(belt[i].portrait,beltCoin(BELT_SLOTS[i].u+q*BELT.slotStep),{cache:q===0||q===1});
  if(belt[3]){const out=this.inventory.active?this.outgoingPose(state):{pose:BELT_SLOTS[3],location:'belt'};this.drawCoin(belt[3].portrait,out.pose,{cache:out.location==='belt'&&(q===0||q===1)});}
 }

 beltScores(state=this.getState(),camera=getLiveCamera(this.elapsed,Boolean(this.inventory.active))) {
  const opacity=1-ease(camera.detail/.12),labels=[];
  if(opacity<=0)return labels;
  const add=(piece,pose,fade=1)=>{
   if(!piece?.assessment||!Number.isFinite(piece.assessment.score)||fade<=0)return;
   const x=pose.x*camera.scale+camera.tx;
   const y=(pose.y-Math.hypot(pose.b,pose.d))*camera.scale+camera.ty-12;
   if(x<0||x>LIVE_WIDTH||y<45||y>LIVE_HEIGHT)return;
   labels.push({id:piece.id,score:piece.assessment.score,x,y,alpha:opacity*fade});
  };
  const belt=this.inventory.belt,q=state.beltProgress;
  for(let i=1;i<3;i++)add(belt[i],beltCoin(BELT_SLOTS[i].u+q*BELT.slotStep));
  if(belt[3]){
   const out=this.inventory.active?this.outgoingPose(state):{pose:BELT_SLOTS[3]};
   const fade=this.inventory.active?1-ease((this.elapsed-outgoingStart)/(TOOL_TIMING.indexEnd-outgoingStart)):1;
   add(belt[3],out.pose,fade);
  }
  if(this.inventory.active&&state.partLocation==='belt'){
   add(this.inventory.active,this.activePose(state),ease((this.elapsed-TOOL_TIMING.beltRelease)/.25));
  }
  return labels;
 }

 drawBeltScores(state,camera) {
  const c=this.ctx;c.save();c.setTransform(1,0,0,1,0,0);
  c.font='600 28px "Microsoft YaHei", "Segoe UI", sans-serif';c.textAlign='center';c.textBaseline='middle';
  for(const label of this.beltScores(state,camera)){
   const text=`${Math.round(label.score)}分`,width=Math.ceil(c.measureText(text).width+24);
   c.globalAlpha=label.alpha;c.shadowColor='#00000066';c.shadowBlur=8;c.shadowOffsetY=2;
   c.fillStyle='#101711dd';c.beginPath();c.roundRect(label.x-width/2,label.y-38,width,38,11);c.fill();
   c.shadowBlur=0;c.shadowOffsetY=0;c.strokeStyle='#e6c58b88';c.lineWidth=1;c.stroke();
   c.fillStyle='#f6dca4';c.fillText(text,label.x,label.y-19);
  }
  c.restore();
 }

 drawCollectorFront() {
  // Only the physical tray lip occludes the bottoms of received coins.
  const c=this.ctx,tray=this.trayState();c.save();c.translate(tray.offsetX,tray.offsetY);
  c.beginPath();c.moveTo(578,1327);c.lineTo(874,1322);c.lineTo(895,1374);c.lineTo(579,1374);c.closePath();c.clip();c.drawImage(trayPhoto,80,110,1590,715,548,1211,342,158);c.restore();
  // The outlet stays attached to the machine while either tray passes below.
  c.save();c.beginPath();c.moveTo(698,1127);c.lineTo(741,1126);c.lineTo(827,1232);c.lineTo(760,1236);c.closePath();c.clip();c.drawImage(background,0,0,W,H);c.restore();
 }

 drawLaserHead(pose) {
  const c=this.ctx,scale=.185,x=LASER_ORIGIN.x-536*scale+pose.x,y=LASER_ORIGIN.nozzleY-1460*scale;
  // Fixed Z stage stays attached to the horizontal gantry; only the lower
  // spindle travels down the long guide to the workpiece.
  c.save();c.translate(x,y);c.scale(scale,scale);c.beginPath();c.rect(0,0,spindle.width,720);c.clip();c.drawImage(spindle,0,0);c.restore();
  const headY=LASER_ORIGIN.nozzleY+pose.y-pose.lift;
  const railTop=602,railBottom=Math.max(674,headY-70),railX=LASER_ORIGIN.x+pose.x-53;
  c.save();const back=c.createLinearGradient(railX-8,0,railX+29,0);back.addColorStop(0,'#333934');back.addColorStop(.2,'#8b8d80');back.addColorStop(.6,'#52594e');back.addColorStop(1,'#252d26');c.fillStyle=back;c.fillRect(railX-8,railTop,37,railBottom-railTop);
  for(const dx of [-53,-31]){
   const gx=LASER_ORIGIN.x+pose.x+dx,g=c.createLinearGradient(gx-2.5,0,gx+2.5,0);g.addColorStop(0,'#414940');g.addColorStop(.45,'#deded0');g.addColorStop(.7,'#949b88');g.addColorStop(1,'#3d453a');c.fillStyle=g;c.fillRect(gx-2.5,railTop,5,railBottom-railTop);
  }c.restore();
  c.save();c.translate(x,y+pose.y-pose.lift);c.scale(scale,scale);c.beginPath();c.rect(0,720,spindle.width,spindle.height-720);c.clip();c.drawImage(spindle,0,0);c.restore();
  c.save();c.strokeStyle='#111a13';c.lineWidth=6;c.lineCap='round';c.beginPath();c.moveTo(LASER_ORIGIN.x+pose.x-19,588);c.bezierCurveTo(LASER_ORIGIN.x+pose.x+16,610,LASER_ORIGIN.x+pose.x+22,headY-90,LASER_ORIGIN.x+pose.x+6,headY-67);c.stroke();c.strokeStyle='#5e6a5b';c.lineWidth=1;c.stroke();c.restore();
 }
 drawLaser(pose,now) {
  const c=this.ctx,x=pose.impact?.x??LASER_ORIGIN.x+pose.x,y=pose.impact?.y??LASER_ORIGIN.y+pose.y,nozzleX=LASER_ORIGIN.x+pose.x,nozzleY=LASER_ORIGIN.nozzleY+pose.y-pose.lift;
  c.save();c.globalCompositeOperation='screen';const g=c.createRadialGradient(x,y,.25,x,y,3.5);g.addColorStop(0,'#e2fff9c0');g.addColorStop(.13,'#46ffed90');g.addColorStop(.5,'#16e7d729');g.addColorStop(1,'#0bfad900');c.fillStyle=g;c.fillRect(x-3.5,y-3.5,7,7);c.strokeStyle='#9cfff0a0';c.shadowColor='#16efdb';c.shadowBlur=.8;c.lineWidth=.45;c.beginPath();c.moveTo(nozzleX,nozzleY);c.lineTo(x,y);c.stroke();
  for(const point of pose.microImpacts??[]){c.fillStyle='#cafff4b0';c.beginPath();c.arc(point.x,point.y,.22,0,Math.PI*2);c.fill();}
  c.shadowBlur=0;for(let i=0;i<3;i++){const t=(now*2+i*.31)%1,a=i*2.3;c.globalAlpha=(1-t)*.28;c.fillStyle=i%2?'#b4fff0':'#ffda92';c.fillRect(x+Math.cos(a)*t*5,y+Math.sin(a)*t*3,.7,.7);}c.restore();
 }

 drawShowcase(showcase) {
  if(!showcase.visible||!this.inventory.active)return;
  const c=this.ctx,view=INSPECTION_CAMERA;
  c.save();c.globalAlpha=showcase.alpha;
  c.setTransform(view.scale,0,0,view.scale,view.tx,view.ty);c.drawImage(inspectionPhoto,0,0,941,1672);
  c.setTransform(1,0,0,1,0,0);
  this.drawCoin(this.inventory.active.portrait,INSPECTION_TOKEN,{shadow:false,thickness:INSPECTION_THICKNESS});
  drawScoreOverlay(c,this.assessment,showcase.scoreProgress,{width:LIVE_WIDTH,height:LIVE_HEIGHT,nickname:this.nickname});
  c.restore();
 }

 drawMachiningDetail(camera) {
  if(camera.detail<=.8)return;
  const c=this.ctx;c.save();c.globalAlpha=ease((camera.detail-.8)/.2);
  c.drawImage(machiningPhoto,-machiningCamera.tx/machiningCamera.scale,
   (machiningTop-machiningCamera.ty)/machiningCamera.scale,
   LIVE_WIDTH/machiningCamera.scale,machiningPhoto.height*machiningScale/machiningCamera.scale);
  c.restore();
 }

 diagnostics(state=this.getState()) {
  const snapshot=this.inventory.snapshot();const owners=[];
  snapshot.collector.forEach(p=>owners.push({id:p.id,location:'collector'}));
  snapshot.belt.forEach((p,i)=>{if(p)owners.push({id:p.id,location:i===3&&snapshot.active?this.outgoingPose(state).location:'belt'});});
  if(snapshot.active)owners.push({id:snapshot.active.id,location:state.partLocation});
  const showcase=getShowcaseState(this.elapsed,Boolean(this.inventory.active));
  return {phase:state.phase,elapsed:this.elapsed,held:state.carried,vacuum:state.vacuum,collector:this.collectorCount,capacity:this.collectorCapacity,owners,stockUnique:new Set(owners.map(p=>p.id)).size===owners.length,camera:getLiveCamera(this.elapsed,Boolean(this.inventory.active)),showcase,rating:showcase.visible?this.assessment:null,beltScores:this.beltScores(state),tray:this.trayState()};
 }
 update(delta,now) {
  if(this.paused)now=this.frozenTime;else this.frozenTime=now;
  this.advanceTrayExchange(delta);
  const c=this.ctx,camera=getLiveCamera(this.elapsed,Boolean(this.inventory.active));
  c.setTransform(camera.scale,0,0,camera.scale,camera.tx,camera.ty);c.drawImage(background,0,0,W,H);
  this.drawMachiningDetail(camera);
  const state=this.getState(),pose=getToolPose(this.inventory.active?this.elapsed:TOOL_TIMING.total);
  // The photographed vacuum nest supports and holds the disk from underneath;
  // no extra jaws are painted over the fixture or the portrait face.
  this.drawTraySupport();this.drawTray();this.drawCollector();this.drawFeeder(state);this.drawBelt(state);this.drawActive(state,pose);
  this.drawLaserHead(pose);drawPickArm(c,reference,state.armTarget,{vacuum:state.vacuum});
  if(pose.laser&&!this.paused)this.drawLaser(pose,now);
  this.drawCollectorFront();
  this.drawBeltScores(state,camera);
  this.drawShowcase(getShowcaseState(this.elapsed,Boolean(this.inventory.active)));
 }
}
