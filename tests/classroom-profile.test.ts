import {expect,it} from 'vitest';
import {classroomProfile,checkClassroomPositions} from '../app/src/safety/ClassroomProfile';
const input=()=>({schemaVersion:1,limits:Array.from({length:6},()=>({min:1000,max:2500})),speed:600,acceleration:10});
it('validates and copies station settings without trusting input authority',()=>{
 const original=input(),profile=classroomProfile({...original,armed:true});original.limits[0]!.max=4095;
 expect(profile.limits[0]!.max).toBe(2500);expect(profile).not.toHaveProperty('armed');checkClassroomPositions(Array(6).fill(2048),profile);
 expect(()=>checkClassroomPositions([2501,2048,2048,2048,2048,2048],profile)).toThrow('S1');
});
it('rejects missing, malformed and reversed station limits and unbounded speed',()=>{
 for(const bad of [null,{}, {...input(),schemaVersion:2},{...input(),limits:[]},{...input(),speed:601},{...input(),speed:0},{...input(),acceleration:100},{...input(),limits:[{min:2000,max:1000},...input().limits.slice(1)]},{...input(),limits:[{min:NaN,max:2000},...input().limits.slice(1)]}])expect(()=>classroomProfile(bad)).toThrow();
});
