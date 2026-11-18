import {expect,it} from 'vitest';
import {NamedPositions,NAMED_POSITIONS_KEY} from '../app/src/poses/NamedPositions';
const pose=[2050,2150,2100,2200,2000,1080];
function store(){const map=new Map<string,string>();return {map,getItem:(key:string)=>map.get(key)??null,setItem:(key:string,value:string)=>{map.set(key,value);}};}
it('records independent six-joint measurements and reloads named positions locally',()=>{
 const storage=store(),positions=new NamedPositions(storage,()=> 'test-id'),values=[...pose];positions.add(' Pickup ',values);
 values[0]=0;expect(positions.list()[0]!.positions).toEqual(pose);positions.list()[0]!.positions[0]=0;expect(positions.list()[0]!.positions).toEqual(pose);
 const reloaded=new NamedPositions(storage);expect(reloaded.list()[0]!.name).toBe('Pickup');expect(JSON.parse(reloaded.export()).poses[0].positions).toEqual(pose);
 reloaded.remove('test-id');expect(new NamedPositions(storage).list()).toEqual([]);
});
it('rejects invalid measurements, duplicate labels and oversized/control-character names',()=>{
 const positions=new NamedPositions(store(),()=> 'test-id');positions.add('Pickup',pose);
 for(const name of ['', ' ', 'P'.repeat(41),'Drop\noff','pickup'])expect(()=>positions.add(name,pose)).toThrow();
 for(const values of [[0],[-1,...pose.slice(1)],[4096,...pose.slice(1)],[NaN,...pose.slice(1)],[1.5,...pose.slice(1)]])expect(()=>positions.add('Other',values)).toThrow();
 expect(positions.list()).toHaveLength(1);
});
it('keeps positions usable in memory if saving fails and supports export',()=>{
 const positions=new NamedPositions({getItem:()=>null,setItem:()=>{throw Error('Storage blocked');}},()=> 'test-id');positions.add('Dropoff',pose);
 expect(positions.message).toContain('Memory only');expect(JSON.parse(positions.export()).poses).toHaveLength(1);
});
it('preserves unreadable saved data until an explicit clear, without touching holding state',()=>{
 const storage=store();storage.map.set(NAMED_POSITIONS_KEY,'invalid');storage.map.set('nexarm.commissioning.manual-positioning.v1','keep holding interlock');
 const positions=new NamedPositions(storage);expect(positions.canAdd).toBe(false);expect(()=>positions.add('Pickup',pose)).toThrow();expect(storage.getItem(NAMED_POSITIONS_KEY)).toBe('invalid');
 positions.clear();expect(positions.canAdd).toBe(true);expect(storage.getItem('nexarm.commissioning.manual-positioning.v1')).toBe('keep holding interlock');
});
it('bounds the saved list and validates persisted schemas without trusting extra data',()=>{
 const storage=store();let id=0;const positions=new NamedPositions(storage,()=>String(++id));for(let i=0;i<32;i++)positions.add(`Position ${i}`,pose);
 expect(positions.canAdd).toBe(false);expect(()=>positions.add('Too many',pose)).toThrow('32');
 const data=JSON.parse(positions.export());data.schemaVersion=999;storage.setItem(NAMED_POSITIONS_KEY,JSON.stringify(data));expect(new NamedPositions(storage).canAdd).toBe(false);
});
