# Independent safety investigation — 2026-10-27

The operator does not want progress to depend on a Hiwonder response and has
only the robot and USB cable. The manufacturer-question draft is optional
background, not a prerequisite. This phase uses public source/binary inspection
and existing read-only USB requests. No firmware was compiled, flashed or run;
no robot reset, configuration write, motion command or obstruction test was sent.

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

## Source fingerprints

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

Downloaded material and static inspection helpers remain in ignored `.analysis`.
No downloaded program or firmware was executed.
