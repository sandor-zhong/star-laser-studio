// High-resolution flat artwork keeps the portrait sharp in the inspection view.
export const DEMO_NAMES = ['星河漫游者','小鹿不迷路','阿橙同学','银河收藏家','奶糖很甜','晚风有信','小宇宙','爱喝柠檬茶','云朵朵','一颗小星星','月亮邮差','桃子汽水','拾光少女','森林里的风'];
export function hashText(text) { let h=2166136261; for(const c of String(text)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0; }
const reference = new Image();
reference.src = './assets/portrait-artwork-atlas-v1.png';
await reference.decode();
const cache = new Map();
export function makeAvatar(name, seed=hashText(name), size=768) {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  const c=canvas.getContext('2d'),index=(seed>>>0)%4,w=reference.width/2,h=reference.height/2;
  c.imageSmoothingQuality='high';
  c.save();c.beginPath();c.arc(size/2,size/2,size/2,0,Math.PI*2);c.clip();
  c.drawImage(reference,index%2*w,Math.floor(index/2)*h,w,h,0,0,size,size);c.restore();return canvas;
}
export function portraitDataUrl(name,seed=hashText(name)) {const key=String(seed);if(!cache.has(key))cache.set(key,makeAvatar(name,seed,256).toDataURL());return cache.get(key);}
