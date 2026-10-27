# NexArm protection research — 2026-10-27

Implementation follow-up: dev.45 provides the isolated read-only scan described
in [READ_ONLY_SERVO_DIAGNOSTICS.md](./READ_ONLY_SERVO_DIAGNOSTICS.md). It does not
change protection settings or establish their effectiveness. The research scope
below describes the earlier investigation. The initial dev.44 hardware export
received valid controller firmware and passive pose data, but no direct servo
register data. Dev.45 handles the six-byte firmware response and prioritizes the
factory read API; live current/load/fault access still needs verification.

## Operator hardware result: dev.45, 2026-10-27

The second export, captured at 2026-10-27T12:08:29.989Z, contains 13 fully checked
data results: controller version, six factory overload reads and six factory
maximum-torque reads. All six direct two-byte position probes timed out. The
remaining 30 broad direct reads were skipped as designed; 19 requests were
actually sent. No additional unexpected reply envelopes were captured. Passive
positions continued. This establishes working controller-level configuration
reads but no working direct-servo read path through the interface tested.
It does not prove the servos lack their own local protection or telemetry.

| Joints | Returned overload cap byte | Returned delay byte | Returned threshold byte | Returned maximum torque |
| --- | ---: | ---: | ---: | --- |
| J1, J3, J4 | 20 | 200 | 80 | 1000 |
| J2 | 20 | 200 | 80 | 0 |
| J5 | 20 | 200 | 40 | 1000 |
| J6 | 20 | 50 | 20 | 1000 |

The values reproduce the earlier factory Read screenshots and the J2 zero.
ESP32 and AT32 versions are both 1.0.2 under the factory viewer's six-byte
version decoder. Servo model/firmware identities and protection-enable bits
remain unavailable. No setting was changed; J2's zero meaning remains unresolved.

The factory configuration reads returned in approximately 3–4 ms in this scan.
That is application-observed request/reply time for settings, NOT a measured
overload-detection delay, physical stopping time or personnel-protection guarantee.
Factory read values are not live overload events. Delay-field interpretations
remain those documented earlier (10 ms units), not measured protection behavior.

There is no benefit in repeating this same scan unchanged. The next useful
evidence is manufacturer clarification of model/firmware-matched telemetry,
USB forwarding, enable bits, zero-value semantics and whole-arm fault response.
The existing browser can log/cancel future commands, but these results do not
provide the missing live fault signal or establish that holding/releasing after
a pinch is safe. Keep movement limits and a hands-off work area during development.
No application-code changes were made while interpreting this export.

Scope: read-only manufacturer documentation and static source/software review.
No application code, robot settings, firmware, connection or physical movement
was changed. No messages were sent to the manufacturer or anyone else.

The practical finding is promising telemetry, not established pinch protection.
There is a route worth investigating before further coordinate-programming work.
It does not justify removing movement limits or treating a browser stop as a
verified personnel-protection function.

## What overload protection does

Hiwonder's current [BusLinker manual](https://docs.hiwonder.com/projects/BusLinker/en/latest/docs/1_BusLinker_V3.0_Servo_Debugging_Board_User_Manual.html),
section 1.3.2.2, distinguishes three overload parameters: a load threshold, a
duration above that threshold (10 ms units), and a maximum output torque after
protection triggers. The latter is a percentage, not a whole-arm stop command.
Protection/alarm conditions are configurable. Overcurrent has a separate
threshold and delay. This establishes a documented mechanism; it does not
establish this arm's actual configuration, contact force or measured response.

The prior factory Read screenshots showed post-overload torque limit 20,
delay 200 for J1–J5 and 50 for J6. If the documented mapping applies, these
correspond to a 20% post-trigger torque cap and delays of 2 seconds / 0.5 seconds.
Do not equate 20 with a 20% contact-detection threshold, or assume reduced torque
means zero pressure. The torque-threshold scaling must be verified: the manual
and SDK register table do not agree on all units. Lower settings could also
affect gravity support. No new settings are recommended by this research.

