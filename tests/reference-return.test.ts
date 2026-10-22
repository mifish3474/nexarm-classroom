import {describe,expect,it} from 'vitest';
import {referenceReturnProposal} from '../app/src/safety/ReferenceReturnProposal';
describe('read-only return-to-reference proposal',()=>{
  it('proposes only shoulder then elbow waypoints from the reported pose, bounded to 16 nominal raw units',()=>{
    const steps=referenceReturnProposal([2046,2009,1943,2048,2044,2052]);
    expect(steps.map(s=>[s.servo,s.target])).toEqual([[2,2022],[2,2035],[2,2048],[3,1958],[3,1973],[3,1988],[3,2002],[3,2017],[3,2032],[3,2047]]);
    expect(steps.every(s=>s.delta>0&&s.delta<=16)).toBe(true);
    expect(referenceReturnProposal([2046,2004,1938,2048,2044,2052]).every(step=>Math.abs(step.delta)<=16)).toBe(true);
  });
  it('rejects readings outside the local commissioning envelope and unknown readings',()=>{
    for(const readings of [[2046,1999,1943,2048,2044,2052],[NaN],[2038,2009,1943,2048,2044,2052]])expect(()=>referenceReturnProposal(readings)).toThrow();
  });
  it('covers all six joints, supports negative returns, and skips joints already near reference',()=>{
    const steps=referenceReturnProposal([2068,2064,2063,2069,2063,2073]);
    expect([...new Set(steps.map(s=>s.servo))]).toEqual([2,3,4,5,1,6]);
    expect(steps.every(s=>s.delta<0&&s.delta>=-20)).toBe(true);
    expect(referenceReturnProposal([2048,2048,2047,2048,2042,2053])).toEqual([]);
    expect(referenceReturnProposal([2039,2039,2038,2039,2033,2044])).toEqual([]);
  });
});
