import {describe,expect,it} from 'vitest';
import {StagedReferenceReturn} from '../app/src/safety/StagedReferenceReturn';
describe('staged return scheduling',()=>{
  it('requires write completion, stable readback, and command spacing before the next waypoint',()=>{
    const before=[2046,2009,1943,2048,2044,2052],run=new StagedReferenceReturn(before,0);run.start(before,0);
    expect(run.next(0)?.target).toBe(2029);expect(run.next(1)).toBeNull();
    const after=[2046,2029,1943,2048,2044,2052];for(const at of [100,200,300])run.observe(after,at);
    expect(run.index).toBe(0);run.written(300);expect(run.index).toBe(1);
    run.observe(after,600);expect(run.next(899)).toBeNull();expect(run.next(900)?.target).toBe(2048);
  });
  it('does not chase residual error or accept a late write as completion',()=>{
    const before=[2066,2044,2043,2049,2043,2053],run=new StagedReferenceReturn(before,0);run.start(before,0);run.next(0);
    for(const at of [100,200,300])run.observe([2048,2044,2043,2049,2043,2053],at);
    run.written(2100);expect(run.phase).toBe('Fault');expect(run.next(2200)).toBeNull();
  });
  it('supervises uncommanded drift during the pause between waypoints',()=>{
    const before=[2046,2009,1943,2048,2044,2052],run=new StagedReferenceReturn(before,0);run.start(before,0);
    run.next(0);run.written(0);
    for(const at of [100,200,300])run.observe([2046,2029,1943,2048,2044,2052],at);
    expect(run.index).toBe(1);
    run.observe([2046,2029,1943,2061,2044,2052],400);
    expect(run.phase).toBe('Fault');expect(run.next(900)).toBeNull();
  });
});
