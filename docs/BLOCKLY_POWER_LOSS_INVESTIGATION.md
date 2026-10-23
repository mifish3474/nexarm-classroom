# Blockly power/holding loss investigation

User follow-up: the program was targeting J3 rather than the expected J1. The
user then confirmed Blockly is working. This clarification does not establish
that a J3 selection caused a real electrical power failure. The initial report
and software audit below remain historical evidence; diagnostics are retained
for any recurrence. Routine testing has resumed at the user's direction.

Report: J1 moved briefly, then the teacher observed loss of power and servo
holding. The user suggested that Blockly might send commands too quickly.
The cause remains unknown. No speed, command timing, firmware mode, torque
behavior, or motion destination has been changed as a proposed fix.

## Verified software behavior

- Normal program steps send a single existing 14-byte unicast movement frame.
  The next step waits for settled feedback and at least 500 ms since the previous
  completed write. The 50 ms timer polls the executor; it is not a write rate.
- Program speed is 600 and acceleration 10, the current tested Home profile.
- Connect, Enable, block completion, program completion, fault, and connection
  cleanup do not request torque-off or restore. Stop can send an urgent measured-
  position movement/hold command; it does not release torque.
- Only the separate setup page's explicit holding action calls the factory
  All Off/All On encoder. The Blockly page has no binding to that action.
- Synthetic tests hold feedback short of a target for multiple seconds and
  confirm no second command is sent; rapid settling still cannot bypass the
  500 ms interval. Stream closure during a run produces no release or retry.

The movement layout matches the manufacturer's [continuous-register-write
protocol](https://wiki.hiwonder.com/projects/NexArm/en/esp32-version/docs/3_Motion_Control.html).
The manufacturer separately describes the external adapter and USB data cable
in [First Power-On](https://wiki.hiwonder.com/projects/NexArm/en/esp32-version/docs/1_Getting_Started_NexArm.html).
These references do not diagnose the reported failure or certify the power path.

## Evidence needed before another movement comparison

Keep automatic Blockly motion stopped until the power/holding loss is understood.
Identify whether robot lights/OLED went dark, restarted, or stayed on; whether
the USB device disappeared; whether power recovered itself or needed cycling;
the active program and first target; the browser's last visible message; and
whether factory control/other robot tabs were closed. With power off, checking
the original adapter and its external connections is a read-only first step.
Do not substitute an unverified supply or change firmware as a diagnostic shortcut.

Loss of input power, reset, protective shutdown, servo-side behavior, or a
communication problem remain hypotheses, not established causes. A disconnected
browser cannot determine physical holding state. A reported power loss should
not be relabeled as a normal feedback timeout.

## Diagnostic export added in dev.24

The main page now has **Export robot diagnostics**, available after a connection
has been created and after a disconnect/fault. It downloads the existing report
plus up to 200 write records and 200 connection/fault/Stop events. Write records
include page-clock timing, operation, exact submitted bytes, preceding positions,
and stream-write completion/failure. Stream completion is not device acceptance
or physical movement confirmation. Recent movement feedback remains in the report.
Power, voltage, and torque are explicitly marked unmeasured.

Export sends no robot commands and uploads nothing. Records are bounded in memory,
retained across reconnects in the same page, and lost on reload. This logging is
not retroactive: dev.24 cannot recover packets from the earlier dev.23 incident.
The export's presence is not an instruction to repeat the failed movement now.
