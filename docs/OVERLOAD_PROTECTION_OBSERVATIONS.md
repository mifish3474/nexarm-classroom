# Factory overload settings and Max Torque replies

New manufacturer-documentation research on 2026-10-27 is in
[SAFETY_RESEARCH.md](./SAFETY_RESEARCH.md). It establishes the documented
post-overload torque-cap distinction and identifies candidate load/current/fault
reads, with model/firmware and USB-forwarding caveats. The observations below
remain the historical evidence; no settings or physical protection behavior have
been changed or experimentally verified.

Observed 2026-10-26. Read-only investigation; no robot command was sent by the
assistant and no application behavior or persistent device setting was changed.

## Operator screenshots after factory Read

The operator supplied screenshots for each joint after using the factory app's
Read controls. Each section has its own servo selector.

| Joint | Overload torque limit | Trigger time, displayed | Torque threshold | Max torque |
| --- | ---: | ---: | ---: | ---: |
| J1 | 20 | 200 | 80 | 1000 |
| J2 | 20 | 200 | 80 | 0 |
| J3 | 20 | 200 | 80 | 1000 |
| J4 | 20 | 200 | 80 | 1000 |
| J5 | 20 | 200 | 40 | 1000 |
| J6 | 20 | 50 | 20 | 1000 |

The factory labels trigger time as multiples of 10 ms: displayed 200 corresponds
to 2 seconds, and 50 to 0.5 seconds. These are interpretations of the UI labels,
not verified measurements of a protection event. The meanings/units of the
torque fields and the firmware's behavior when protection triggers are unverified.
J2's zero was reproduced in another screenshot after Read.

## Raw Max Torque capture

The supplied `log.txt` has SHA-256
`1F199D7982DD9E2FEAE574B69A1FE2EB283C26C8A32339A962D96147436C4DC0`.
It contains three Max Torque requests and matching replies, interleaved with
normal position telemetry. All six packets have valid declared lengths and full
complement checksums. No setting-write or movement TX packet appears in this log.

| Joint | Request/reply lines | Controller reply | Decoded value |
| --- | --- | --- | ---: |
| J1 | 52/53 | `FF FF FF 05 4B 01 E8 03 C4` | 1000 |
| J2 | 74/75 | `FF FF FF 05 4B 02 00 00 AE` | 0 |
| J3 | 98/99 | `FF FF FF 05 4B 03 E8 03 C2` | 1000 |

Factory constants bind Max Torque Read to command 75 (`0x4B`). The extracted
`CommManager.handle_packet` treats payload byte 0 as the servo ID and bytes 1/2
as an unsigned little-endian 16-bit number. `update_max_torque` displays the
result when its servo ID matches the section's selected ID. Thus `E8 03` is 1000
and `00 00` is zero. The factory display agrees with the captured bytes.

This rules out a missing response or stale UI as the explanation for this
capture's J2 zero. It establishes that the system controller returned zero for
J2; it does not independently establish the underlying servo register value.
Without firmware behavior or a verified register definition, zero could have a
special meaning or reflect an internal read failure/fallback. Those are open
possibilities, not diagnosed causes. Do not infer zero force, unlimited torque,
or disabled protection, and do not replace it with 1000 to match other joints.

## Protection still to establish

The factory advanced tab can read/write overload settings, and its corresponding
reply handler updates those configuration fields. This is not a verified live
overload alarm. Static inspection of the factory online action runner found
timed progression without a blocked-joint feedback gate. Device-side protection,
its enabled state, whether it reduces force/releases holding, and whether other
joints or the sequence continue remain unverified.

Dev.36 does not implement blocked-joint detection during timed poses. Establish
the hardware/firmware definitions and fault reporting before changing protection
settings or relying on them for student use. Do not use a hand-restrained powered
joint as the verification method. See ROADMAP.md for student-release requirements.
