export interface CoordinateTarget {x:number;y:number;z:number;pitch:number;roll:number;claw:number;durationMs:number;}

// Bounded development inputs, not a calibrated workspace or collision policy.
// X/Y and upper Z follow the supplied factory UI; Z also permits negative LCD
// readings (including the operator's -71). Orientation is deliberately bounded;
// claw includes the negative readings observed on the physical LCD/telemetry.
export const COORDINATE_FIELDS=Object.freeze([
  {key:'x',field:'X',label:'X (mm)',min:0,max:550,step:1,value:200},
  {key:'y',field:'Y',label:'Y (mm)',min:-550,max:550,step:1,value:0},
  {key:'z',field:'Z',label:'Z (mm)',min:-570,max:570,step:1,value:200},
  {key:'pitch',field:'P',label:'P · pitch (degrees)',min:-180,max:180,step:.1,value:0},
  {key:'roll',field:'R',label:'R · roll (degrees)',min:-90,max:90,step:1,value:0},
  {key:'claw',field:'C',label:'C · claw (degrees)',min:-90,max:90,step:1,value:0},
] as const);

export function validateCoordinateTarget(input:unknown):CoordinateTarget {
  if(!input||typeof input!=='object')throw Error('Enter X, Y, Z, P, R and C.');
  const target=input as Record<string,unknown>;
  for(const field of COORDINATE_FIELDS){
    const value=target[field.key];
    if(typeof value!=='number'||!Number.isFinite(value)||value<field.min||value>field.max||Math.abs(value/field.step-Math.round(value/field.step))>1e-7)
      throw Error(`${field.label} must be ${field.min}–${field.max} in steps of ${field.step}. These are development input bounds, not verified reachability.`);
  }
  if(typeof target.durationMs!=='number'||!Number.isInteger(target.durationMs)||target.durationMs<100||target.durationMs>10000)throw Error('Coordinate duration must be 0.1–10 seconds.');
  return {x:target.x as number,y:target.y as number,z:target.z as number,pitch:target.pitch as number,roll:target.roll as number,claw:target.claw as number,durationMs:target.durationMs};
}
