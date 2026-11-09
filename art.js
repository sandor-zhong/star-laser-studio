// Photo-derived anime portraits retain the reference artwork and print detail.
export const DEMO_NAMES = ['星河漫游者','小鹿不迷路','阿橙同学','银河收藏家','奶糖很甜','晚风有信','小宇宙','爱喝柠檬茶','云朵朵','一颗小星星','月亮邮差','桃子汽水','拾光少女','森林里的风'];
export function hashText(text) { let h=2166136261; for(const c of String(text)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0; }
const reference = new Image();
reference.src = './assets/workshop-reference.png';
await reference.decode();
const faces = [
  {x:352,y:1139,rx:65,ry:41,angle:0.15},
  {x:498,y:1120,rx:63,ry:43,angle:0.15},
  {x:641,y:1099,rx:62,ry:40,angle:0.17},
  {x:777,y:1083,rx:62,ry:40,angle:0.32},
];
const cache = new Map();
export function makeAvatar(name, seed=hashText(name), size=320) {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  const c=canvas.getContext('2d'); const f=faces[seed%faces.length];
  c.save();c.beginPath();c.arc(size/2,size/2,size/2,0,Math.PI*2);c.clip();
  c.translate(size/2,size/2);c.scale(size/(f.rx*2),size/(f.ry*2));c.rotate(-f.angle);
  c.drawImage(reference,-f.x,-f.y);c.restore();return canvas;
}
export function portraitDataUrl(name,seed=hashText(name)) {const key=String(seed);if(!cache.has(key))cache.set(key,makeAvatar(name,seed,256).toDataURL());return cache.get(key);}
