// Offline file validation only. No serial/USB access or process execution.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const installedBackupSha256 = 'aaf99bb6449223fb9e7909df43b39e3b6ce3ef32c597b39bd6fb3f6f26ff0736';
export const flashBytes = 0x400000;
export const appOffset = 0x10000;
export const appSlotBytes = 0x300000;
export const flashGuards = ['esp_partition_write', 'esp_partition_write_raw', 'esp_partition_erase_range', 'esp_flash_write', 'esp_flash_erase_region', 'spi_flash_write', 'spi_flash_write_encrypted', 'spi_flash_erase_range', 'spi_flash_erase_sector'];
export const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

export function inspectEspImage(bytes, base = 0, exactLength = false) {
  if (!Number.isSafeInteger(base) || base < 0 || base + 24 > bytes.length || bytes[base] !== 0xe9) throw Error('Missing ESP image header.');
  if (bytes[base + 1] < 1 || bytes[base + 1] > 16) throw Error('Invalid segment count.');
  if (bytes.readUInt16LE(base + 12) !== 0) throw Error('Image is not for the original ESP32 chip.');
  if (bytes[base + 23] !== 1) throw Error('An appended SHA256 image digest is required.');
  const minRevision = Math.max(bytes[base + 14] * 100, bytes.readUInt16LE(base + 15));
  const maxRevision = bytes.readUInt16LE(base + 17);
  if (minRevision > 101 || (maxRevision !== 0 && maxRevision < 101)) throw Error('Image excludes the observed ESP32 revision 1.1.');
  let cursor = base + 24;
  let checksum = 0xef;
  const segments = [];
  for (let i = 0; i < bytes[base + 1]; ++i) {
    if (cursor + 8 > bytes.length) throw Error('Truncated segment header.');
    const address = bytes.readUInt32LE(cursor), size = bytes.readUInt32LE(cursor + 4);
    cursor += 8;
    if (size > appSlotBytes || cursor + size > bytes.length) throw Error('Truncated or oversized segment.');
    for (const byte of bytes.subarray(cursor, cursor + size)) checksum ^= byte;
    segments.push({ offset: cursor - base, address, size });
    cursor += size;
  }
  const checksumOffset = Math.ceil((cursor - base + 1) / 16) * 16 - 1 + base;
  const end = checksumOffset + 33;
  if (end > bytes.length) throw Error('Truncated image footer.');
  if (bytes[checksumOffset] !== checksum) throw Error('Image checksum mismatch.');
  const digest = crypto.createHash('sha256').update(bytes.subarray(base, checksumOffset + 1)).digest();
  if (!digest.equals(bytes.subarray(checksumOffset + 1, end))) throw Error('Image SHA256 digest mismatch.');
  if (exactLength && end !== bytes.length) throw Error('Unexpected trailing data; use an application-only, unsigned image.');
  return { bytes: end - base, sha256: sha256(bytes.subarray(base, end)), segments };
}

export function verifyPartitionTable(bytes) {
  if (bytes.length !== flashBytes) throw Error('Expected a complete 4 MiB ESP32 backup.');
  const entries = [];
  let digestFound = false;
  for (let p = 0x8000; p + 32 <= 0x9000; p += 32) {
    const magic = bytes.readUInt16LE(p);
    if (magic === 0xebeb) {
      const digest = crypto.createHash('md5').update(bytes.subarray(0x8000, p)).digest();
      if (!digest.equals(bytes.subarray(p + 16, p + 32))) throw Error('Partition-table digest mismatch.');
      digestFound = true;
      break;
    }
    if (magic !== 0x50aa) throw Error('Invalid partition table.');
    const offset = bytes.readUInt32LE(p + 4), size = bytes.readUInt32LE(p + 8);
    if (!size || offset % 4096 || size % 4096 || offset + size > bytes.length) throw Error('Invalid partition bounds.');
    if (entries.some(e => offset < e.offset + e.size && e.offset < offset + size)) throw Error('Overlapping partitions.');
    entries.push({ type: bytes[p + 2], subtype: bytes[p + 3], offset, size, flags: bytes.readUInt32LE(p + 28) });
  }
  if (!digestFound) throw Error('Missing partition-table digest.');
  const apps = entries.filter(e => e.type === 0);
  if (apps.length !== 1 || apps[0].offset !== appOffset || apps[0].size !== appSlotBytes || apps[0].subtype !== 16 || apps[0].flags !== 0) {
    throw Error('Application-slot layout differs from the reviewed station.');
  }
  return entries;
}

export function verifyBackup(directory, expectedHash = installedBackupSha256) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8').replace(/^\uFEFF/, ''));
  const first = fs.readFileSync(path.join(directory, 'esp32-read-1.bin'));
  const second = fs.readFileSync(path.join(directory, 'esp32-read-2.bin'));
  if (first.length !== flashBytes || second.length !== flashBytes || manifest.bytesPerRead !== flashBytes || manifest.matchingReads !== true) throw Error('Incomplete backup.');
  if (!first.equals(second)) throw Error('Backup copies differ.');
  const hash = sha256(first);
  if (hash !== expectedHash || manifest.sha256PerRead?.length !== 2 || manifest.sha256PerRead.some(h => typeof h !== 'string' || h.toLowerCase() !== hash)) throw Error('Backup identity or manifest mismatch.');
  const partitions = verifyPartitionTable(first);
  const bootloader = inspectEspImage(first, 0x1000);
  const application = inspectEspImage(first, appOffset);
  if (application.bytes > appSlotBytes) throw Error('Application exceeds its partition.');
  return { bytes: first, sha256: hash, partitions, bootloader, application };
}

export function planApplication(candidate, originalSlot) {
  if (originalSlot.length !== appSlotBytes) throw Error('Original application slot must be complete.');
  const image = inspectEspImage(candidate, 0, true);
  if (candidate[2] !== originalSlot[2] || candidate[3] !== originalSlot[3]) throw Error('Candidate flash mode/size/frequency differs from the installed application.');
  const erasedBytes = Math.ceil(candidate.length / 4096) * 4096;
  if (erasedBytes > appSlotBytes) throw Error('Candidate erase range would leave the application slot.');
  if (image.segments[0].address < 0x3f400000 || image.segments[0].address >= 0x3f800000) throw Error('Candidate does not start with an ESP32 application data segment.');
  // The native ESP-IDF application descriptor distinguishes apps from bootloaders.
  if (candidate.readUInt32LE(32) !== 0xabcd5432) throw Error('Missing ESP-IDF application descriptor.');
  return { flashOffset: appOffset, fileBytes: candidate.length, erasedBytes, sha256: sha256(candidate), originalSlotSha256: sha256(originalSlot), firmwareWriteApproved: false, hardwareTested: false };
}

export function verifyBuildAudit(candidate, audit, sourceDirectory) {
  if (audit.core !== 'esp32:esp32@2.0.12' || audit.standardArduinoNvsStartupAbsent !== true || audit.binarySha256?.toLowerCase() !== sha256(candidate)) throw Error('Missing or mismatched guarded build audit.');
  if (!Array.isArray(audit.guardedFlashApis) || audit.guardedFlashApis.length !== flashGuards.length || flashGuards.some(name => !audit.guardedFlashApis.includes(name))) throw Error('Incomplete flash-write guards.');
  for (const name of ['servo-observer.ino', 'FlashWriteGuards.cpp']) {
    if (audit.sourceSha256?.[name]?.toLowerCase() !== sha256(fs.readFileSync(path.join(sourceDirectory, name)))) throw Error('Build source changed since its audit.');
  }
}
