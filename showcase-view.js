// Near-overhead camera of the SAME supported token, not an extra inventory item.
// The photographed dark seat floor is calibrated in the 941×1672 asset plane.
const scale=378/310;
export const INSPECTION_CAMERA=Object.freeze({scale,tx:540-466*scale,ty:820-701*scale});
export const INSPECTION_TOKEN=Object.freeze({x:540,y:812,a:378,b:0,c:0,d:288*scale});
export const INSPECTION_THICKNESS=8;
