import {describe,expect,it} from 'vitest';
import {CommissioningAttempts,REVIEW_HISTORY_KEY} from '../app/src/safety/CommissioningAttempts';

function fixture(){
  const records=new Map<string,string>();
  const store={getItem:(key:string)=>records.get(key)??null,setItem:(key:string,value:string)=>{records.set(key,value);}};
  return {records,store,ledger:new CommissioningAttempts(store)};
}
describe('recorded teacher retry permission',()=>{
  it('retains the original marker and consumes one new marker without silently permitting another',()=>{
    const f=fixture();f.records.set('scope','original attempt');
    expect(f.ledger.reason('scope')).toContain('consumed');
    f.ledger.review('scope',[1,2,3,4,5,6],{phase:'Fault'});
    expect(f.ledger.reason('scope')).toBeNull();
    expect(f.ledger.history()[0]?.previousAttempt).toBe('original attempt');
    const key=f.ledger.consume('scope',{target:2048});
    expect(key).toMatch(/^scope\.retry\./);expect(f.records.get('scope')).toBe('original attempt');
    expect(f.records.has(key)).toBe(true);expect(f.ledger.reason('scope')).toContain('consumed');
    expect(()=>f.ledger.consume('scope',{})).toThrow();
  });
  it('does not transfer a review across scopes, stop, or reload',()=>{
    const f=fixture();f.records.set('a','used');f.records.set('b','used');
    f.ledger.review('a',[1,2,3,4,5,6],null);expect(f.ledger.reason('b')).toContain('consumed');
    expect(new CommissioningAttempts(f.store).reason('a')).toContain('consumed');
    f.ledger.clearPermit();expect(f.ledger.reason('a')).toContain('consumed');
  });
  it('rejects failed durable recording or malformed history without granting a retry',()=>{
    const f=fixture();f.records.set('a','used');f.records.set(REVIEW_HISTORY_KEY,'broken JSON');
    expect(()=>f.ledger.review('a',[1,2,3,4,5,6],null)).toThrow();expect(f.ledger.reason('a')).toContain('consumed');
    f.records.delete(REVIEW_HISTORY_KEY);
    const broken=new CommissioningAttempts({...f.store,setItem:()=>{throw new Error('No storage');}});
    expect(()=>broken.review('a',[1,2,3,4,5,6],null)).toThrow('No storage');expect(broken.reason('a')).toContain('consumed');
  });
});