The [older HX-65HM manual](https://wiki.hiwonder.com/projects/HX-65HM/en/latest/docs/1.%20HX-65HM_Bus_Servo_User_Manual.html)
has the same overload distinction in indexed excerpts, but its live page returned
404 during this review. Use the accessible BusLinker source above and verify
model/firmware applicability rather than treating an archived manual as sufficient.

## Available data and the controller boundary

The manufacturer's [NexArm status-reading tutorial](https://wiki.hiwonder.com/projects/NexArm/en/esp32-version/docs/2_ESP32_Development_Basics.html#bus-servo-status-reading)
describes direct servo reads for position, speed, load, voltage, temperature,
current, offset and mode. Its example explicitly falls back to AT32 pose/joint
readback if direct servo discovery fails. Therefore richer servo data must not
be assumed available merely because ordinary pose feedback works.

The [NexArm serial protocol](https://wiki.hiwonder.com/projects/NexArm/en/esp32-version/docs/3_Motion_Control.html#data-frame-format)
documents ID 255 system commands and IDs 1–6 transparent servo forwarding.
Static inspection of the supplied factory `_read_all_fallback` sends individual
servo READ commands for present position over that connection. This is evidence
for a candidate read-only route, not proof that arbitrary registers, every servo
type or adequate polling rates work through the installed firmware.

Our present passive command-11 packet contains coordinates and joint positions,
not verified current/load/protection status. Existing factory overload reads are
configuration values, not proof of a live fault event.

The official [HX-30HM register table](https://github.com/Hiwonder-official/hiwonder-servo-sdk/blob/5b0807f6e8fc0469e7bde6115be78c57779dfcb6/docs/register_table_en.md)
lists present load, current, motion state and fault status. It describes status
conditions for voltage, temperature, current and overload, plus configurable
protection-enable/alarm bits. Register availability, interpretation and units
need matching to the actual installed servo model and firmware. In particular,
motor load/current is not a measurement of pressure at a fingertip.

## Documentation inconsistencies matter

Reviewed official SDK commit:
`5b0807f6e8fc0469e7bde6115be78c57779dfcb6` (2026-07-01).
Its register table identifies HX-30HM firmware 2.43 / register-table V3.7;
the BusLinker tutorial demonstrates a different firmware file, V3.9. The arm's
installed versions have not been established.

The SDK table marks voltage at 0x3E as two bytes while temperature is at 0x3F;
the NexArm example prints voltage as one byte. It also gives a two-byte maximum
torque field at 0x13 while placing protection control at 0x14. These overlapping
definitions and the threshold-unit difference are reasons to obtain a verified,
version-matched map before sending configuration writes. They are not evidence
that this arm's settings are corrupt.

NexArm documentation identifies HX-30HM and HX-65HM in the product family.
The observed HX-30HM labels do not establish the model of every installed joint.
Do not apply one model's map to all six without checking.

## What stopping means

The official SDK's [Python implementation](https://github.com/Hiwonder-official/hiwonder-servo-sdk/blob/5b0807f6e8fc0469e7bde6115be78c57779dfcb6/python/hiwonder/servo.py)
implements `stop()` by reading the current position and issuing it as a new
position target. It is not a separate safety-rated shutdown operation. Its
`torque_enable()` writes a persistent maximum-torque setting; it must not be
substituted for our separately verified factory All Off / All On command.

The factory constant `CMD_STOP_ALL_MOTOR` (14) appears in a system that also
controls chassis/peripheral motors. Its name does not prove arm-servo stopping
semantics. We have not validated that command as an arm stop and did not send it.

It remains unknown whether an overloaded joint keeps reduced force, releases,
needs a reset, resumes on the next goal, or stops any other joint. Nor have we
established behavior on host loss. We found no manufacturer specification in
the reviewed material establishing a validated, whole-arm human-pinch response.
This is a bounded research finding, not proof that no other documentation exists.

## Recommended next investigation

1. Inventory each joint's model and firmware, controller firmware, and existing
   protection enable bits and thresholds. Read only; retain a baseline.
2. Establish whether present load/current/fault reads work through the existing
   factory USB bridge while the arm is stationary. Preserve servo error bytes,
   verify full checksums, model-specific layouts, plausible values, timestamps,
   and missing replies. Do not confuse a failed read with zero load.
3. If available, measure useful update rate and latency on all six joints without
   compromising motion/Stop traffic. A separate BusLinker or controller firmware
   work may be needed if forwarding is unavailable; neither is authorized or
   required to be installed by this research.
4. Define and validate the whole-arm response with qualified hardware/safety
   input and an instrumented, non-human fixture: detection latency, force,
   stopping travel, residual squeeze, gravity support, other joints, host loss,
   and explicit recovery. Never use fingers or hand-restraint of a powered joint.
5. Decide the classroom model from evidence: maintain a hands-off guarded work
   area unless human-contact protection is actually demonstrated and assessed.
   Fault monitoring can add protection; do not remove preventive limits on that
   basis alone. Independently review development limits against actual hardware.

These steps are a proposal, not implemented safeguards or an instruction to
change settings. No sensor read or physical protection test has been performed.
