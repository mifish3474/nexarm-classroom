# Temporary servo observer: review before installation

**Closed workstream: factory firmware only.** The operator subsequently excluded
custom ESP32/AT32 firmware. This document is a historical experiment record, not
an active installation proposal or authorization for another experiment.

Prepared October 27, 2026. **Historical pre-install review.** One explicitly
approved experiment has since completed and the original application has been
restored; see [results](SERVO_OBSERVER_RESULTS.md). The preparation/test limitations
below record what was known before installation. This is not a classroom release.

## What this experiment answers

The installed ESP32 firmware discards replies carrying individual servo IDs.
We want to find out whether any replies arrive before that filter. The observer
temporarily replaces the ESP32 application with a small program that records
the incoming UART bytes without parsing or filtering them.

It sends no servo packets on startup. An explicit position-read command permits
one fixed read request. It contains no goal-position, torque, ID, mode, settings,
action-group or reset command encoder. It cannot control the arm for lessons.

Replacing/restarting the ESP32 pauses the factory application. **This does not
guarantee holding or immobility:** the AT32 and servos are separate devices.
The arm must be independently supported and clear of people throughout the
experiment and restoration. No obstruction or pinch test is part of this plan.

## Proposed first hardware experiment

One operator approval should cover this complete temporary experiment:

1. Confirm the arm is supported, other robot apps are disconnected, and COM17
   still identifies this robot. Recheck application/partition identity and device
   security state in bootloader mode. Stop if the tool rejects the operation;
   no force, security bypass or fuse operation is proposed.
2. Install only the frozen observer application at 0x10000. Verify it before
   starting it. Do not upload with Arduino IDE/CLI: those workflows can also
   write a bootloader and partition table. Never use a whole-chip erase.
3. Restart into the observer while the arm remains supported. Obtain a passive
   two-second capture. This sends **no** downstream servo request.
4. If it identifies itself correctly and the arm remains stationary, obtain one
   J1 position-read capture. The only downstream request is
   `FF FF 01 04 02 38 02 BE`. This requests two position bytes; it does not request
   movement. Stop if behavior changes unexpectedly. No automatic retries or
   follow-on joint/status scans are part of this first experiment.
5. Restore the original full application slot from the verified backup, verify
   it, and restart the original application with the arm still supported. Confirm
   the normal version/read-only position response before resuming ordinary use.

The restore procedure is prepared and file-checked, **not demonstrated on this
hardware**. Bootloader entry and full-flash reads have been demonstrated. If
write/verification/communication fails, preserve the logs and stop in bootloader
mode; do not improvise an erase, generic factory reflash or automatic restart.

## Frozen local files for this review

Use only `.analysis/servo-observer-review-OlSEgy/`. Earlier review folders were
build drafts and are not installation candidates. Files remain ignored/local.

| File | Size / identity |
| --- | --- |
| `observer-app.bin` | 243,504 bytes; SHA256 `56ed0d3ac944acb51dedb434c17c3426a5250701c693d72e2d9bc4aba6d33971` |
| `original-app-slot.bin` | 3,145,728 bytes; SHA256 `cceb0077fbe4e4dbae391828be099ee741ec463f95b15cb178e70d7c417f6a12` |
| `build-audit.json` | Compiler/core versions, source hashes and startup/write-guard audit |
| `review.json` | Application-only install/restore arguments; approval and hardware-test flags remain false |
| Source snapshots | `servo-observer.ino`, `FlashWriteGuards.cpp` |

The source backup is the two matching 4 MiB copies with SHA256
`aaf99bb6449223fb9e7909df43b39e3b6ce3ef32c597b39bd6fb3f6f26ff0736`.
The restore file includes the entire original application partition, including
unused bytes, rather than substituting the different public factory application.

The observer write automatically erases affected sectors, as every flash write
does. Its sector range is 0x10000–0x4BFFF (245,760 bytes); this stays inside the
application slot 0x10000–0x30FFFF. Restore writes exactly that full 3 MiB slot.
Neither proposed write includes the existing bootloader, partition table, NVS,
OTA metadata, SPIFFS or coredump partition. This is an ESP32-only plan; the backup
does not cover AT32 flash or settings inside the servos.

Before either restart, use the reviewed local files and `verify-flash`/readback
against the expected file; a successful application write is not permission to
skip verification. Reconfirm that current OTA metadata is not in NEW or
PENDING_VERIFY state. The backed-up metadata reports sequence 1 / undefined
state, not either pending state; the existing bootloader is retained. The
observer does not invoke OTA validity/rollback APIs or alter metadata itself.

## How the observer behaves

The source is in [firmware/servo-observer](../firmware/servo-observer/servo-observer.ino).
USB serial uses 115200 baud. The internal UART uses 1,000,000 baud, RX GPIO17,
TX GPIO16. The installed binary's initialization at 0x400e2332/0x400e2335 passes
17/16 to its bus initializer; the initializer at 0x400dd3c8 places RX/TX in the
same HardwareSerial argument order. This agrees with the manufacturer source.

Only these exact, newline-terminated ASCII commands are accepted:

