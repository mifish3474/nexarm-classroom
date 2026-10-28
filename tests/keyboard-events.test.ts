import {it,expect,vi} from 'vitest';
import {KeyboardEvents,keyLabel,isEventKey,isStopKey,KEY_OPTIONS} from '../app/src/runtime/KeyboardEvents';
import {copyProject} from '../app/src/runtime/ProgramProject';
import {saveProjectFile,loadProjectFile,loadProgramFile} from '../app/src/runtime/ProgramFile';
import type {Instruction} from '../app/src/runtime/ProgramLanguage';

const ready={canMove:true,busy:false,editing:false,visible:true};
const press=(key='a',overrides:Record<string,unknown>={})=>({key,repeat:false,ctrlKey:false,altKey:false,metaKey:false,shiftKey:false,isComposing:false,defaultPrevented:false,preventDefault:vi.fn(),...overrides});
it('requires an explicit session and accepts only one activation until the key is released',()=>{
 const events=new KeyboardEvents();expect(events.keydown(press(),ready)).toBeNull();events.keyup({key:'a'});events.start(['a','b']);
 expect(events.keydown(press(),ready)).toBe('a');expect(events.keydown(press('a',{repeat:true}),ready)).toBeNull();expect(events.keydown(press(),ready)).toBeNull();
 events.keyup({key:'a'});expect(events.keydown(press(),ready)).toBe('a');events.stop();events.keyup({key:'a'});expect(events.keydown(press(),ready)).toBeNull();
});
it('never queues presses while busy or unready and does not treat a held key as a new activation after Run',()=>{
 const events=new KeyboardEvents();events.start(['a']);
 const busy=press();expect(events.keydown(busy,{...ready,busy:true})).toBeNull();expect(busy.preventDefault).toHaveBeenCalledOnce();
 expect(events.keydown(press(),ready)).toBeNull();events.keyup({key:'a'});expect(events.keydown(press(),ready)).toBe('a');
 events.stop();events.start(['a']);expect(events.keydown(press(),ready)).toBeNull();events.releaseAll();expect(events.keydown(press(),{...ready,canMove:false})).toBeNull();
});
it.each(['editing','visible','ctrlKey','altKey','metaKey','shiftKey','isComposing','defaultPrevented'])('ignores %s without interfering with normal keyboard behavior',flag=>{
 const events=new KeyboardEvents();events.start(['a']);const input=press('a',flag in ready?{}:{[flag]:true}),context={...ready,...(flag==='editing'?{editing:true}:flag==='visible'?{visible:false}:{})};
 expect(events.keydown(input,context)).toBeNull();expect(input.preventDefault).not.toHaveBeenCalled();events.keyup(input);expect(events.keydown(press(),ready)).toBe('a');
});
it('normalizes supported letters and arrows and reserves Space for Stop',()=>{
 const events=new KeyboardEvents();events.start(['a','up']);expect(events.keydown(press('A'),ready)).toBe('a');expect(events.keydown(press('ArrowUp'),ready)).toBe('up');
 const unbound=press(' ');expect(events.keydown(unbound,ready)).toBeNull();expect(unbound.preventDefault).not.toHaveBeenCalled();expect(events.keydown(press('Enter'),ready)).toBeNull();expect(keyLabel('a')).toBe('A');
});
it('never accepts Space as a programmed key, including a retained old binding',()=>{
 const events=new KeyboardEvents();events.start(['space','a']);
 expect(isEventKey('space')).toBe(false);expect(KEY_OPTIONS.some(option=>option[1]==='space')).toBe(false);
 expect(events.keydown(press(' '),ready)).toBeNull();expect(events.keydown(press('Spacebar'),ready)).toBeNull();
 expect(isStopKey({key:' ',code:'Space'})).toBe(true);expect(isStopKey({key:'Spacebar',code:''})).toBe(true);expect(isStopKey({key:'a',code:'KeyA'})).toBe(false);
});
const body:Instruction[]=[{kind:'move',blockId:'move',servo:1,target:2070}];
const project=()=>({instructions:[],keyEvents:[{blockId:'space-hat',key:'a',body}]});
it('round-trips keyboard stacks through format 3 and preserves old program formats',()=>{
 const text=saveProjectFile(project());expect(JSON.parse(text).schemaVersion).toBe(3);expect(loadProjectFile(text)).toEqual(project());expect(()=>loadProgramFile(text)).toThrow('not supported');
 const legacy=saveProjectFile({instructions:body,keyEvents:[]});expect(JSON.parse(legacy).schemaVersion).toBe(2);expect(loadProjectFile(legacy)).toEqual({instructions:body,keyEvents:[]});
 expect(loadProjectFile(JSON.stringify({format:'nexarm-classroom-program',schemaVersion:1,instructions:body})).keyEvents).toEqual([]);
});
it('rejects duplicate keys and source IDs, unsupported events and invalid code in any event before activation',()=>{
 expect(()=>copyProject({instructions:[],keyEvents:[...project().keyEvents,{blockId:'second',key:'a',body:[]}]})).toThrow('one When A');
 expect(()=>copyProject({instructions:body,keyEvents:project().keyEvents})).toThrow('unique across');
 expect(()=>copyProject({instructions:[],keyEvents:[{blockId:'e',key:'Enter',body}]})).toThrow('Choose an arrow');
 expect(()=>copyProject({instructions:[],keyEvents:Array.from({length:17},(_,i)=>({blockId:`k${i}`,key:'a',body:[]}))})).toThrow('16');
 expect(()=>copyProject({instructions:[],keyEvents:[{blockId:'k',key:'a',body:[{kind:'coordinates',blockId:'retired'}]}]})).toThrow('XYZ');
 expect(copyProject({instructions:[],keyEvents:[{blockId:'k',key:'a',body:[{kind:'move',blockId:'bad',servo:1,target:{kind:'variable',name:'unset'}}]}]}).keyEvents).toHaveLength(1);
});
it('loads old Space handlers for reassignment without permitting Check, Run or Save',()=>{
 const original={...project(),keyEvents:[{...project().keyEvents[0]!,key:'space'}]};
 const loaded=loadProjectFile(JSON.stringify({format:'nexarm-classroom-program',schemaVersion:3,...original}));
 expect(loaded.keyEvents).toEqual([{...original.keyEvents[0]!,key:'unassigned'}]);
 expect(()=>copyProject(original)).toThrow('Space is reserved for Stop');expect(()=>copyProject(loaded)).toThrow('Space is reserved for Stop');expect(()=>saveProjectFile(loaded)).toThrow('Space is reserved for Stop');
 loaded.keyEvents[0]!.key='b';expect(loadProjectFile(saveProjectFile(loaded)).keyEvents[0]!.body).toEqual(body);
});
