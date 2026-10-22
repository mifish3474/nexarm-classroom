import {describe,expect,it} from 'vitest';
import {MANUAL_STATE_KEY,ManualPositioning} from '../app/src/safety/ManualPositioning';
function fixture(){const records=new Map<string,string>();const store={getItem:(key:string)=>records.get(key)??null,setItem:(key:string,value:string)=>{records.set(key,value);}};return {records,store,manual:new ManualPositioning(store)};}
describe('durable manual-positioning interlock',()=>{
  it('retains the interlock after reload, and clears it only after a recorded physical confirmation',()=>{
    const f=fixture(),pose=[2048,2048,2047,2048,2042,2053];f.manual.enable();f.manual.begin('release',0,pose);f.manual.sent('release',pose);
    const reloaded=new ManualPositioning(f.store);expect(reloaded.phase).toBe('Recovery required');expect(reloaded.blocked).toBe(true);
    reloaded.confirm(pose);expect(new ManualPositioning(f.store).phase).toBe('Normal');
    expect(JSON.parse(f.records.get(MANUAL_STATE_KEY)!).events).toHaveLength(3);
  });
  it('never treats a late completion after interruption as permission to resume',()=>{
    const f=fixture(),pose=[2048,2048,2047,2048,2042,2053];f.manual.enable();f.manual.begin('release',0,pose);f.manual.interrupt('Page hidden',pose);f.manual.sent('release',pose);
    expect(f.manual.phase).toBe('Recovery required');expect(()=>f.manual.enable()).toThrow();
    expect(f.manual.report().physicalTorqueState).toBe('not measured');
  });
  it('fails closed on invalid persistent records, and never consumes an unsent release',()=>{
    const f=fixture();f.manual.enable();f.manual.interrupt('Stop',[]);expect(f.records.size).toBe(0);expect(f.manual.blocked).toBe(false);
    f.records.set(MANUAL_STATE_KEY,'{bad');expect(new ManualPositioning(f.store).phase).toBe('Recovery required');
    f.records.set(MANUAL_STATE_KEY,JSON.stringify({requiresHoldingVerification:false,events:[{}]}));expect(new ManualPositioning(f.store).phase).toBe('Recovery required');
  });
});
