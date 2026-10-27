import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { inspectEspImage, verifyPartitionTable, verifyBackup, planApplication, verifyBuildAudit, flashGuards, sha256, appOffset, appSlotBytes, flashBytes } from '../lib/nexarm-firmware.mjs';

function image(payloadBytes = 128, app = true) {
  const cursor = 32 + payloadBytes;
  const checksumOffset = Math.ceil((cursor + 1) / 16) * 16 - 1;
  const b = Buffer.alloc(checksumOffset + 33);
  b[0] = 0xe9; b[1] = 1; b[3] = 0x20; b[23] = 1;
  b.writeUInt16LE(0xffff, 17);
  b.writeUInt32LE(app ? 0x3f400020 : 0x3fff0030, 24);
  b.writeUInt32LE(payloadBytes, 28);
  if (app) b.writeUInt32LE(0xabcd5432, 32);
  return seal(b, cursor, checksumOffset);
}
function seal(b, cursor, checksumOffset) {
  let checksum = 0xef;
  for (const byte of b.subarray(32, cursor)) checksum ^= byte;
  b[checksumOffset] = checksum;
  crypto.createHash('sha256').update(b.subarray(0, checksumOffset + 1)).digest().copy(b, checksumOffset + 1);
  return b;
}
function partitionDigest(b) {
  const p = 0x8000 + 5 * 32;
  b.fill(0xff, p, p + 32); b.writeUInt16LE(0xebeb, p);
  crypto.createHash('md5').update(b.subarray(0x8000, p)).digest().copy(b, p + 16);
}
function backup() {
  const b = Buffer.alloc(flashBytes, 0xff);
  const entries = [[1, 2, 0x9000, 0x5000], [1, 0, 0xe000, 0x2000], [0, 16, appOffset, appSlotBytes], [1, 130, 0x310000, 0xe0000], [1, 3, 0x3f0000, 0x10000]];
  entries.forEach(([type, subtype, offset, size], i) => {
    const p = 0x8000 + i * 32;
    b.fill(0, p, p + 32); b.writeUInt16LE(0x50aa, p);
    b[p + 2] = type; b[p + 3] = subtype;
    b.writeUInt32LE(offset, p + 4); b.writeUInt32LE(size, p + 8);
  });
  partitionDigest(b);
  image(128, false).copy(b, 0x1000); image().copy(b, appOffset);
  return b;
}

test('valid checksummed app is accepted, corruption and truncated bytes fail', () => {
  const b = image();
  assert.equal(inspectEspImage(b, 0, true).bytes, b.length);
  const badPayload = Buffer.from(b); badPayload[40] ^= 1;
  assert.throws(() => inspectEspImage(badPayload), /checksum/);
  const badDigest = Buffer.from(b); badDigest[badDigest.length - 1] ^= 1;
  assert.throws(() => inspectEspImage(badDigest), /SHA256/);
  assert.throws(() => inspectEspImage(b.subarray(0, 31)), /Truncated/);
  assert.throws(() => inspectEspImage(Buffer.concat([b, Buffer.from([0])]), 0, true), /trailing/);
});

test('wrong chip, incompatible revision and missing digest are rejected', () => {
  const chip = image(); chip.writeUInt16LE(9, 12);
  assert.throws(() => inspectEspImage(chip), /original ESP32/);
  const revision = image(); revision.writeUInt16LE(200, 15);
  assert.throws(() => inspectEspImage(revision), /revision/);
  const unsigned = image(); unsigned[23] = 0;
  assert.throws(() => inspectEspImage(unsigned), /digest/);
});

test('partition checksum and exact station app slot are required', () => {
  const b = backup(); assert.equal(verifyPartitionTable(b).length, 5);
  const badDigest = Buffer.from(b); badDigest[0x8004] ^= 1;
  assert.throws(() => verifyPartitionTable(badDigest), /digest|bounds|Overlapping/);
  const wrongSlot = Buffer.from(b); wrongSlot.writeUInt32LE(0x2ff000, 0x8000 + 2 * 32 + 8); partitionDigest(wrongSlot);
  assert.throws(() => verifyPartitionTable(wrongSlot), /slot layout/);
  const overlap = Buffer.from(b); overlap.writeUInt32LE(0x10000, 0x8000 + 3 * 32 + 4); partitionDigest(overlap);
  assert.throws(() => verifyPartitionTable(overlap), /Overlapping/);
});

