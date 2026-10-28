import {describe,expect,it} from 'vitest';
import {loadProjectFile,saveProjectFile} from '../app/src/runtime/ProgramFile';
import {NamedPositions,NAMED_POSITIONS_KEY} from '../app/src/poses/NamedPositions';
import {resolveProjectPositions} from '../app/src/runtime/ProjectPositions';
import type {ProgramProject} from '../app/src/runtime/ProgramProject';
import type {Instruction} from '../app/src/runtime/ProgramLanguage';
const home=[2050,2150,2100,2200,2000,1080];
const position=(id='p',name='Pickup')=>({id,name,positions:[...home],capturedAt:'2026-10-28T12:00:00.000Z'});
const pose=(blockId='pose',positionId='p',name='Pickup',positions=home):Instruction=>({kind:'pose',blockId,positionId,name,positions:[...positions],durationMs:1000});
const file=(project:object,schemaVersion=5)=>JSON.stringify({format:'nexarm-classroom-program',schemaVersion,instructions:[],keyEvents:[],...project});

describe('program-owned positions',()=>{
 it('saves every position, including unused ones and programs with no position blocks',()=>{
  const project={instructions:[],keyEvents:[],positions:[position(),position('unused','Unused')],name:'Positions only'};
  const text=saveProjectFile(project);expect(JSON.parse(text).schemaVersion).toBe(5);expect(loadProjectFile(text)).toEqual(project);
  const loaded=loadProjectFile(text);loaded.positions![0]!.positions[0]=0;expect(project.positions[0]!.positions).toEqual(home);
 });
 it('round-trips the same canonical positions across Run, keys, branches and functions',()=>{
  const project:ProgramProject={positions:[position()],instructions:[{kind:'if',blockId:'if',branches:[{condition:false,body:[pose('branch')]}],elseBody:[pose('run')]}],keyEvents:[{blockId:'key',key:'a',body:[pose('key-pose')]}],functions:[{blockId:'def',name:'Pickup function',body:[pose('function-pose')]}]};
  expect(loadProjectFile(saveProjectFile(project))).toEqual(project);
 });
 it('migrates embedded positions from all legacy file versions and deduplicates shared references',()=>{
  for(const version of [1,2,3,4]){
   const project={instructions:[pose()],keyEvents:version>=3?[{blockId:'key',key:'a',body:[pose('key-pose')]}]:[]};
   const loaded=loadProjectFile(file(project,version));expect(loaded.positions).toHaveLength(1);expect(loaded.positions![0]).toMatchObject({id:'p',name:'Pickup',positions:home});
  }
 });
 it('preserves distinct legacy snapshots with clashing IDs/names by disambiguating labels, without changing targets',()=>{
  const second=[...home];second[0]=2150;
  const loaded=loadProjectFile(file({instructions:[pose('one'),pose('two','p','Pickup',second),pose('three','p','Pickup',second)]},2));
  expect(loaded.positions).toHaveLength(2);expect(loaded.positions!.map(p=>p.name)).toEqual(['Pickup','Pickup (2)']);expect(loaded.positions!.map(p=>p.positions)).toEqual([home,second]);
  const moves=loaded.instructions as Extract<Instruction,{kind:'pose'}>[];expect(moves[1]!.positionId).toBe(moves[2]!.positionId);expect(moves[0]!.positionId).not.toBe(moves[1]!.positionId);
 });
 it('rejects missing, inconsistent or invalid position lists instead of silently rewriting targets',()=>{
  for(const data of [file({}),file({positions:[position(),position()]}),file({positions:[{...position(),positions:[1]}]}),file({positions:[{...position(),capturedAt:'unknown'}]}),file({positions:[],instructions:[pose()]}),file({positions:[position('different')],instructions:[pose()]}),file({positions:[{...position(),positions:[2100,...home.slice(1)]}],instructions:[pose()]})])expect(()=>loadProjectFile(data)).toThrow();
 });
 it('keeps the 32-position cap, including legacy snapshots, and never mutates the input project',()=>{
  const project={instructions:[pose()],keyEvents:[]};const normalized=resolveProjectPositions(project);normalized.positions[0]!.positions[0]=0;expect(project.instructions).toEqual([pose()]);
  expect(()=>loadProjectFile(file({positions:Array.from({length:33},(_,i)=>position(`p${i}`,`Position ${i}`))}))).toThrow('32');
  expect(()=>loadProjectFile(file({instructions:Array.from({length:33},(_,i)=>pose(`b${i}`,`p${i}`,`Position ${i}`))},2))).toThrow('32');
 });
 it('replaces or clears the browser working copy atomically and leaves holding records untouched',()=>{
  const map=new Map<string,string>([['holding','unchanged']]),storage={getItem:(key:string)=>map.get(key)??null,setItem:(key:string,value:string)=>{map.set(key,value);}};
  const saved=new NamedPositions(storage);saved.replace([position('old','Old')]);expect(()=>saved.replace([{...position(),positions:[1]}])).toThrow();expect(saved.list()[0]!.name).toBe('Old');
  saved.replace([position()]);expect(new NamedPositions(storage).list()).toEqual([position()]);saved.replace([]);expect(JSON.parse(map.get(NAMED_POSITIONS_KEY)!).poses).toEqual([]);expect(map.get('holding')).toBe('unchanged');
 });
 it('keeps a loaded project usable in memory when the browser cannot save its working copy',()=>{
  const saved=new NamedPositions({getItem:()=>null,setItem:()=>{throw Error('blocked');}});saved.replace([position()]);expect(saved.list()).toEqual([position()]);expect(saved.message).toContain('Memory only');
 });
});
