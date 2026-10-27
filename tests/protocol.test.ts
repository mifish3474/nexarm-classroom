import { describe, expect, it } from 'vitest';
import { encodeFactoryHolding, encodeGoalPosition } from '../app/src/protocol/NexArmCodec';
import { decodePositions, decodeReportedPose, FrameParser } from '../app/src/protocol/FrameParser';

function telemetry(id = 255, weak = false): Uint8Array {
  const payload = Array<number>(12).fill(0);
  for (let i = 0; i < 6; i++) payload.push(196, 9);
  const bytes = [255, 255, id, 26, 11, ...payload];
  const sum = (weak ? bytes.slice(2, 5) : bytes.slice(2)).reduce((a, b) => a + b, 0);
  return Uint8Array.from([...bytes, (~sum) & 255]);
}

describe('factory goal-position encoder', () => {
  it('encodes the supplied factory All Off / All On path, independently from position or bridge commands',()=>{
    expect([...encodeFactoryHolding(false)]).toEqual([255,255,255,3,61,0,192]);
    expect([...encodeFactoryHolding(true)]).toEqual([255,255,255,3,61,1,191]);
    expect(()=>encodeFactoryHolding(1 as unknown as boolean)).toThrow(TypeError);
  });
  it('preserves the verified register-write format and little-endian target', () => {
    expect([...encodeGoalPosition(1, 2500)]).toEqual([255, 255, 1, 5, 3, 42, 196, 9, 255]);
  });
  it('encodes the proposed Reference A single-axis test without sending it', () => {
    expect([...encodeGoalPosition(1, 2068)]).toEqual([0xff, 0xff, 0x01, 0x05, 0x03, 0x2a, 0x14, 0x08, 0xb0]);
  });
  it.each([0, 7, 1.5, NaN, Infinity])('rejects invalid servo ID %s', id => {
    expect(() => encodeGoalPosition(id, 2500)).toThrow(RangeError);
  });
  it.each([-1, 4096, 20.5, NaN, Infinity])('rejects invalid raw target %s before bitwise conversion', value => {
    expect(() => encodeGoalPosition(1, value)).toThrow(RangeError);
  });
});

describe('passive streaming telemetry', () => {
  it('decodes signed XYZ and factory pitch/roll/claw scaling from the supplied factory log at every chunk boundary',()=>{
    const packet=Uint8Array.from('FF FF FF 1A 0B 27 00 FF FF 8F 01 B8 00 08 00 A9 FF 10 08 BF 0A 67 07 54 09 5F 08 24 04 83'.split(' ').map(byte=>parseInt(byte,16)));
    for(let split=1;split<packet.length;split++){
      const parser=new FrameParser();expect(parser.push(packet.slice(0,split))).toEqual([]);
      const frame=parser.push(packet.slice(split))[0]!;
      expect(decodeReportedPose(frame)).toEqual({x:39,y:-1,z:399,pitch:18.4,roll:8,claw:-87});
      expect(decodePositions(frame)).toEqual([2064,2751,1895,2388,2143,1060]);
    }
  });
  it('preserves signed 16-bit extrema and genuine zero values without clamping coordinates',()=>{
    const frame=new FrameParser().push(telemetry())[0]!;
    const payload=[...frame.payload];payload.splice(0,12,0,128,255,127,0,0,255,255,0,128,255,127);
    expect(decodeReportedPose({...frame,payload})).toEqual({x:-32768,y:32767,z:0,pitch:-.1,roll:-32768,claw:32767});
  });
  it('never promotes weak, wrong-layout, wrong-ID, wrong-command or invalid-joint frames to coordinate reports',()=>{
    const frame=new FrameParser().push(telemetry())[0]!;
    for(const invalid of [{...frame,deviceId:90},{...frame,command:75},{...frame,payload:frame.payload.slice(0,6)},{...frame,integrity:'abbreviated-only' as const}])expect(decodeReportedPose(invalid)).toBeNull();
    const payload=[...frame.payload];payload[12]=0;payload[13]=16;expect(decodeReportedPose({...frame,payload})).toBeNull();
  });
  it('decodes all two-chunk boundaries, including partial headers', () => {
    const bytes = telemetry();
    for (let split = 1; split < bytes.length; split++) {
      const parser = new FrameParser();
      expect(parser.push(bytes.slice(0, split))).toEqual([]);
      const frames = parser.push(bytes.slice(split));
      expect(frames).toHaveLength(1);
      expect(decodePositions(frames[0]!)).toEqual(Array(6).fill(2500));
    }
  });
  it('recovers through long noise, invalid lengths, and corrupt frames', () => {
    const parser = new FrameParser();
    expect(parser.push(new Uint8Array(100_000))).toEqual([]);
    const corrupt = telemetry(); corrupt[17] = 216;
    const bytes = Uint8Array.from([255, 255, 1, 0, ...corrupt, ...telemetry(), ...telemetry()]);
    const frames = parser.push(bytes);
    expect(frames).toHaveLength(2);
    expect(frames.map(decodePositions)).toEqual([Array(6).fill(2500), Array(6).fill(2500)]);
  });
  it('does not promote an unexpected device ID to trusted telemetry', () => {
    const frames = new FrameParser().push(telemetry(1));
    expect(frames).toHaveLength(1);
    expect(decodePositions(frames[0]!)).toBeNull();
  });
  it('labels payload-unprotected abbreviated frames and rejects them as feedback', () => {
    const bytes = telemetry(255, true); bytes[17] = 216;
    const frame = new FrameParser().push(bytes)[0]!;
    expect(frame.integrity).toBe('abbreviated-only');
    expect(decodePositions(frame)).toBeNull();
  });
  it('drops partial state when a session is reset', () => {
    const parser = new FrameParser(); parser.push(telemetry().slice(0, 12)); parser.reset();
    expect(parser.push(telemetry().slice(12))).toEqual([]);
    expect(parser.push(telemetry())).toHaveLength(1);
  });
});
