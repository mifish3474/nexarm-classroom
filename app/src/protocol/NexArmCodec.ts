export type ServoId = 1 | 2 | 3 | 4 | 5 | 6;

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
