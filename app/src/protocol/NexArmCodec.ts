import {validateCoordinateTarget} from './CoordinateTarget';
export type ServoId = 1 | 2 | 3 | 4 | 5 | 6;

// Factory CoordTab.send_coordinate_move: command 8, <hhhhhhH>, P*10 first.
// Firmware chooses the joint targets, speed and acceleration for this command.
export function encodeCoordinateTarget(input:unknown):Uint8Array {
  return encodeCoordinates(input,8);
}

// Manufacturer Robot_Arm_t::move(..., calc_only=true): identical arguments,
// command 7 calculates targets only. Never fall back to command 8.
export function encodeCoordinateCalculation(input:unknown):Uint8Array {
  return encodeCoordinates(input,7);
}
function encodeCoordinates(input:unknown,command:7|8):Uint8Array {
  const t=validateCoordinateTarget(input);
  const args=[Math.round(t.pitch*10),t.x,t.y,t.z,t.roll,t.claw,t.durationMs].flatMap(value=>[value&255,(value>>8)&255]);
  const body=[255,args.length+2,command,...args];
  return Uint8Array.from([255,255,...body,(~body.reduce((sum,value)=>sum+value,0))&255]);
}

// Back-to-back existing unicast frames in one USB write. This is not a new
// broadcast instruction or a guarantee of simultaneous arrival.
export function encodeSpeedPositions(targets:readonly {servo:number;target:number}[],speed:number,acceleration:number):Uint8Array {
  if(!targets.length||targets.length>6||new Set(targets.map(t=>t.servo)).size!==targets.length)throw new RangeError('Choose one to six distinct joints.');
  return Uint8Array.from(targets.flatMap(t=>[...encodeSpeedPosition(t.servo,t.target,speed,acceleration)]));
}

// Teacher-authorized smooth controls use this atomic speed/position command.
// Factory ServoTab.send_servo_cmd and manufacturer continuous-write layout.
export function encodeSpeedPosition(id:number,position:number,speed:number,acceleration:number):Uint8Array {
  encodeGoalPosition(id,position);
  if(!Number.isInteger(speed)||speed<1||speed>3400)throw new RangeError('Speed must be 1-3400; zero semantics are unverified.');
  if(!Number.isInteger(acceleration)||acceleration<1||acceleration>254)throw new RangeError('Acceleration must be 1-254.');
  const data=[id,10,3,0x29,acceleration,position&255,position>>8,0,0,speed&255,speed>>8];
  return Uint8Array.from([255,255,...data,(~data.reduce((sum,n)=>sum+n,0))&255]);
}

// Factory NexArm All Off / All On, recovered from supplied CommManager/ServoTab.
// This is system command61, not the unverified LeRobot bridge command98.
export function encodeFactoryHolding(enabled: boolean): Uint8Array {
  if (typeof enabled !== 'boolean') throw new TypeError('Holding selection must be boolean');
  const data = [255, 3, 61, enabled ? 1 : 0];
  return Uint8Array.from([255, 255, ...data, (~data.reduce((sum, n) => sum + n, 0)) & 255]);
}

// Encoding bytes does not grant permission to send them to hardware.
export function encodeGoalPosition(id: number, position: number): Uint8Array {
  if (!Number.isInteger(id) || id < 1 || id > 6) throw new RangeError('Unknown servo ID');
  if (!Number.isInteger(position) || position < 0 || position > 4095) {
    throw new RangeError('Position must be an integer raw value from 0 to 4095');
  }
  const data = [id, 5, 3, 0x2a, position & 255, position >> 8];
  return Uint8Array.from([255, 255, ...data, (~data.reduce((sum, n) => sum + n, 0)) & 255]);
}
