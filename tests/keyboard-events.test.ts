import {it,expect,vi} from 'vitest';
import {KeyboardEvents,keyLabel} from '../app/src/runtime/KeyboardEvents';
import {copyProject} from '../app/src/runtime/ProgramProject';
import {saveProjectFile,loadProjectFile,loadProgramFile} from '../app/src/runtime/ProgramFile';
import type {Instruction} from '../app/src/runtime/ProgramLanguage';

const ready={canMove:true,busy:false,editing:false,visible:true};
const press=(key=' ',overrides:Record<string,unknown>={})=>({key,repeat:false,ctrlKey:false,altKey:false,metaKey:false,shiftKey:false,isComposing:false,defaultPrevented:false,preventDefault:vi.fn(),...overrides});
it('requires an explicit session and accepts only one activation until the key is released',()=>{
 const events=new KeyboardEvents();expect(events.keydown(press(),ready)).toBeNull();events.keyup({key:' '});events.start(['space','a']);
 expect(events.keydown(press(),ready)).toBe('space');expect(events.keydown(press(' ',{repeat:true}),ready)).toBeNull();expect(events.keydown(press(),ready)).toBeNull();
 events.keyup({key:' '});expect(events.keydown(press(),ready)).toBe('space');events.stop();events.keyup({key:' '});expect(events.keydown(press(),ready)).toBeNull();
});
it('never queues presses while busy or unready and does not treat a held key as a new activation after Run',()=>{
 const events=new KeyboardEvents();events.start(['space']);
 const busy=press();expect(events.keydown(busy,{...ready,busy:true})).toBeNull();expect(busy.preventDefault).toHaveBeenCalledOnce();
 expect(events.keydown(press(),ready)).toBeNull();events.keyup({key:' '});expect(events.keydown(press(),ready)).toBe('space');
 events.stop();events.start(['space']);expect(events.keydown(press(),ready)).toBeNull();events.releaseAll();expect(events.keydown(press(),{...ready,canMove:false})).toBeNull();
});
it.each(['editing','visible','ctrlKey','altKey','metaKey','shiftKey','isComposing','defaultPrevented'])('ignores %s without interfering with normal keyboard behavior',flag=>{
 const events=new KeyboardEvents();events.start(['space']);const input=press(' ',flag in ready?{}:{[flag]:true}),context={...ready,...(flag==='editing'?{editing:true}:flag==='visible'?{visible:false}:{})};
 expect(events.keydown(input,context)).toBeNull();expect(input.preventDefault).not.toHaveBeenCalled();events.keyup(input);expect(events.keydown(press(),ready)).toBe('space');
});
it('normalizes supported letters and arrows, ignores other keys and labels Space clearly',()=>{
 const events=new KeyboardEvents();events.start(['a','up']);expect(events.keydown(press('A'),ready)).toBe('a');expect(events.keydown(press('ArrowUp'),ready)).toBe('up');
 const unbound=press(' ');expect(events.keydown(unbound,ready)).toBeNull();expect(unbound.preventDefault).not.toHaveBeenCalled();expect(events.keydown(press('Enter'),ready)).toBeNull();expect(keyLabel('space')).toBe('Space');
});
const body:Instruction[]=[{kind:'move',blockId:'move',servo:1,target:2070}];
const project=()=>({instructions:[],keyEvents:[{blockId:'space-hat',key:'space',body}]});
it('round-trips keyboard stacks through format 3 and preserves old program formats',()=>{
 const text=saveProjectFile(project());expect(JSON.parse(text).schemaVersion).toBe(3);expect(loadProjectFile(text)).toEqual(project());expect(()=>loadProgramFile(text)).toThrow('not supported');
 const legacy=saveProjectFile({instructions:body,keyEvents:[]});expect(JSON.parse(legacy).schemaVersion).toBe(2);expect(loadProjectFile(legacy)).toEqual({instructions:body,keyEvents:[]});
 expect(loadProjectFile(JSON.stringify({format:'nexarm-classroom-program',schemaVersion:1,instructions:body})).keyEvents).toEqual([]);
});
it('rejects duplicate keys and source IDs, unsupported events and invalid code in any event before activation',()=>{
 expect(()=>copyProject({instructions:[],keyEvents:[...project().keyEvents,{blockId:'second',key:'space',body:[]}]})).toThrow('one When Space');
 expect(()=>copyProject({instructions:body,keyEvents:project().keyEvents})).toThrow('unique across');
 expect(()=>copyProject({instructions:[],keyEvents:[{blockId:'e',key:'Enter',body}]})).toThrow('Choose Space');
 expect(()=>copyProject({instructions:[],keyEvents:Array.from({length:17},(_,i)=>({blockId:`k${i}`,key:'a',body:[]}))})).toThrow('16');
 expect(()=>copyProject({instructions:[],keyEvents:[{blockId:'k',key:'space',body:[{kind:'coordinates',blockId:'retired'}]}]})).toThrow('XYZ');
 expect(()=>copyProject({instructions:[],keyEvents:[{blockId:'k',key:'space',body:[{kind:'move',blockId:'bad',servo:1,target:{kind:'variable',name:'unset'}}]}]})).toThrow('Set variable');
});
