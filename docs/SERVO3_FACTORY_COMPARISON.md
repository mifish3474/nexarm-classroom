# Servo 3 factory-settings comparison — approved and enabled in dev.15

## Latest reported result

Follow-up: the teacher reports the same positive comparison timeout with Servo 3
at 2033, after a successful Home return. This weakens the hypothesis of a problem
confined to the earlier 2512 pose. It still does not establish why +20 fails.
The exact +20 factory comparison at this lower pose remains outstanding.

Additional static call-path inspection confirms factory manual input dispatches
through `flush_pending_servo_cmds` (line 563), calling `send_servo_cmd` (line 576).
That function uses the combined acceleration/position/speed packet already
implemented here. `CommManager.send_packet` (line 385) uses the same length and
full checksum calculation and emits a `TX` hex-log event. A real factory TX line
for the matched small move can test the static interpretation against operation.
Neither matching static code nor synthetic tests prove the live commands have
the same effect. No movement parameters or fault limits were changed for this
follow-up; obtain factory +20 physical movement and refreshed Read Pos evidence.

The teacher supplied a timeout: start 2512, target 2532, reported 2512,
remaining 20, little or no reported movement. Confirm which button produced it,
because the fault text alone does not identify the chosen parameter profile.
For a factory-profile target of 2532, the expected complete packet is
`FF FF 03 0A 03 29 64 E4 09 00 00 D0 07 9E`.

The next discriminating observation is factory movement to the **same target**
from the same pose, followed by Read Pos. General success in both directions at
other positions does not settle this comparison. A limit, physical resistance,
command acceptance, or telemetry issue remains possible; none is established.
Do not increase speed/torque, reverse automatically, or bypass the fault based
only on this timeout. No runtime behavior was changed after this report.

The teacher answered **Yes enable**. The separate comparison button is now below
the joint controls on `/mapping.html`. Connect and Enable as usual, then click
**Servo 3 +20 at factory settings** once. Observe physical movement and share the
displayed start/target/actual readings and any fault. Export movement diagnostics
for a detailed local record. Normal jog and Home settings remain 100/10.

The teacher confirms Servo 3 moves in both directions in the factory app with
displayed speed 2000 / acceleration 100, but physically does not move on browser
+20 at our explicit 100 / 10. This strengthens the parameter-mismatch hypothesis;
it does not prove the cause. Both directions encode correctly in unit tests.

## Concrete proposed change

The explicit **Servo 3 +20 at factory settings** comparison action uses the
existing shared controller and requires the existing connected, enabled, fresh-read,
clearance and single-writer checks. Use the current actual reading +20, speed
2000 and acceleration 100 in one combined register-write packet. No pose matching
or return to Home is required. No automatic retry or other-joint movement follows.

For illustration only, if the actual reading is 2436, the target would be 2456.
The fields before checksum are:

`FF FF 03 0A 03 29 64 98 09 00 00 D0 07`

This uses the same verified encoder and factory-app packet layout; position stays
the same as an ordinary +20, while speed and acceleration match the teacher's
successful factory test. The comparison packet is unit-tested. Only this separate
action selects 2000/100; normal application parameters remain 100 / 10.

Observe whether Servo 3 physically moves, its starting and ending reported values,
and the diagnostic result. Existing Stop attempts a current-position hold; a
physical cutoff remains available. Speed/acceleration register values may persist,
but our normal jog/Home packets explicitly set their own values on every move.
Do not send an extra restoration movement automatically.

After the result, choose the normal jog profile and a separate Home profile based
on observed behavior. Do not apply speed 2000 to a long Home return merely because
a short manual move worked. The requested Home values remain unchanged.

Approval scope: implement and enable this single explicit comparison action.
