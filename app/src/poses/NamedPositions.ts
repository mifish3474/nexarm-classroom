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
export class NamedPositions{
  private poses:NamedPosition[]=[];
  private blocked=false;
  message='No positions saved yet. Names and measurements stay in this browser.';
  constructor(private readonly storage:Pick<Storage,'getItem'|'setItem'>,private readonly newId:()=>string=()=>crypto.randomUUID()){
    let raw:string|null;
    try{raw=storage.getItem(NAMED_POSITIONS_KEY);}catch{this.message='Browser storage is unavailable. New positions will be memory-only; export a copy.';return;}
    if(raw===null)return;
    try{
      if(new TextEncoder().encode(raw).length>MAX_BYTES)throw Error('Too large');
      const data=JSON.parse(raw);
      if(!data||data.format!=='nexarm-named-positions'||data.schemaVersion!==1||!Array.isArray(data.poses)||data.poses.length>MAX_POSES)throw Error('Invalid positions');
      const ids=new Set<string>(),names=new Set<string>();
      this.poses=data.poses.map((pose:unknown)=>{
        if(!pose||typeof pose!=='object')throw Error('Invalid position');
        const p=pose as Record<string,unknown>,name=positionName(p.name);
        if(typeof p.id!=='string'||!p.id||p.id.length>80||ids.has(p.id)||names.has(name.toLowerCase())||typeof p.capturedAt!=='string'||p.capturedAt.length>40||!Number.isFinite(Date.parse(p.capturedAt)))throw Error('Invalid position');
        ids.add(p.id);names.add(name.toLowerCase());
        return {id:p.id,name,positions:measuredPositions(p.positions),capturedAt:p.capturedAt};
      });
      this.message='Saved positions loaded from this browser. They do not move the robot automatically.';
    }catch{this.poses=[];this.blocked=true;this.message='Saved positions could not be read. Existing data is unchanged. Clear saved positions to start fresh.';}
  }
  get canAdd(){return !this.blocked&&this.poses.length<MAX_POSES;}
  list():NamedPosition[]{return this.poses.map(pose=>({...pose,positions:[...pose.positions]}));}
  private persist(){
    const text=this.export();
    try{this.storage.setItem(NAMED_POSITIONS_KEY,text);if(this.storage.getItem(NAMED_POSITIONS_KEY)!==text)throw Error('Save not verified');this.message='Saved in this browser. Export a copy for backup.';}
    catch{this.message='Memory only: browser saving failed. Export a copy before closing or reloading.';}
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
  export(){return JSON.stringify({format:'nexarm-named-positions',schemaVersion:1,poses:this.list()},null,2);}
}
