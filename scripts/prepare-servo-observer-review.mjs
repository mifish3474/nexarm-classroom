// Generates local review artifacts only. It cannot open a port or run a flasher.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyBackup, planApplication, verifyBuildAudit, appOffset, appSlotBytes, sha256 } from './lib/nexarm-firmware.mjs';

const [backupDirectory, candidateFile] = process.argv.slice(2);
if (!backupDirectory || !candidateFile || process.argv.length !== 4) {
  throw Error('Usage: node scripts/prepare-servo-observer-review.mjs BACKUP_DIRECTORY APPLICATION_BIN');
}
const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const analysis = fs.realpathSync(path.join(repo, '.analysis'));
const backup = verifyBackup(backupDirectory);
const candidate = fs.readFileSync(candidateFile);
const audit = JSON.parse(fs.readFileSync(path.join(path.dirname(candidateFile), 'build-audit.json'), 'utf8').replace(/^\uFEFF/, ''));
const sourceDirectory = path.join(repo, 'firmware', 'servo-observer');
verifyBuildAudit(candidate, audit, sourceDirectory);
const originalSlot = backup.bytes.subarray(appOffset, appOffset + appSlotBytes);
const plan = planApplication(candidate, originalSlot);
const directory = fs.mkdtempSync(path.join(analysis, 'servo-observer-review-'));
const observerPath = path.join(directory, 'observer-app.bin');
const restorePath = path.join(directory, 'original-app-slot.bin');
fs.writeFileSync(observerPath, candidate, { flag: 'wx' });
fs.writeFileSync(restorePath, originalSlot, { flag: 'wx' });
fs.writeFileSync(path.join(directory, 'build-audit.json'), JSON.stringify(audit, null, 2) + '\n', { flag: 'wx' });
for (const name of ['servo-observer.ino', 'FlashWriteGuards.cpp']) fs.copyFileSync(path.join(sourceDirectory, name), path.join(directory, name), fs.constants.COPYFILE_EXCL);
if (sha256(fs.readFileSync(observerPath)) !== plan.sha256 || sha256(fs.readFileSync(restorePath)) !== plan.originalSlotSha256) throw Error('Review artifact write verification failed.');
const review = {
  schema: 'nexarm-servo-observer-review-1', preparedAtUtc: new Date().toISOString(),
  backupSha256: backup.sha256, ...plan,
  preservedRegions: ['bootloader', 'partition table', 'NVS', 'OTA metadata', 'SPIFFS', 'coredump'],
  scope: 'ESP32 application partition only; no AT32 or servo-memory recovery claim.',
  verification: 'File integrity and bounds only, not firmware behavior or a tested restore.',
  install: { file: 'observer-app.bin', args: ['--chip', 'esp32', '--port', '<CONFIRMED_PORT>', '--baud', '115200', '--before', 'default-reset', '--after', 'no-reset', 'write-flash', '0x10000', observerPath] },
  restore: { file: 'original-app-slot.bin', bytes: appSlotBytes, args: ['--chip', 'esp32', '--port', '<CONFIRMED_PORT>', '--baud', '115200', '--before', 'default-reset', '--after', 'no-reset', 'write-flash', '0x10000', restorePath] },
  nextGates: ['Separate operator approval for firmware installation and supported-arm restart.', 'Check actual device/security state without force or fuse changes.', 'Verify installed/returned bytes before starting either program.', 'A full erase or factory-file substitution is outside this plan.'],
};
fs.writeFileSync(path.join(directory, 'review.json'), JSON.stringify(review, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ directory, ...plan, backupSha256: backup.sha256 }, null, 2));
