import {expect,it} from 'vitest';
import {programSignal} from '../app/src/ProgramSignal';
const idle={connectionState:'Listening',faulted:false,running:false,keysActive:false,preparing:false,stopped:false,released:false};
it('distinguishes running, key listening and idle without claiming physical safety',()=>{
 expect(programSignal(idle)).toEqual({state:'idle',label:'Idle'});
 expect(programSignal({...idle,keysActive:true}).state).toBe('listening');
 expect(programSignal({...idle,running:true,keysActive:true}).state).toBe('running');
 expect(programSignal({...idle,preparing:true}).state).toBe('checking');
 expect(programSignal({...idle,released:true}).state).toBe('released');
});
it('keeps Stop and faults distinct from running and marks unavailable communication gray',()=>{
 expect(programSignal({...idle,stopped:true,keysActive:true})).toEqual({state:'stopped',label:'Stop requested'});
 expect(programSignal({...idle,faulted:true,running:true}).state).toBe('fault');
 for(const connectionState of [undefined,'Disconnected','Closing'])expect(programSignal({...idle,connectionState,running:true,keysActive:true,faulted:true}).state).toBe('disconnected');
});
