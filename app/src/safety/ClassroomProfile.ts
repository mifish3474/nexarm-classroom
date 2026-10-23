export const CLASSROOM_PROFILE_KEY='nexarm.classroom-profile.v1';
export type ClassroomProfile={schemaVersion:1;limits:{min:number;max:number}[];speed:number;acceleration:10};

// Operator-configured station limits. These are never inferred from encoder
// range, a Home pose, or a program file, and never certify collision clearance.
export function classroomProfile(input:unknown):ClassroomProfile{
  if(!input||typeof input!=='object')throw Error('Set up the station movement limits first.');
  const data=input as Record<string,unknown>;
  if(data.schemaVersion!==1||!Array.isArray(data.limits)||data.limits.length!==6)throw Error('Six joint ranges are required.');
  const limits=data.limits.map((value,index)=>{
    if(!value||typeof value!=='object')throw Error(`Set the range for S${index+1}.`);
    const {min,max}=value as Record<string,unknown>;
    if(typeof min!=='number'||typeof max!=='number'||!Number.isInteger(min)||!Number.isInteger(max)||min<0||max>4095||min>=max)throw Error(`S${index+1} needs whole-number minimum and maximum values, with minimum below maximum.`);
    return {min,max};
  });
  if(typeof data.speed!=='number'||!Number.isInteger(data.speed)||data.speed<1||data.speed>600||data.acceleration!==10)throw Error('Program speed must be 1–600; acceleration is 10.');
  return {schemaVersion:1,limits,speed:data.speed,acceleration:10};
}
export function checkClassroomPositions(positions:readonly number[],profile:ClassroomProfile){
  if(positions.length!==6)throw Error('Six current readings are required.');
  positions.forEach((position,index)=>{
    const limit=profile.limits[index]!;
    if(!Number.isInteger(position)||position<limit.min||position>limit.max)throw Error(`S${index+1} reports ${position}, outside the station range ${limit.min}–${limit.max}. Reposition using the setup controls.`);
  });
}
