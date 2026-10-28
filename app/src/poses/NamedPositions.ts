export const NAMED_POSITIONS_KEY='nexarm.named-positions.v1';
export type NamedPosition={id:string;name:string;positions:number[];capturedAt:string};
const MAX_POSES=32,MAX_BYTES=64*1024;
function positionName(value:unknown):string{
  if(typeof value!=='string'||!value.trim()||value.trim().length>40||/[\u0000-\u001f\u007f]/.test(value))throw Error('Use a position name with 1–40 characters, such as Pickup.');
  return value.trim();
}
function measuredPositions(value:unknown):number[]{
  if(!Array.isArray(value)||value.length!==6||value.some(n=>typeof n!=='number'||!Number.isInteger(n)||n<0||n>4095))throw Error('Six valid measured positions are required.');
  return [...value];
}
export function copyNamedPositions(input:unknown):NamedPosition[]{
  if(!Array.isArray(input)||input.length>MAX_POSES)throw Error('Keep at most 32 saved positions in a program.');
  const ids=new Set<string>(),names=new Set<string>();
  return input.map(value=>{
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid saved position.');
    const pose=value as Record<string,unknown>,name=positionName(pose.name);
    if(typeof pose.id!=='string'||!pose.id||pose.id.length>80||ids.has(pose.id)||names.has(name.toLowerCase())||typeof pose.capturedAt!=='string'||pose.capturedAt.length>40||!Number.isFinite(Date.parse(pose.capturedAt)))throw Error('Saved positions need unique IDs/names and valid capture metadata.');
    ids.add(pose.id);names.add(name.toLowerCase());
    return {id:pose.id,name,positions:measuredPositions(pose.positions),capturedAt:pose.capturedAt};
  });
}
export class NamedPositions{
  private poses:NamedPosition[]=[];
  private blocked=false;
  message='No positions yet. Save program includes every position; this browser keeps a working copy.';
  constructor(private readonly storage:Pick<Storage,'getItem'|'setItem'>,private readonly newId:()=>string=()=>crypto.randomUUID()){
    let raw:string|null;
    try{raw=storage.getItem(NAMED_POSITIONS_KEY);}catch{this.message='Browser storage is unavailable. Save program to keep positions before closing.';return;}
    if(raw===null)return;
    try{
      if(new TextEncoder().encode(raw).length>MAX_BYTES)throw Error('Too large');
      const data=JSON.parse(raw);
      if(!data||data.format!=='nexarm-named-positions'||data.schemaVersion!==1||!Array.isArray(data.poses)||data.poses.length>MAX_POSES)throw Error('Invalid positions');
      this.poses=copyNamedPositions(data.poses);
      this.message='Working copy restored from this browser. Save program includes every position.';
    }catch{this.poses=[];this.blocked=true;this.message='Saved positions could not be read. Existing data is unchanged. Clear saved positions to start fresh.';}
  }
  get canAdd(){return !this.blocked&&this.poses.length<MAX_POSES;}
  list():NamedPosition[]{return this.poses.map(pose=>({...pose,positions:[...pose.positions]}));}
  private persist(){
    const text=this.export();
    try{this.storage.setItem(NAMED_POSITIONS_KEY,text);if(this.storage.getItem(NAMED_POSITIONS_KEY)!==text)throw Error('Save not verified');this.message='Working copy in this browser. Save program includes every position.';}
    catch{this.message='Memory only: browser saving failed. Save program before closing or reloading.';}
  }
  add(name:string,positions:readonly number[],capturedAt=new Date().toISOString()):NamedPosition{
    if(this.blocked)throw Error(this.message);
    if(this.poses.length>=MAX_POSES)throw Error('Keep at most 32 positions. Export or delete an old one first.');
    const label=positionName(name),measured=measuredPositions(positions);
    if(this.poses.some(pose=>pose.name.toLowerCase()===label.toLowerCase()))throw Error('That position name is already in use. Choose another name or delete the old position.');
    const id=this.newId();
    if(!id||id.length>80||this.poses.some(pose=>pose.id===id)||capturedAt.length>40||!Number.isFinite(Date.parse(capturedAt)))throw Error('Could not create valid position metadata.');
    const pose={id,name:label,positions:measured,capturedAt};
    this.poses.push(pose);this.persist();return {...pose,positions:[...pose.positions]};
  }
  remove(id:string){
    if(this.blocked)throw Error(this.message);
    this.poses=this.poses.filter(pose=>pose.id!==id);this.persist();
  }
  clear(){this.poses=[];this.blocked=false;this.persist();}
  replace(input:unknown){const poses=copyNamedPositions(input);this.poses=poses;this.blocked=false;this.persist();}
  export(){return JSON.stringify({format:'nexarm-named-positions',schemaVersion:1,poses:this.list()},null,2);}
}
