import {describe,expect,it} from 'vitest';
import {assertCoordinateSolutionContinuity,coordinateArrivalIssues,coordinateWaypoints} from '../app/src/safety/CoordinateRoute';

const start={x:0,y:0,z:0,pitch:0,roll:0,claw:0};

describe('preflighted Cartesian routes',()=>{
  it('splits linear and angular movement into bounded straight-line waypoints',()=>{
    const route=coordinateWaypoints(start,{x:30,y:-10,z:0,pitch:10,roll:0,claw:0,durationMs:1000});
    expect(route).toHaveLength(2);expect(route[0]).toMatchObject({x:15,y:-5,z:0,pitch:5,durationMs:500});expect(route[1]).toMatchObject({x:30,y:-10,z:0,pitch:10,durationMs:500});
  });
  it('rejects overlong routes and abrupt controller solution changes',()=>{
    expect(()=>coordinateWaypoints({...start,z:-570},{x:550,y:0,z:570,pitch:180,roll:90,claw:90,durationMs:1000})).toThrow('intermediate saved position');
    expect(()=>assertCoordinateSolutionContinuity([2000,2000,2000,2000,2000,2000],[2000,2000,2351,2000,2000,2000],2)).toThrow('J3 by 351');
    expect(()=>assertCoordinateSolutionContinuity([2000,2000,2000,2000,2000,2000],[2000,2000,2350,2000,2000,2000],2)).not.toThrow();
  });
  it('uses explicit final XYZ and orientation reporting tolerances',()=>{
    const target={x:100,y:50,z:25,pitch:10,roll:5,claw:-5,durationMs:500};
    expect(coordinateArrivalIssues({x:108,y:42,z:33,pitch:14,roll:1,claw:-1},target)).toEqual([]);
    expect(coordinateArrivalIssues({x:109,y:50,z:25,pitch:15,roll:5,claw:-5},target)).toEqual(['X reported 109, target 100','pitch reported 15, target 10']);
  });
});
