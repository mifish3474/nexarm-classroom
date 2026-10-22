# Speed-controlled movement review — pending teacher approval

The existing slow Home is a paced sequence, not velocity control. Do not make
that sequence faster and describe it as a speed-controlled return.

## Evidence

[Manufacturer serial protocol, continuous register write](https://wiki.hiwonder.com/projects/NexArm/en/esp32-version/docs/3_Motion_Control.html)
describes command 03 starting at register 29 hex, with acceleration (1 byte),
position (2 bytes), two zero reserved bytes, and speed (2 bytes). Speed is
documented in steps per second, up to 3400. Acceleration units and zero-speed
behavior are not established here; zero is excluded from the candidate encoder.

Static inspection of supplied `NexArm.exe`, already extracted under ignored
`.analysis/nexarm-factory`, independently matches this exact layout in
`ServoTab.send_servo_cmd` (source line 576). Constants bind acceleration to 41
and position to 42. No EXE or Python bytecode was executed. The app also computes
a duration-based speed as distance * 1000 / milliseconds * 1.2, clamped 10-3400;
that adjustment is factory implementation evidence, not measured timing accuracy.

`encodeSpeedPosition` implements and tests the packet only. It has **no live
caller**. No speed command, mode change, calibration, or new Home behavior is
enabled in this build.

## Proposed first physical test

After approval, add a separate explicit test button using the shared writer:

- Teacher connects, confirms holding and clearance, and enables the test.
- Freeze servo 1's current stable position plus **20 raw units** as the target.
- Send one continuous-write packet with **speed 20 steps/second, acceleration 10**.
  If starting at 2050, the target is 2070. Do not move to 2050 as a prerequisite.
- Nominal travel is about one second before acceleration, residual error, and
  firmware effects. Compare observed travel with the ordinary jog.
- Supervise fresh full-checksum feedback, direction and companion drift, with
  a five-second write/settling observation deadline; do not retry automatically.
- Stop cancels future commands but cannot recall that target. This small test
  does not establish a firmware stop mechanism for a long speed-controlled move.
- Report travel time, final value, and any unexpected movement. Speed and
  acceleration settings may affect later position-only commands; do not claim
  automatic restoration of unknown previous settings. Subsequent app movement
  must explicitly set its intended speed, or settings must be restored in the
  factory app before returning to bare position commands.

After that test succeeds, implement Home as one speed-controlled target per
joint, sequentially, with progress and distance-dependent deadlines instead of
hundreds of waypoints. Decide and validate cancellation of a long in-flight
move before enabling the full route. Keep the requested Home unchanged.

Approval requested is for implementing/enabling this single +20 base test;
it does not enable the full speed-controlled Home route yet.
