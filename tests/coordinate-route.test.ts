import {describe,expect,it} from 'vitest';
import {coordinateArrivalIssues,coordinatePreflightTarget} from '../app/src/safety/CoordinateRoute';

const start={x:0,y:0,z:0,pitch:0,roll:0,claw:0};

describe('endpoint-first coordinate preflight',()=>{
  it('checks exactly the requested destination without inventing intermediate points',()=>{
    const target={x:30,y:-10,z:100,pitch:10,roll:0,claw:0,durationMs:1000};
    expect(coordinatePreflightTarget(target)).toEqual(target);
    expect(coordinatePreflightTarget({...start,z:570,durationMs:1000})).toMatchObject({z:570,durationMs:1000});
  });
  it('uses explicit final XYZ and orientation reporting tolerances',()=>{
    const target={x:100,y:50,z:25,pitch:10,roll:5,claw:-5,durationMs:500};
    expect(coordinateArrivalIssues({x:108,y:42,z:33,pitch:14,roll:1,claw:-1},target)).toEqual([]);
    expect(coordinateArrivalIssues({x:109,y:50,z:25,pitch:15,roll:5,claw:-5},target)).toEqual(['X reported 109, target 100','pitch reported 15, target 10']);
  });
});
