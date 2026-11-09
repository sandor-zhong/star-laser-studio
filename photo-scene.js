import { makeAvatar } from './art.js';
import { getToolPose, getRasterSample, PRINT_SURFACE, LASER_ORIGIN, TOOL_TIMING, ease, clamp } from './scan-path.js';
import { getHandlingState } from './handling-cycle.js';
import { BELT, BELT_SLOTS, BELT_LOAD, beltCoin } from './belt-plane.js';
import { CellInventory } from './cell-inventory.js';
import { drawPickArm } from './pick-arm.js';

export const LIVE_WIDTH=1080, LIVE_HEIGHT=1920;
const W=941,H=1672;
const loadImage=async url=>{const im=new Image();im.src=url;await im.decode();return im;};
const [background,reference,spindle,goldPhoto]=await Promise.all([
 loadImage('./assets/approved-cell-clean.png'),loadImage('./output/structure-concept-v3.png'),
 loadImage('./assets/spindle-layer.png'),loadImage('./assets/workshop-blank.png'),
]);
const mix=(a,b,t)=>a+(b-a)*t;
const vectorPose=(x,y,rx,ry,angle=0)=>({x,y,a:Math.cos(angle)*rx,b:Math.sin(angle)*rx,c:-Math.sin(angle)*ry,d:Math.cos(angle)*ry});
const fixturePose=vectorPose(PRINT_SURFACE.x,PRINT_SURFACE.y,PRINT_SURFACE.rx,PRINT_SURFACE.ry,PRINT_SURFACE.angle);
const sourcePose=vectorPose(239,964,31,15,.10);
const parkPoint={x:360,y:900};
const points={source:sourcePose,fixture:fixturePose,beltLoad:BELT_LOAD,park:parkPoint};
const mixPose=(a,b,t)=>Object.fromEntries(['x','y','a','b','c','d'].map(key=>[key,mix(a[key],b[key],t)]));
const slidePose=(p,x,y)=>({...p,x,y});
const cubic=(a,b,c,d,t)=>(1-t)**3*a+3*(1-t)**2*t*b+3*(1-t)*t*t*c+t**3*d;
const metalTexture=document.createElement('canvas');metalTexture.width=metalTexture.height=384;
const mc=metalTexture.getContext('2d');mc.translate(192,192);mc.scale(192/116,192/54);mc.rotate(-.1);mc.drawImage(goldPhoto,-524,-869);
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
  container.append(this.canvas);this.ctx=this.canvas.getContext('2d',{alpha:false});
  this.defaults=[0,1,2].map(seed=>makeAvatar('示例作品',seed));
  this.inventory=new CellInventory(this.defaults,24);this.elapsed=0;this.beltOffset=0;this.paused=false;this.frozenTime=0;
  this.update(0,0);
 }
 canStart(){return this.inventory.canStart();}
 prepare(portrait){if(!this.inventory.begin(portrait))return false;this.elapsed=0;return true;}
 updateEngraving(elapsed){this.elapsed=Math.max(0,Math.min(TOOL_TIMING.total,elapsed));}
 complete(){if(!this.inventory.active)return;this.inventory.commit();this.beltOffset+=BELT.slotStep;this.elapsed=TOOL_TIMING.total;if(this.pendingCollectorClear){this.inventory.clearCollector();this.pendingCollectorClear=false;}}
 clearCollector(){if(this.inventory.active&&this.elapsed>=outgoingStart){this.pendingCollectorClear=true;return null;}return this.inventory.clearCollector().length;}
 reset(){this.inventory.reset();this.elapsed=0;this.beltOffset=0;this.pendingCollectorClear=false;}
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
 drawCoin(image,p,{raster=null,blank=false,shadow=true}={}) {
  const c=this.ctx,r=64;if(shadow)this.drawShadow(p);
  c.save();c.transform(p.a/r,p.b/r,p.c/r,p.d/r,p.x,p.y);
  const depth=3.5*r/Math.hypot(p.c,p.d);
  const side=c.createLinearGradient(-r,0,r,depth*2);side.addColorStop(0,'#7f4d17');side.addColorStop(.2,'#f5c466');side.addColorStop(.4,'#a77121');side.addColorStop(.65,'#ffe5a2');side.addColorStop(1,'#6d4517');
  c.fillStyle=side;c.beginPath();c.arc(0,depth,r,0,Math.PI*2);c.fill();
  c.save();c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.clip();c.drawImage(metalTexture,-r,-r,r*2,r*2);
  if(image&&!blank){
   c.save();if(raster&&!raster.complete){const h=r*2/raster.rows;c.beginPath();c.rect(-r,-r,r*2,h*raster.row);const y=-r+h*raster.row;
    if(raster.rowComplete)c.rect(-r,y,r*2,h);else if(raster.direction>0)c.rect(-r,y,(raster.u+1)*r,h);else c.rect(raster.u*r,y,(1-raster.u)*r,h);c.clip();}
   c.drawImage(image,-r,-r,r*2,r*2);const tint=c.createLinearGradient(-r,-r,r,r);tint.addColorStop(0,'#ffe8bc18');tint.addColorStop(.5,'#ffffff00');tint.addColorStop(.8,'#fff0b718');tint.addColorStop(1,'#34220b24');c.fillStyle=tint;c.fillRect(-r,-r,r*2,r*2);c.restore();
  }
  c.strokeStyle='#89571b';c.lineWidth=4.3;c.beginPath();c.arc(0,0,r-1,0,Math.PI*2);c.stroke();c.strokeStyle='#ffe7a2';c.lineWidth=1.1;c.beginPath();c.arc(0,0,r-1.6,Math.PI,Math.PI*2);c.stroke();
  c.strokeStyle='#edbf62';c.lineWidth=1.7;c.beginPath();c.arc(0,0,r-3,0,Math.PI*2);c.stroke();c.restore();
  for(let i=1;i<24;i++){const a=i/24*Math.PI,x=Math.cos(a)*r,y=Math.sin(a)*r;c.strokeStyle=i%3?'#ffe0a055':'#87531a66';c.lineWidth=.6;c.beginPath();c.moveTo(x,y+1);c.lineTo(x,y+depth-1);c.stroke();}c.restore();
 }

 drawFeeder(state) {
  const c=this.ctx,active=this.inventory.active;
  const advance=active&&state.sourceConsumed?ease((this.elapsed-TOOL_TIMING.sourceLiftStart)/.55):0;
  c.save();c.beginPath();c.moveTo(173,847);c.lineTo(234,844);c.lineTo(277,987);c.lineTo(210,998);c.closePath();c.clip();
  for(let i=3;i>=1;i--){const x=sourcePose.x-i*10+advance*10,y=sourcePose.y-i*44+advance*44;
   this.drawCoin(null,vectorPose(x,y,31-i*.9,15-i*.4,.1),{blank:true});}
  if(!active||!state.sourceConsumed)this.drawCoin(null,sourcePose,{blank:true});c.restore();
 }

 drawClamps(closed) {
  const c=this.ctx,p=PRINT_SURFACE;
  for(const angle of [Math.PI,.03,-Math.PI/2]){
   const edge=39+(1-closed)*9,x=p.x+Math.cos(angle)*edge,y=p.y+Math.sin(angle)*edge*.47;
   c.save();c.translate(x,y);c.rotate(Math.atan2(Math.sin(angle)*.47,Math.cos(angle)));const g=c.createLinearGradient(0,-3,0,4);g.addColorStop(0,'#d0d0c2');g.addColorStop(.3,'#a0a895');g.addColorStop(1,'#424b3f');c.fillStyle='#111911';c.fillRect(-2,-1,15,6);c.fillStyle=g;c.fillRect(-3,-4,15,5);c.strokeStyle='#353d31';c.lineWidth=.6;c.strokeRect(-3,-4,15,5);c.restore();
  }
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
  this.drawCoin(active.portrait,p,{blank,raster:state.partLocation==='fixture'?pose.raster:null,shadow:state.partLocation!=='gripper'});
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
  const pieces=this.inventory.collector;
  const order=pieces.map((_,i)=>i).sort((a,b)=>collectorPose(a%6).y-collectorPose(b%6).y||a-b);
  for(const i of order)this.drawCoin(pieces[i].portrait,collectorPose(i));
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
  for(let i=1;i<3;i++)if(belt[i])this.drawCoin(belt[i].portrait,beltCoin(BELT_SLOTS[i].u+q*BELT.slotStep));
  if(belt[3]){const out=this.inventory.active?this.outgoingPose(state):{pose:BELT_SLOTS[3],location:'belt'};this.drawCoin(belt[3].portrait,out.pose);}
 }

 drawCollectorFront() {
  // Only the physical tray lip occludes the bottoms of received coins.
  const c=this.ctx;c.save();c.beginPath();c.moveTo(585,1323);c.lineTo(873,1318);c.lineTo(877,1350);c.lineTo(595,1362);c.closePath();c.clip();c.drawImage(background,0,0,W,H);c.restore();
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
  const c=this.ctx,x=LASER_ORIGIN.x+pose.x,y=LASER_ORIGIN.y+pose.y,nozzleY=LASER_ORIGIN.nozzleY+pose.y-pose.lift;
  c.save();c.globalCompositeOperation='screen';const g=c.createRadialGradient(x,y,.4,x,y,10);g.addColorStop(0,'#e2fff9e0');g.addColorStop(.13,'#46ffedb0');g.addColorStop(.5,'#16e7d735');g.addColorStop(1,'#0bfad900');c.fillStyle=g;c.fillRect(x-10,y-10,20,20);c.strokeStyle='#9cfff0';c.shadowColor='#16efdb';c.shadowBlur=3;c.lineWidth=.8;c.beginPath();c.moveTo(x,nozzleY);c.lineTo(x,y);c.stroke();
  c.shadowBlur=0;for(let i=0;i<3;i++){const t=(now*2+i*.31)%1,a=i*2.3;c.globalAlpha=(1-t)*.28;c.fillStyle=i%2?'#b4fff0':'#ffda92';c.fillRect(x+Math.cos(a)*t*5,y+Math.sin(a)*t*3,.7,.7);}c.restore();
 }

 diagnostics(state=this.getState()) {
  const snapshot=this.inventory.snapshot();const owners=[];
  snapshot.collector.forEach(p=>owners.push({id:p.id,location:'collector'}));
  snapshot.belt.forEach((p,i)=>{if(p)owners.push({id:p.id,location:i===3&&snapshot.active?this.outgoingPose(state).location:'belt'});});
  if(snapshot.active)owners.push({id:snapshot.active.id,location:state.partLocation});
  return {phase:state.phase,elapsed:this.elapsed,held:state.carried,vacuum:state.vacuum,collector:this.collectorCount,capacity:this.collectorCapacity,owners,stockUnique:new Set(owners.map(p=>p.id)).size===owners.length};
 }
 update(delta,now) {
  if(this.paused)now=this.frozenTime;else this.frozenTime=now;
  const c=this.ctx,scale=Math.max(LIVE_WIDTH/W,LIVE_HEIGHT/H);c.setTransform(scale,0,0,scale,(LIVE_WIDTH-W*scale)/2,(LIVE_HEIGHT-H*scale)/2);c.drawImage(background,0,0,W,H);
  const state=this.getState(),pose=getToolPose(this.inventory.active?this.elapsed:TOOL_TIMING.total);
  this.drawCollector();this.drawFeeder(state);this.drawBelt(state);this.drawActive(state,pose);this.drawClamps(state.clamped);
  this.drawLaserHead(pose);drawPickArm(c,reference,state.armTarget,{vacuum:state.vacuum});
  if(pose.laser&&!this.paused)this.drawLaser(pose,now);
  this.drawCollectorFront();
 }
}
