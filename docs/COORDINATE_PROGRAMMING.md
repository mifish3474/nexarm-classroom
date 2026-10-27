# Checked XYZ/P/R/C programming: dev.43

Dev.43 immediately reports a fully checked calculation reply containing 24
zero bytes as **no usable joint solution supplied**. The block-4 diagnostic
captured exactly that response, including six zero joint targets, about 22 ms
after a correctly encoded request. The first three calculations succeeded.
This does not prove physical impossibility or establish the controller's reason.
No limits or movement checks are bypassed, and the destination is not skipped.
Existing named joint-pose blocks can be mixed with XYZ blocks to replay a
recorded pose without the firmware coordinate calculation.

Dev.42 identifies the failing block and requested values, and distinguishes a
missing parsed calculation reply from replies rejected by ID/checksum/layout or
exact coordinate matching. The last rejection reason and bounded reply history
are in Export robot diagnostics. This is a diagnostic improvement; no limits or
movement checks are bypassed. Export an existing failed session before refreshing.

The direct native coordinate sender from dev.37/38 remains blocked. Dev.40
replaces it with **calculate → check all six joint targets → move as a timed
joint pose**. The robot supplies the inverse-kinematics calculation; the browser
does not guess geometry. Coordinate preview and simulation remain deferred.

## What Run does

1. Validate the entire bounded program and its explicit joint/saved-pose targets.
   All requested targets must fit the six [operating ranges](./OPERATING_RANGES.md).
2. Request calculation-only results for every expanded coordinate block before
   sending any program movement, including movements earlier in the program.
3. Accept only a fully checksummed command-7 result with exactly 24 payload
   bytes, an expected controller/bridge ID, matching XYZ/P/R/C, and six raw
   targets in 0–4095. Calculated targets never replace measured readings or make
   feedback fresh. Weak, malformed and unrelated frames cannot authorize a move.
4. Reject any target outside its joint's operating range. Report the block,
   joint, target and valid range; never clamp a calculated result.
5. Once every calculation passes, return to the established Home before block 1.
   This also applies when starting outside a joint range. Already within 40 raw
   units of Home on every joint skips the return. After an actual return, readings
   must be within that tolerance within two seconds of frame completion, or the
   program faults without starting blocks. This is not hardware homing or proof
   of clearance from an arbitrary initial pose. Home does not change an invalid
   calculated destination into a valid one.
6. Send six ordinary joint targets for each checked destination using the
   existing timed-pose executor: per-joint speed up to 600, acceleration 10,
   at least 2 ms between completed writes. Long moves extend the requested time
   to respect the speed cap. Recheck the measured starting pose before each
   movement in a coordinate program.

No matching calculation reply within two seconds stops preparation, with no
program movement. The operator has reported successful calculations before a
later block fails; a later timeout is not proof of missing firmware support or
an unreachable target. There is **no fallback to direct command 8**.
Stop, disconnect, hidden page, stale feedback and write failures cancel pending
work; late replies cannot restart a canceled program. Only an explicit Run starts
another program. The wire protocol has no request ID; matching uses echoed pose
fields and one outstanding calculation, not a firmware transaction nonce.

All accepted calculations and transmitted packets are in **Export robot
diagnostics**, under **Robot readings and diagnostics**. A reply rejected for
layout, checksum or echo mismatch eventually produces the calculation timeout.

## What this establishes—and what remains

Every commanded joint goal is inside the configured ranges. Moving in joint
space between in-range endpoints keeps the mathematical joint interpolation in
range. Actual servo tracking, overshoot, mechanical clearance and combinations
of individually valid angles are not certified by those endpoint checks. There
is no link-collision model or obstruction detection added here. The earlier
arm/shoulder proximity report is not a diagnosed mechanical fault or a proven
pinch-free route. Do not reproduce that route to test this change.

The tool follows the servo-space path between calculated poses; it does **not**
promise a straight line in XYZ or constant tool orientation along the path.
Elapsed frame time is not proof of arrival. Stop attempts the existing fresh
measured-position holds; it does not cut power. Protected student policy and
physical clearance/Stop validation remain student-release requirements.

## Fields and first development check

| Field | Meaning | Factory convention |
| --- | --- | --- |
| X, Y, Z | Tool position | Millimeters |
| P | Pitch / tilt | Degrees, tenths permitted |
| R | Roll / rotation | Whole degrees |
| C | Claw opening | Whole degrees |
| Duration | Requested pose time | 0.1–10 seconds; may be extended |

Development input bounds remain X 0–550, Y -550–550, Z -570–570, P -180–180,
R/C -90–90. Z=-71 is accepted. These are input bounds, not a calibrated workspace.

1. Refresh and confirm **0.7.0-dev.43**. Connect and check the live joint and
   XYZ/P/R/C readings under **Robot readings and diagnostics** against the LCD.
2. Start with **New empty program → Add XYZ/P/R/C block**. With fresh feedback,
   the block copies the reported values. Review all six values and a short
   duration. An identical tool pose may still calculate a different joint pose;
   joint limits alone do not guarantee clearance. Keep the established clear
   testing area and cutoff access.
3. Run a single ordinary nearby destination. If calculation is unsupported,
   there should be no program movement: export diagnostics and report the
   message. Do not switch to the old native sender.
4. For an accepted move, inspect the physical path and final readings. Stop if
   clearance is questionable; save the diagnostics rather than repeating the
   hazardous movement. Record accepted endpoints in the optional
   [comparison worksheet](./COORDINATE_COMPARISON.csv).
5. Use **Save program** to retain the test, and **Load program** to restore it
   later. Loading does not connect or move the robot. Chain checked coordinate
   blocks with saved positions, Wait and Repeat after the single-move check.

## Protocol evidence

The manufacturer's [motion documentation](https://wiki.hiwonder.com/projects/NexArm/en/esp32-version/docs/3_Motion_Control.html),
section 3.6, links the calculation-only example. Its
[Robot_Arm.cpp](https://drive.google.com/file/d/17j-VK5l0WTOwWVPaxAoLdnMbN1lmgMhG/view)
active `Robot_Arm_t::move(..., calc_only)` sends command 7 for calculation or 8
for movement, with the same 14 arguments: little-endian P×10, X, Y, Z, R, C,
time in ms; system ID 255. Its
[system_task_handle.cpp](https://drive.google.com/file/d/1Fy3389wJc1lv6PCI541pQ18Vpqnvsdcc/view)
handles command-7 replies with controller ID 0x5A and XYZ/P/R/C plus six servo
targets. The existing USB viewer uses bridge ID 255. No downloaded firmware is
compiled, flashed or executed; no persistent servo settings are changed.

The passive command-11 readout remains separate: XYZ/P/R/C first, measured joint
values last, pitch divided by ten. Reference point and physical geometry still
need verification. Dev.37–39 history is in IMPLEMENTATION_NOTES.md.