test('full-slot restore is preserved, candidate writes stay within that slot', () => {
  const slot = Buffer.alloc(appSlotBytes, 0x6b);
  image().copy(slot);
  const original = Buffer.from(slot);
  const candidate = image(); const plan = planApplication(candidate, slot);
  assert.equal(plan.flashOffset, appOffset);
  assert.equal(plan.erasedBytes, 4096);
  assert.equal(plan.firmwareWriteApproved, false);
  assert.equal(plan.hardwareTested, false);
  assert.deepEqual(slot, original);
  assert.equal(plan.originalSlotSha256, sha256(original));
  assert.equal(planApplication(image(appSlotBytes - 80), slot).erasedBytes, appSlotBytes);
  assert.throws(() => planApplication(image(appSlotBytes - 64), slot), /leave the application slot/);
  assert.throws(() => planApplication(image(128, false), slot), /application data segment/);
  assert.throws(() => planApplication(candidate, slot.subarray(1)), /must be complete/);
  const otherFlashMode = image(); otherFlashMode[2] = 2;
  seal(otherFlashMode, 160, otherFlashMode.length - 33);
  assert.throws(() => planApplication(otherFlashMode, slot), /flash mode/);
});

test('two matching copies and matching pinned identity are both required', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexarm-image-test-'));
  const b = backup(), hash = sha256(b);
  const manifest = { bytesPerRead: flashBytes, matchingReads: true, sha256PerRead: [hash, hash] };
  fs.writeFileSync(path.join(dir, 'esp32-read-1.bin'), b);
  fs.writeFileSync(path.join(dir, 'esp32-read-2.bin'), b);
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  assert.equal(verifyBackup(dir, hash).sha256, hash);
  assert.throws(() => verifyBackup(dir), /identity/); // Synthetic image cannot stand in for the actual station.
  const different = Buffer.from(b); different[0x9000] ^= 1;
  fs.writeFileSync(path.join(dir, 'esp32-read-2.bin'), different);
  assert.throws(() => verifyBackup(dir, hash), /copies differ/);
  // Remove only explicitly created files; no recursive filesystem operation.
  for (const name of ['esp32-read-1.bin', 'esp32-read-2.bin', 'manifest.json']) fs.unlinkSync(path.join(dir, name));
  fs.rmdirSync(dir);
});

test('a previous binary, missing write guard or changed source cannot be packaged', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexarm-audit-test-'));
  const candidate = image();
  const names = ['servo-observer.ino', 'FlashWriteGuards.cpp'];
  for (const name of names) fs.writeFileSync(path.join(dir, name), 'test source');
  const audit = { core: 'esp32:esp32@2.0.12', standardArduinoNvsStartupAbsent: true, binarySha256: sha256(candidate), guardedFlashApis: [...flashGuards], sourceSha256: Object.fromEntries(names.map(n => [n, sha256(Buffer.from('test source'))])) };
  verifyBuildAudit(candidate, audit, dir);
  assert.throws(() => verifyBuildAudit(candidate, { ...audit, binarySha256: '0'.repeat(64) }, dir), /build audit/);
  assert.throws(() => verifyBuildAudit(candidate, { ...audit, guardedFlashApis: flashGuards.slice(1) }, dir), /guards/);
  assert.throws(() => verifyBuildAudit(candidate, { ...audit, standardArduinoNvsStartupAbsent: false }, dir), /build audit/);
  fs.writeFileSync(path.join(dir, names[0]), 'changed source');
  assert.throws(() => verifyBuildAudit(candidate, audit, dir), /source changed/);
  for (const name of names) fs.unlinkSync(path.join(dir, name));
  fs.rmdirSync(dir);
});
