# Servo observer experiment — October 27, 2026

## Outcome

The approved temporary observer ran, captured the internal UART, and was replaced
with the original application. The original application slot verified against
the backup, then returned ESP32 1.0.2 / AT32 1.0.2 and 25 valid position reports.
COM17 was closed after the check. The classroom application remains dev.46.

No individual-servo reply appeared in either capture. The ESP32 receive filter
is therefore not the only obstacle to the tested read. Merely removing that
filter would not expose a reply that was absent from the observed input.

This does not establish whether the AT32 received/forwarded the request, whether
the servo answered on another bus segment, or what response policy/configuration
is involved. It does not establish that the servos lack sensors/protection.

## Approved scope and observations

The operator approved installation, a passive capture, one J1 position-read
probe, and original-application restoration with the arm independently supported.
The operator then confirmed it remained stationary and supported after observer
startup, before the J1 probe. No motion, torque, servo configuration, calibration,
mode or obstruction-test command was sent by the experiment.

| Capture | Request | Incoming bytes | Fully checked frames | Loss/error counters |
| --- | --- | --- | --- | --- |
| Passive, 14:43:09 UTC | None downstream | 240 | Eight ID0x5A / function11 / 24-byte-payload position broadcasts | 0 omitted bytes; 0 observed UART-error events |
| J1, 14:44:42 UTC | One `FF FF 01 04 02 38 02 BE` at 500 ms | 300 | Ten ID0x5A / function11 / 24-byte-payload position broadcasts | 0 omitted bytes; 0 observed UART-error events |

Both captures completed normally. Neither contained an individual ID1–6 frame,
unframed bytes, a differently checksummed reply or readable extra response text.
The UART receiver was demonstrably receiving valid AT32 broadcasts. The J1
capture reports its eight-byte write accepted by the UART driver with no short
write; that is not an independent measurement of bytes on the physical TX wire.
Its observation window was two seconds total, about 1.5 seconds after the read.
The error counters are bounded observations, not a proof of zero electrical loss.

Files remain local/ignored:

- `.analysis/servo-observer-capture-20261027T144309Z-7132db4b966f4493afd6e12cc5b381db.jsonl`
- `.analysis/servo-observer-capture-20261027T144442Z-0d860935bc084767afe57db4eb185308.jsonl`
- `.analysis/observer-experiment-20261027T143710Z/` contains preflight, installation,
  readback, restoration and status logs/binaries. No captures or backup contents
  were uploaded.

## Installation and recovery evidence

The frozen candidate was the [reviewed](SERVO_OBSERVER_REVIEW.md) observer with
SHA256 `56ed0d3ac944acb51dedb434c17c3426a5250701c693d72e2d9bc4aba6d33971`.
Preflight confirmed the actual bootloader/partition identity, unchanged OTA
metadata and original application digest. Read-only eFuse summary reported both
secure-boot bits false and flash-encryption count zero. No fuse write or security
bypass was used.

Only 0x10000–0x4BFFF was erased/written for observer installation. A 245,760-byte
readback matched the candidate byte-for-byte, with erased padding as expected.
The observer was started only after this check.

After the captures, the entire original 3 MiB application slot was written at
0x10000 from `original-app-slot.bin`, SHA256
`cceb0077fbe4e4dbae391828be099ee741ec463f95b15cb178e70d7c417f6a12`.
Both the write verification and a separate `verify-flash` digest comparison
succeeded. The before/after first 64 KiB matched byte-for-byte **before restarting
the factory application**: bootloader, partition table, NVS and OTA metadata were
preserved during the experiment. SPIFFS was outside both write ranges; a separate
post-test SPIFFS readback was not performed. AT32 flash/servo NVM were not written
or backed up by this procedure.

The original application was restarted after verification. An initial status
check mistakenly used the observer's 115200-baud USB speed; it produced no valid
version/pose frames. The check was corrected to the existing classroom/factory
setting of 1,000,000 baud, without another flash write. One read-only version
request then returned 1.0.2 for both processors, alongside 25 passive pose frames.
Last joint readings were 2045, 1994, 2039, 2054, 2052, 2045. These are status
readings, not a motion/holding/load-protection acceptance test.

## Consequence for the next investigation

Do not repeat identical USB/browser probes or deploy a filter-only firmware patch.
The remaining independent investigation is the AT32-facing forwarding/response
path and whether an evidenced system-level telemetry route exists. No speculative
opcode sweep, settings change or AT32 reflash is authorized by this result.
Changing AT32 firmware would require its own source, backup/recovery assessment
and concrete proposal; the ESP32 backup does not provide that recovery.

No live current/load/fault channel has been established. Reliable whole-arm
pinch detection remains unverified, so this result does not justify removing
preventive limits or using hands as an obstruction test. The observer is no
longer installed; ordinary programming development can continue on the restored
factory firmware while that separate hardware question is assessed.
