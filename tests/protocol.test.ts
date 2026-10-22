import { describe, expect, it } from 'vitest';
import { encodeGoalPosition } from '../app/src/protocol/NexArmCodec';
import { decodePositions, FrameParser } from '../app/src/protocol/FrameParser';

function telemetry(id = 255, weak = false): Uint8Array {
  const payload = Array<number>(12).fill(0);
  for (let i = 0; i < 6; i++) payload.push(196, 9);
  const bytes = [255, 255, id, 26, 11, ...payload];
  const sum = (weak ? bytes.slice(2, 5) : bytes.slice(2)).reduce((a, b) => a + b, 0);
  return Uint8Array.from([...bytes, (~sum) & 255]);
}

describe('factory goal-position encoder', () => {
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
