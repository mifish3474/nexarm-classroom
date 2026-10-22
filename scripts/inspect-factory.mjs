// Static data extraction only. Never executes the supplied EXE or Python code.
// Outputs stay ignored; manufacturer assets are not automatically redistributed.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
const source = process.argv[2];
if (!source) throw new Error('Supply an executable path');
const bytes = fs.readFileSync(source);
const cookie = bytes.lastIndexOf(Buffer.from('4d45490c0b0a0b0e', 'hex'));
if (cookie < 0 || cookie + 88 > bytes.length) throw new Error('No supported PyInstaller cookie');
const start = cookie + 88 - bytes.readUInt32BE(cookie + 8);
const toc = start + bytes.readUInt32BE(cookie + 12), end = toc + bytes.readUInt32BE(cookie + 16);
if (start < 0 || toc < start || end > cookie) throw new Error('Invalid archive bounds');
const entries = [];
for (let p = toc; p < end;) {
  const size = bytes.readUInt32BE(p);
  if (size < 18 || p + size > end) throw new Error('Invalid entry');
  entries.push({ name: bytes.subarray(p + 18, p + size).toString().replace(/\0+$/, ''),
    offset: start + bytes.readUInt32BE(p + 4), compressed: bytes.readUInt32BE(p + 8),
    size: bytes.readUInt32BE(p + 12), flag: bytes[p + 16], type: String.fromCharCode(bytes[p + 17]) });
  p += size;
}
const output = path.resolve('.analysis/nexarm-factory');
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'archive-index.json'), JSON.stringify(entries, null, 2));
for (const entry of entries.filter(e => /\.urdf$|^PYZ\.pyz$|^main$/.test(e.name))) {
  if (entry.size > 20_000_000 || entry.offset < start || entry.offset + entry.compressed > toc) throw new Error('Invalid extraction bounds');
  const data = bytes.subarray(entry.offset, entry.offset + entry.compressed);
  const unpacked = entry.flag ? zlib.inflateSync(data, { maxOutputLength: 20_000_000 }) : data;
  if (unpacked.length !== entry.size) throw new Error('Unpacked size mismatch');
  const filename = path.basename(entry.name.replaceAll('\\', '/'));
  fs.writeFileSync(path.join(output, filename), unpacked);
  console.log(`Extracted data: ${filename} (${unpacked.length} bytes)`);
}