| Command | Effect |
| --- | --- |
| `INFO` | Reports `NEXARM_OBSERVER_1_GUARDED`; no downstream packet |
| `CAPTURE` | Records raw incoming bytes for approximately two seconds; no downstream packet |
| `POS 1` through `POS 6` | Records a 500 ms baseline, sends one fixed two-byte position read, then continues recording until the two-second window ends |
| `STOP` | Cancels this recording/request if not sent; **not** a servo-stop or torque command |

Unknown/binary input is not forwarded. There is one active capture, no automatic
retry, and no motion resumes on reconnect. Explicit read-only repeats do not
require a controller reset. A delayed loop cannot send a request after the
recording deadline. A short UART write is reported and never retried.

Capture storage is limited to 16 KiB / 512 chunks. Output is JSON lines containing
relative time, raw hex and final omission/UART-error counters. UART error callbacks
are observations, not a guarantee that every possible electrical loss is detected.
The output is not a load/current reading, a fault clearance or a safety decision.
Request timing is context, not a transaction identifier.

[capture-servo-observer.ps1](../scripts/capture-servo-observer.ps1) is prepared
for use only after the approved candidate has been installed and verified. Its
default is passive capture; `-Joint 1` explicitly requests the one J1 read.
It uses the guarded observer identity, has an eight-second deadline/input bounds,
does not scan ports, and requests no deliberate reset. Opening a serial port
can still affect control lines; support remains necessary. Captures stay under
ignored `.analysis/` and may contain controller debug text. Review before sharing.
The existing browser diagnostic page uses a different protocol and is not used
with this temporary program.

## Startup and persistent-write audit

The standard Arduino 2.0.12 `initArduino()` calls NVS initialization and can erase
NVS on an incompatibility. The observer supplies its own `app_main` and runs only
its UART task after ESP-IDF startup. The final ELF does not contain `initArduino`
or `nvs_flash_init`.

The pinned SDK also includes flash crash dumps. Nine partition/flash write and
erase APIs are wrapped with refusing IRAM stubs in `FlashWriteGuards.cpp`; the
build verifies all nine wrappers and rejects remaining original symbols for
those APIs. Thus a normal SDK crash-dump request through these APIs is denied.
This is a targeted source/link audit, not a proof of all possible firmware or
hardware effects. It does not change or guard the separate bootloader/AT32.

There is no filesystem, preferences, radio, network, OTA, board initialization,
home command or torque enable in the observer task. The only Serial1 write site
builds the fixed READ packet. The program makes no claim about maintaining servo
hold while the normal controller application is absent.

## Build and verification performed

- Arduino CLI 1.5.1 and Espressif core 2.0.12, matching the factory core generation.
  Download hashes were verified; tools/core files remain isolated in `.analysis`.
- [build-servo-observer.ps1](../scripts/build-servo-observer.ps1) compiles only;
  it has no port/upload option. It adds the write guards and audits ELF symbols.
  The local tool configuration is `.analysis/arduino-cli.json`; compiler files
  are physically under `.analysis/tc/` to avoid Windows path-length failures.
- Final compile: 243,141 program bytes and 41,736 global RAM bytes; no sketch
  warnings reported. This is compilation, not a timing or hardware test.
- Espressif `image-info` independently checked the frozen final image's
  checksum/digest; both pass.
  DIO / 80 MHz / 4 MiB matches the installed application's image header.
- [prepare-servo-observer-review.mjs](../scripts/prepare-servo-observer-review.mjs)
  verifies both backups, the pinned station identity, partition digest/bounds,
  image checksums/digests, chip revision, flash configuration and build/source
  audit before creating local artifacts. It cannot execute a flasher or open a
  port. `node --test scripts/tests/nexarm-firmware.test.mjs`: six tests pass,
  including corrupt/truncated images, stale sources/builds, mismatched copies,
  missing guards, overlapping partitions and app-slot boundaries.

The host capture helper's syntax is checked; its actual UART interaction and
the observer's runtime timing/overflow behavior remain untested. The classroom
application is unchanged at dev.46. No flash write, reset, servo request or
hardware connection occurred during this preparation.

## How results affect the next decision

If a matching, checksum-valid individual-servo position reply is captured, we
have evidence of a usable return route. A later bounded status-read diagnostic
can then investigate current/load and fault bytes without changing settings.

If the position request produces only system replies or no incoming data, the
barrier remains downstream, in forwarding/wiring/response policy rather than
the browser. Truncation, UART errors or a failed transmit make the result
inconclusive. A two-second silence does not prove that the servo has no sensors
or protection. No result from this experiment establishes pinch-stop protection
or authorizes removing preventive limits.

Primary references: [Espressif image format](https://docs.espressif.com/projects/esptool/en/latest/esp32/advanced-topics/firmware-image-format.html),
[flash operations](https://docs.espressif.com/projects/esptool/en/latest/esp32/esptool/basic-commands.html),
[reset behavior](https://docs.espressif.com/projects/esptool/en/latest/esp32/esptool/advanced-options.html),
[pinned Arduino startup](https://github.com/espressif/arduino-esp32/blob/2.0.12/cores/esp32/esp32-hal-misc.c),
[ESP-IDF boot selection](https://github.com/espressif/esp-idf/blob/v4.4.5/components/bootloader_support/src/bootloader_utility.c).
