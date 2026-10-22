// Minimal bounded Python 3.8 marshal reader for static inspection. Does not
// import, execute, or evaluate Python instructions. Not a general decompiler.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
class Reader {
  constructor(bytes) { this.bytes = bytes; this.pos = 0; this.refs = []; this.objects = 0; }
  take(n) { if (n < 0 || this.pos + n > this.bytes.length) throw new Error('Invalid marshal bounds'); const b = this.bytes.subarray(this.pos, this.pos+n); this.pos += n; return b; }
  int() { return this.take(4).readInt32LE(); }
  read(depth = 0) {
    if (depth > 100 || ++this.objects > 1_000_000) throw new Error('Marshal resource limit');
    const raw = this.take(1)[0], tag = String.fromCharCode(raw & 127);
    const ref = raw & 128 ? this.refs.push(null) - 1 : -1;
    let value;
    const next = () => this.read(depth + 1);
    switch (tag) {
      case '0': return undefined;
      case 'N': value = null; break;
      case 'T': value = true; break;
      case 'F': value = false; break;
      case '.': value = { python: 'Ellipsis' }; break;
      case 'S': value = { python: 'StopIteration' }; break;
      case 'i': value = this.int(); break;
      case 'I': value = Number(this.take(8).readBigInt64LE()); break;
      case 'l': { const count = this.int(); let total = 0n; if (Math.abs(count) > 10000) throw new Error('Large integer'); for (let i=0; i<Math.abs(count); i++) total += BigInt(this.take(2).readUInt16LE()) << BigInt(i*15); value = Number(count < 0 ? -total : total); break; }
      case 'g': value = this.take(8).readDoubleLE(); break;
      case 'f': value = Number(this.take(this.take(1)[0]).toString()); break;
      case 'y': value = { real: this.take(8).readDoubleLE(), imaginary: this.take(8).readDoubleLE() }; break;
      case 's': value = this.take(this.int()); break;
      case 'u': case 't': case 'a': case 'A': value = this.take(this.int()).toString('utf8'); break;
      case 'z': case 'Z': value = this.take(this.take(1)[0]).toString('utf8'); break;
      case 'r': { const index = this.int(); if(index < 0 || index >= this.refs.length) throw new Error('Invalid reference'); value = this.refs[index]; break; }
      case '(': case ')': case '[': case '<': case '>': {
        const count = tag === ')' ? this.take(1)[0] : this.int();
        if (count < 0 || count > 1_000_000) throw new Error('Invalid collection length');
        value = []; if (ref >= 0) this.refs[ref] = value;
        for (let i=0; i<count; i++) value.push(next()); break;
      }
      case '{': { value = {}; if (ref >= 0) this.refs[ref] = value; while (true) { const key = next(); if (key === undefined) break; Object.defineProperty(value,String(key),{value:next(),enumerable:true,configurable:true}); } break; }
      case 'c': {
        value = { kind: 'code' }; if (ref >= 0) this.refs[ref] = value;
        for (const key of ['argcount','posonlyargcount','kwonlyargcount','nlocals','stacksize','flags']) value[key] = this.int();
        for (const key of ['bytecode','consts','names','varnames','freevars','cellvars','filename','name']) value[key] = next();
        value.firstline = this.int(); value.lnotab = next(); break;
      }
      default: throw new Error(`Unsupported marshal tag ${tag} at ${this.pos-1}`);
    }
    if (ref >= 0) this.refs[ref] = value;
    return value;
  }
}
const dir = path.resolve('.analysis/nexarm-factory');
const pyz = fs.readFileSync(path.join(dir,'PYZ.pyz'));
if (pyz.subarray(0,4).toString('hex') !== '50595a00') throw new Error('Unsupported PYZ');
const toc = new Reader(pyz.subarray(pyz.readUInt32BE(8))).read();
const entries = Array.isArray(toc) ? toc : Object.entries(toc);
fs.writeFileSync(path.join(dir,'python-module-index.json'), JSON.stringify(entries,null,2));
for (const [name, info] of entries.filter(([name]) => /nexarm|kinematic|servo|comm_protocol|robot_arm/i.test(name))) {
  const [,position,size] = info;
  const unpacked = zlib.inflateSync(pyz.subarray(position,position+size), {maxOutputLength: 20_000_000});
  const reader = new Reader(unpacked); const code = reader.read();
  if(reader.pos !== unpacked.length) throw new Error('Trailing marshal data');
  fs.writeFileSync(path.join(dir,`${name}.json`), JSON.stringify(code,null,2));
  console.log(`Read static code data: ${name} (${unpacked.length} bytes)`);
}
