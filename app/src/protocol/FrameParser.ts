export interface Frame {
  readonly deviceId: number;
  readonly command: number;
  readonly payload: readonly number[];
  readonly integrity: 'full' | 'abbreviated-only';
}

// Bounded buffer. Caller should bound chunk processing time before integrating
// into a future live UI; this pure parser does not authorize motion.
export class FrameParser {
  private buffer: number[] = [];

  reset(): void { this.buffer = []; }

  push(bytes: Uint8Array): Frame[] {
    const frames: Frame[] = [];
    for (const byte of bytes) {
      this.buffer.push(byte);
      this.drain(frames);
    }
    return frames;
  }

  private drain(frames: Frame[]): void {
    while (this.buffer.length >= 2) {
      if (this.buffer[0] !== 255 || this.buffer[1] !== 255) {
        this.buffer.shift(); continue;
      }
      if (this.buffer.length < 4) return;
      const length = this.buffer[3]!;
      if (length < 2 || length > 100) { this.buffer.shift(); continue; }
      const size = length + 4;
      if (this.buffer.length < size) return;
      const packet = this.buffer.slice(0, size);
      const full = (~packet.slice(2, -1).reduce((sum, n) => sum + n, 0)) & 255;
      const abbreviated = (~packet.slice(2, 5).reduce((sum, n) => sum + n, 0)) & 255;
      const check = packet[size - 1];
      if (check !== full && check !== abbreviated) { this.buffer.shift(); continue; }
      frames.push({ deviceId: packet[2]!, command: packet[4]!, payload: packet.slice(5, -1), integrity: check === full ? 'full' : 'abbreviated-only' });
      this.buffer.splice(0, size);
    }
  }
}

// Weak-checksum frames are available for diagnostics only. They cannot become
// trusted position feedback through this decoder.
export function decodePositions(frame: Frame): readonly number[] | null {
  if (frame.deviceId !== 255 || frame.command !== 11 || frame.payload.length !== 24 || frame.integrity !== 'full') return null;
  const values = Array.from({ length: 6 }, (_, i) => frame.payload[12 + i * 2]! + 256 * frame.payload[13 + i * 2]!);
  return values.every(value => value <= 4095) ? values : null;
}

export interface ReportedPose {
  readonly x:number;readonly y:number;readonly z:number;
  readonly pitch:number;readonly roll:number;readonly claw:number;
}

// Factory handle_packet decodes the first six bytes as <hhh. Accept only the
// same fully checked passive frame used for joint feedback; no new query path.
export function decodeReportedPose(frame:Frame):ReportedPose|null {
  if(!decodePositions(frame))return null;
  const signed16=(offset:number)=>{
    const value=frame.payload[offset]!+256*frame.payload[offset+1]!;
    return value>=0x8000?value-0x10000:value;
  };
  // Match the factory viewer: only pitch has an additional factor of ten.
  return {x:signed16(0),y:signed16(2),z:signed16(4),pitch:signed16(6)/10,roll:signed16(8),claw:signed16(10)};
}
