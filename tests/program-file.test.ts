import {expect,it} from 'vitest';
import {saveProgramFile,loadProgramFile,MAX_PROGRAM_FILE_BYTES} from '../app/src/runtime/ProgramFile';
const move={kind:'move',blockId:'j',servo:1,target:2130};
const pose={kind:'pose',blockId:'p',positionId:'pickup',name:'Pickup',positions:[2050,2150,2100,2200,2000,1080],durationMs:1000};
const coordinates={kind:'coordinates',blockId:'c',x:39,y:-1,z:-71,pitch:18.4,roll:8,claw:-87,durationMs:2000};
it('round-trips loops, waits, joint moves and embedded six-joint poses',()=>{
 const instructions=[move,{kind:'repeat',blockId:'r',count:2,body:[pose,{kind:'wait',blockId:'w',durationMs:500}]}];
 expect(loadProgramFile(saveProgramFile(instructions))).toEqual(instructions);
 const loaded=loadProgramFile(saveProgramFile([pose]));(loaded[0] as typeof pose).positions[0]=0;expect(pose.positions[0]).toBe(2050);
 expect(loadProgramFile(saveProgramFile([]))).toEqual([]);
});
it('rejects retired XYZ files and exports, including XYZ inside repeats',()=>{
 for(const instructions of [[coordinates],[move,{kind:'repeat',blockId:'r',count:2,body:[coordinates]}]]){
  expect(()=>saveProgramFile(instructions)).toThrow('XYZ coordinate blocks are no longer supported');
  expect(()=>loadProgramFile(JSON.stringify({format:'nexarm-classroom-program',schemaVersion:1,instructions}))).toThrow('XYZ coordinate blocks are no longer supported');
 }
});
it('rejects executable/foreign content, unknown versions, malformed files and invalid block values',()=>{
 for(const text of ['garbage','null','[]',JSON.stringify({format:'nexarm-classroom-program',schemaVersion:99,instructions:[move]}),JSON.stringify({format:'other',schemaVersion:1,instructions:[move]})])expect(()=>loadProgramFile(text)).toThrow();
 for(const instructions of [[{kind:'setHolding',blockId:'x',enabled:true}],[{...move,target:4096}],[{...coordinates,pitch:NaN}],[{...pose,positions:[1]}],[{kind:'wait',blockId:'w',durationMs:501}]])expect(()=>saveProgramFile(instructions)).toThrow();
 const source={...move,sourceCode:'alert(1)',stationLimits:{disabled:true}};expect(loadProgramFile(saveProgramFile([source]))).toEqual([move]);
});
it('rejects duplicate block references, oversized files and expanded programs over budget',()=>{
 expect(()=>saveProgramFile([move,{...move,target:2050}])).toThrow('unique');
 expect(()=>saveProgramFile([{...move,blockId:''}])).toThrow('nonempty');
 expect(()=>loadProgramFile(' '.repeat(MAX_PROGRAM_FILE_BYTES+1))).toThrow('256 KB');
 expect(()=>saveProgramFile([{kind:'repeat',blockId:'r',count:20,body:Array.from({length:6},(_,i)=>({...move,blockId:`j${i}`}))}])).toThrow('100');
});
