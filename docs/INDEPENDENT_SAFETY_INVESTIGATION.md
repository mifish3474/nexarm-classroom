# Independent safety investigation — 2026-10-27

The operator does not want progress to depend on a Hiwonder response and has
only the robot and USB cable. The manufacturer-question draft is optional
background, not a prerequisite. The initial phase used public source/binary
inspection and existing read-only USB requests. A subsequent, explicitly approved
ESP32 reset/backup is recorded below. A later, separately approved temporary
observer experiment has also completed; the original application was restored.
See SERVO_OBSERVER_RESULTS.md for the current hardware outcome. No servo
configuration write, motion command or obstruction test was sent by these tests.

## Evidence found independently

The manufacturer's [peripheral-control tutorial](https://wiki.hiwonder.com/projects/NexArm/en/esp32-version/docs/7_Peripheral_Control_Basics.html#synchronizer-joystick-control)
links a [NexArm source ZIP](https://drive.google.com/file/d/1NReSGsuVLXd1YJZu_cQvJqmAnhAl1PUM/view).
Its `Nex_Arm/system_task_handle.cpp` forwards IDs1–6 toward the servo/controller
UART in `func_ctrl_callback`, but `at32_packet_callback` immediately rejects
response IDs other than 0x5A. It then handles a list of system reply functions,
including pose and factory configuration reads. This shows why command
forwarding alone does not establish individual-servo return forwarding.

That is a **source-example observation**, not a proven disassembly of the
installed USB factory firmware. The example is an ESP-NOW project, and is not
drop-in replacement firmware for the classroom app. Its filtering is a plausible
architectural clue consistent with the actual captures: system reads work,
direct servo reads do not. It does not establish at which processor a reply is
lost, whether the downstream servo replied, or whether direct reads are forwarded.

The [ESP-NOW source ZIP](https://drive.google.com/file/d/1ooFQoe0ZmAyNaYbEg-fcUqtHCt-yyNCD/view)
contains the same-sized relevant source files. The NexArm-specific
`HX_30HM_Def.h` differs materially from the generic SDK previously reviewed:

| Field | NexArm example definition | Generic SDK definition |
| --- | --- | --- |
| Torque enable | 0x28 | SDK method rewrites maximum torque |
| Maximum torque | 0x30–0x31 | 0x13–0x14 |
| Firmware bytes | 0x03–0x04 | 0x00–0x01 |
| Acceleration | 0x29 | Conflicting run-time description |
| Present position | 0x38–0x39 | 0x38–0x39 |
| Present current | 0x45–0x46 | 0x45–0x46 |

Therefore the position probe address agrees across these sources; its lack of
reply cannot be explained merely by their identity/protection-map differences.
The existing classroom motion encoder uses the NexArm-specific acceleration /
position / speed layout. No map or settings are changed based on this comparison.

A [prior manufacturer-forum thread](https://forum.hiwonder.com.cn/t/nexarm/1019)
asks about live torque/load during a grasp. Its September 8 reply says standard
materials do not provide continuous quantitative force/load viewing and warns
that maximum-torque/overload settings are not current load. The thread is tagged
agent-answered; it is corroboration of the interface limitation, not verified
firmware behavior, a protection specification or a substitute for measurement.

The public [factory firmware binary](https://drive.google.com/file/d/1Ji_j_xfjafvRJX9Lrm1pGAr3NRaYC6V3/view)
was also downloaded for static inspection only. It is a 1,785,536-byte combined
ESP32 image with Nex_Arm/action-edit strings and an ESP-IDF application
descriptor. Its Arduino library-builder metadata is not an application-version
proof, and it has not been established as byte-identical to the installed image.
String inspection is not proof of a particular dispatch path or safety function.

## USB-only next step: observe bytes before parsing

Dev.46 adds bounded raw RX capture to the isolated diagnostic page. Dev.45
exports only parsed frames plus selected rejected frames; different framing,
an unexpected checksum or text response could be absent from that export.
We must distinguish no returned bytes from returned-but-unrecognized data before
concluding the USB bridge cannot supply a response.

The requests are unchanged. Capture begins only on explicit Read diagnostics,
ends with the scan/Stop, and never sends an extra packet. Parser buffering is
reset at scan start to align observation epochs. Exports include timestamped
raw hex chunks and the pending-read context, bounded to 64 KiB / 1,024 chunks,
with omitted-byte/truncation counters. Context labels are not transaction IDs.
Raw bytes cannot authorize motion, become decoded readings or clear a fault.

The capture is local and ephemeral. Because raw serial data may include device
debug text, the diagnostic page explicitly asks the operator to review the file
before sharing. No USB identifiers are requested, no account/storage/upload is
added, and no application commands are sent on Connect. Firmware flashing,
mode changes and bootloader/reset operations are outside this diagnostic.

Decision after the capture:

- If unexpected bytes arrive around a direct read, analyze framing/checksums and
  reply routing offline before changing the decoder. Do not loosen validation
  merely to produce a reading.
- If the capture is complete and contains only known system/pose traffic, stop
  retrying identical register reads. Continued USB-only access may require a
  reviewed firmware bridge change; the example alone is not sufficient to deploy
  one safely. That would need a concrete backup/recovery plan and operator approval.
- Actual contact/force protection still requires force/stop validation. A future
  position-progress supervisor could detect some gross motion failures, but the
  previously observed normal offsets and deadband show why it must not be called
  finger-pinch detection or replace preventive limits.

## Dev.46 operator capture: no hidden direct-read replies

The October 27 export `nexarm-read-only-servo-diagnostics (2).json`
(captured at 12:43:31.991 UTC) completed with 13 data results, six direct
position-read timeouts and 30 dependent checks skipped. Both processors report
1.0.2. Factory configuration results match the preceding capture, including
J2 maximum torque reported as zero; its meaning remains unresolved.

Independent inspection of the concatenated raw chunks accounts for every byte:

- 1,961 bytes in 93 chunks; no omitted bytes or truncation.
- 57 full-checksum packets: one version reply, 44 position broadcasts, six
  overload-setting replies and six maximum-torque replies (1,446 bytes total).
- The remaining 515 bytes are readable ASCII controller debug messages.
- No packets from servo IDs 1–6 and no additional binary data were present.

For each of the six direct position reads, the controller printed
`[CB] id=0x01 cmd=2 len=4` (with the corresponding servo ID). This establishes
receipt at its command callback, not downstream forwarding or servo receipt.
No individual-servo data or error reply followed on USB in the recorded scan.
The browser is therefore not overlooking a differently framed reply in this
capture. It does not identify which processor, routing policy or downstream
interface prevents a reply from reaching USB.

Do not request another identical scan or relax the decoder. The next independent
investigation is static tracing of the controller request/response route and
whether a recoverable diagnostic firmware change is feasible. The available
tutorial source and factory image do not yet establish a deployable replacement
or backup/recovery procedure. No flashing, reset, motion or setting change is
authorized by this capture. Live load/current/fault access and contact-stop
protection remain unverified; configured overload values alone do not establish
pinch protection.

## Public factory binary: request forwarding and reply filtering traced

This extends the earlier string inspection. Espressif's official Xtensa objdump
from `esp-2021r2-patch5` was run on an offline ELF container of the public image's
instruction segment. No firmware was executed. Function names below describe
observed behavior; the binary has no recovered source symbols. The public image
is still not established as identical to the installed 1.0.2 firmware.

| Public-image address | Static observation |
| --- | --- |
| `0x400e39a0` | Request callback entry; references the captured request-debug format through literal `0x400d0f70` at `0x400e39c4`. |
| `0x400e6532`–`0x400e6559` | Non-system IDs 1–6 and broadcast 0xFE are admitted. The incoming command, arguments and argument length are passed to the frame writer at `0x400dd34c`. |
| `0x400dd34c` | Builds an FF FF packet, copies ID/command/data, adds checksum and calls the UART object's write method. |
| `0x400e03c8` | Receive callback entry; has special handling for system stream packets. |
| `0x400e05c5`–`0x400e05ca` | The remaining path accepts ID0x5A; other IDs go to the function exit path. Thus individual-servo ID1–6 replies cannot reach its subsequent forwarding path. |
| `0x400e0609`–`0x400e0633` | Accepted system replies have a bounded payload copied and are repackaged under ID0xFF. |

This identifies a concrete return filter in the **public factory binary**, not
just the ESP-NOW tutorial. It explains why outbound forwarding and successful
system reads do not imply direct-servo read access. It is consistent with the
operator capture, but does not prove a servo replied behind the filter, or that
removing this filter alone would enable load/current reads. The downstream AT32
path remains a separate uncertainty.

The separate [manufacturer status-reading project](https://drive.google.com/drive/folders/1ZZ--7yRzej8gPN1BdvJNG2i1nlRnn3jo)
contains a direct status reader and AT32 fallback definitions. Its fallback only
provides pose/joint values; it does not supply a fallback current/load reading.
The [published startup analysis](https://wiki.hiwonder.com/projects/NexArm/en/esp32-version/docs/2_ESP32_Development_Basics.html#bus-servo-status-reading)
also shows torque enabled during initialization. This project is therefore not
an approved drop-in passive diagnostic and must not simply be uploaded.

## Recovery investigation and prepared backup step

The manufacturer's [recovery PDF](https://drive.google.com/file/d/1T8Px8OQmXwQprBbTGjybT7_NLO_Qv7BV/view)
describes a Windows ESP32 download-tool workflow, including a whole-chip erase.
This is a factory-program restoration guide, not a preservation procedure for
this operator's settings or programs. Its availability does not verify recovery
on this particular arm, nor restoration of the separate AT32 or servo memories.

Static validation of the downloaded public image found:

- Partition-table MD5 and bootloader/application XOR checksums and appended
  SHA256 digests all match. This is internal consistency, not compatibility.
- The image is 1,785,536 bytes; its partition table describes storage through
  0x400000 (4 MiB), including SPIFFS at 0x310000, absent from the download.
- The included NVS region 0x9000–0xDFFF is all 0xFF. It cannot preserve this
  robot's existing ESP32 preferences. A public factory image is not its backup.

Prepared [backup script](../scripts/backup-nexarm-controller.ps1): default is a
plan with no port opened and no files created. Only explicit `-Execute` performs
two full ESP32 `read-flash` operations and compares sizes/SHA256. It pins the
reviewed Espressif v5.6.0 executable hash, saves local ignored copies/logs, stops
on failure without retry, and requests no flash/fuse write or erase. Esptool's
normal RAM helper is allowed by this proposed backup, not firmware installation.

**Not executed on hardware.** Each read requests bootloader entry/reset, which
may interrupt holding. `--after no-reset` deliberately avoids a normal-program
restart afterward; it does not establish how the AT32 or servos behave. Before
execution the operator must approve this specific reset/read step, support the
arm independently, close other robot connections and identify its COM port.
No physical stop or re-enable behavior should be inferred from bootloader entry.

After two matching reads, inspect the installed image offline, compare the
actual filter and version strings with the public image, and inventory backup
coverage before proposing any firmware write. A matching ESP32 backup is not a
tested restore procedure and does not cover AT32/servo NVM. Keep full dumps/logs
local because they may contain credentials, saved programs and device identifiers.

A future diagnostic firmware proposal, if still justified, must have an audited
startup with no torque/motion/configuration writes, bounded timestamped UART
observation before filtering, one outstanding whitelisted read, no response
invention, and explicit capability reporting. It must first establish whether
individual-servo replies reach the ESP32 at all. Do not binary-patch the reply
filter or flash the tutorial merely because it looks like a small change.

Validation this phase: public-image checksums/digests above; offline disassembly;
backup script plan exercised with a placeholder COM port, without `-Execute`;
downloaded utility help inspected without a port. No app/runtime change, version
bump, robot command, reset or firmware write occurred. Existing application tests
were not rerun for documentation and an unused offline backup helper.

## Approved installed-controller backup and exact-image findings

The operator explicitly approved reset/backup, identified COM17, then confirmed
the connection was freed after the first attempt could not open the port.
The successful run finished at 2026-10-27 13:28:19 UTC. Both full 4 MiB reads
match byte-for-byte, with SHA256:

`aaf99bb6449223fb9e7909df43b39e3b6ce3ef32c597b39bd6fb3f6f26ff0736`

Files and the manifest remain local in ignored
`.analysis/controller-backup-20261027T131538Z-cc46b6123c90438db44ed1a47e1153ee/`.
No erase or flash write was requested. The standard tool's temporary RAM helper
ran to read flash; `--after no-reset` left the ESP32 in bootloader mode after the
second copy. Normal application operation has not been resumed by this work.
This is an ESP32 backup, not an AT32/servo-memory backup or a demonstrated restore.

Offline verification found valid partition-table MD5 and valid image checksums
and SHA256 digests. Bootloader bytes match the public image. Application bytes
do **not** match: the installed application occupies 0x10000–0x1B4A2F, with image
SHA256 `23a4231b5808799ac3c4088a287405a494dbf09f679a9d56cfc6434389862909`.
Do not apply public-image patch offsets to this robot.

The installed backup contains non-erased NVS, OTA metadata and SPIFFS. This
confirms why the generic factory download must not be substituted for preserving
the device's actual flash. Private strings and saved contents were not printed
or uploaded; only program structure/hashes were inspected.

Installed-image disassembly establishes the same relevant behavior at different
addresses:

| Installed-image address | Static observation |
| --- | --- |
| `0x400e401c` | Request callback references the exact captured request-debug format through literal `0x400d0fdc`. |
| `0x400e6bca`–`0x400e6bf1` | Admits IDs1–6 and 0xFE, passing the incoming command/data to UART packet writer `0x400dd40c`. |
| `0x400e0878` | Receive callback entry; handles certain system streams separately. |
| `0x400e0a75`–`0x400e0a7a` | Compares remaining response ID with 0x5A; other IDs jump to exit path `0x400e094e`. Individual-servo responses under IDs1–6 are discarded here. |
| `0x400e0ab9`–`0x400e0ae3` | Accepted system payloads are bounded and repackaged under ID0xFF. |

Thus the response filter is now verified in this robot's backed-up ESP32
application, rather than inferred from a similar public image. Whether the AT32
forwards a read and whether a servo replies on the ESP32-facing UART are still
unverified. This does not prove hardware contact detection exists or works.

The next firmware proposal should be an observation-only diagnostic at the UART
receive boundary, before this filter, preserving the installed behavior and
device-specific storage. It must first report whether a direct read produces
any downstream data. It must not enable torque on startup, loosen movement
limits, issue more goals, or infer zero load from silence. No such image has
been built or approved for flashing. A validated recovery procedure remains
necessary before any firmware-write experiment.

Host verification: two matching complete reads; checksums/digests above;
disassembly prepared from the installed segment table, not public offsets.
The backup script's native-stderr handling was corrected after the first failed
open so future failures preserve the complete tool output. No classroom app
change or version bump was made.

## Prepared observation experiment

[SERVO_OBSERVER_REVIEW.md](SERVO_OBSERVER_REVIEW.md) records the compiled, guarded
observer source, pinned review artifact and application-only restore plan.
Nothing was installed. The source sends no downstream packet on startup and
only one fixed position-read packet per explicit POS command. Standard Arduino
NVS startup is bypassed; nine flash-write/erase APIs are wrapped with refusing
stubs and checked in the final ELF. The install and restoration procedures still
require hardware approval and testing. Capturing live UART traffic does not
itself establish usable force feedback or pinch protection.

## Source fingerprints

Update: the approved observation experiment has now completed. Both captures
contain only AT32 system broadcasts; no direct-servo reply was present before
filtering. The original application was restored/verified and normal version
and position reporting resumed. See [results](SERVO_OBSERVER_RESULTS.md) for the
full evidence and its limits. Earlier no-install/no-reset statements describe
the preparation phases, not this separately approved hardware experiment.

- Synchronizer source ZIP SHA256:
  `1F8EEA2157BE23775D4E1B840E8A64E95F6328C1D1BB8C44362F637052F6821A`
- ESP-NOW source ZIP SHA256:
  `806F2CEAFFAB24345F586FCC43FAB12119B72F804295696056185AE7B610802A`
- Inspected system_task_handle.cpp SHA256:
  `8484E088D5138BC881F14AB82E5FF3FB8F09D997C8F82543999BE342CBB061E8`
- NexArm-specific HX_30HM_Def.h SHA256:
  `390DACC2ACF6299B70E895887D45BF3A4A05EE3F7F77F35B92CE8643D0AE6AD5`
- Factory firmware image SHA256:
  `b05c98dfa4d170373b74caf20ce9b506271ddf54e5f960c6013e446d3be5edcd`
- Downloaded status-reader HX_30HM.cpp SHA256:
  `785B8F527E94C9642BF272377967C42CCEAD02FC632D7DD0F1137170191D31A5`
- Recovery PDF SHA256:
  `7245345B450F6D80DB5069BE15AB6F560726507EAEDE1F47729EB843A910D3C6`
- Official esptool v5.6.0 Windows archive SHA256 (matches GitHub release digest):
  `D55A96FBEB97FD4CB05BD93F201E5C8F6518B7BFCDE2FC6966FD0190FD891629`
- Extracted esptool executable SHA256:
  `7A4FC0B651197D8034DAB52DB1468EBF5C009D8E754306E59C7DE0AA47767914`

Downloaded material and static inspection helpers remain in ignored `.analysis`.
Only official host analysis tools and their help were executed. No downloaded
robot firmware or example program was executed, compiled or flashed.
