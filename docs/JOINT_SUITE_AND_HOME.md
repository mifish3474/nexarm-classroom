# Joint suite and returning to Reference A

## Joint suite requested by the teacher

The teacher requested one build covering the remaining joints, with a report for
each. `/mapping.html` now has a common commissioning controller, independent
one-shot scopes, and a combined local report. Servo 1 remains a recorded base
observation, not an offered repeat. Each remaining test has separate clearance
confirmation, Enable, and Send. Selection never executes or automatically advances.

| Servo | Factory model hypothesis | Starting window | Fixed target | Command bytes |
| --- | --- | --- | --- | --- |
| 2 | Shoulder | 2039–2049 | 2064 | FF FF 02 05 03 2A 10 08 B3 |
| 3 | Elbow | 2038–2048 | 2063 | FF FF 03 05 03 2A 0F 08 B3 |
| 4 | Wrist pitch | 2044–2054 | 2069 | FF FF 04 05 03 2A 15 08 AC |
| 5 | Wrist roll | 2038–2048 | 2063 | FF FF 05 05 03 2A 0F 08 B1 |
| 6 | Gripper | 2048–2058 | 2073 | FF FF 06 05 03 2A 19 08 A6 |

Each is a 15–25-unit positive command from the permitted starting window. The
gripper needs a separate empty-gripper/clear-pinch-area confirmation at both Enable
and Send; its opening/closing direction remains unknown. No hand-guiding, torque
change, automatic post-test return, repeat, or unrestricted raw command is included.

All retained observations must pass the existing full-checksum/timing gates.
Unselected joints match the last reviewed region; previously attempted suite
joints may instead remain near their declared target. A stored attempt is not
proof of that position: actual telemetry must match. The base must fit either
Reference A's 2043–2053 band or the completed base test's 2061–2071 band, not an
arbitrary pose between/outside them. Current uncommanded-joint deviation is still
supervised against the pre-command readings. Each attempt has its own persistent
marker; the old base marker is not reset.

Completed tests can be selected on the same connection only when no write/run is
active. Selection clears evidence and the physical-setup confirmation; collect a
new stable window and recheck the physical scene. A fault ends the run and requires
inspection, explicit disconnect/reconnect, and fresh evidence; it never schedules
the next joint. Before leaving or reloading, export the combined report. Reports
and teacher notes are memory-only; persistent attempt markers survive even if an
unexported report is lost. Do not clear them to repeat a command.

## Why the current pose blocks these tests

The teacher subsequently reported current values:
`[2046,2009,1943,2048,2044,2052]`, after possibly repositioning the arm.
Reference A is `[2048,2048,2047,2048,2042,2053]`.

Servos 2 and 3 are respectively 39 and 104 units below their reference readings,
well outside the small observation tolerance. The other four joints are already
within five units. Do not widen test gates to absorb this displacement and do not
use the factory Calibrate Center function. Returning to a pose and redefining
servo centers are different operations.

## Staged return for all six servos

The teacher explicitly requested a way to return to the approved home pose, then
expanded the request: "add a staged return for all servos while we're at it."
That authorizes this bounded commissioning implementation. The assistant has not
connected to or moved the real robot. Before the teacher starts it, the page shows
the complete route, requires full-route/empty-gripper/pinch-area clearance, then
separate Enable and Start actions. No movement occurs on connection or Enable.

Order: servo 2, 3, 4, 5, 1, 6 (shoulder, elbow, wrist pitch, wrist roll, base,
gripper are model hypotheses except the teacher-confirmed base). Each joint is
finished before the next begins. Joints already within +/-5 of Reference A are
skipped. Positive and negative increments are supported. This is not a
collision-checked trajectory or calibrated general homing facility. The teacher
must review the full sweep, cable slack, anchoring, and physical cutoff access.

Starting readings must fit this local commissioning region. It covers the reported
pose and declared joint-test endpoints with observation margins; these are
software test bounds, **not verified mechanical limits or safe ranges**:

| Servo | Allowed starting readings | Reference A |
| --- | --- | --- |
| 1 | 2041–2080 | 2048 |
| 2 | 2004–2076 | 2048 |
| 3 | 1938–2075 | 2047 |
| 4 | 2043–2081 | 2048 |
| 5 | 2039–2075 | 2042 |
| 6 | 2047–2085 | 2053 |

An out-of-region pose is rejected, without widening limits or substituting a
route. The planner divides each remaining distance into evenly spaced rounded
targets, each nominal change at most 20 raw units, with a 32-waypoint ceiling.
For the teacher's reported readings, the route is exactly the eight steps below;
base, wrist, roll, and gripper are skipped because they already match tolerance.

| Step | Servo | Target | Nominal change from prior target/start |
| --- | --- | --- | --- |
| 1 | 2 | 2029 | +20 |
| 2 | 2 | 2048 | +19 |
| 3 | 3 | 1960 | +17 |
| 4 | 3 | 1978 | +18 |
| 5 | 3 | 1995 | +17 |
| 6 | 3 | 2012 | +17 |
| 7 | 3 | 2030 | +18 |
| 8 | 3 | 2047 | +17 |

The preview shows exact packets from the tested factory register encoder.
The bounded interpolation avoids one 104-unit target jump; it does not by itself
guarantee physical velocity or acceleration. Actual actuator behavior is still a
commissioning assumption requiring adult observation.

Implemented execution guards:

- Collect a fresh stable observation window before Enable. Freeze the preview
  route at Enable; Start must remain within +/-5 of that frozen starting vector.
- Fresh continuous full-checksum feedback, exclusive single writer/session,
  adult clearance/cutoff confirmation, and deliberate Enable then Start Return.
- One commissioning route attempt, consumed before its first write. No
  reload/reconnect reset, route changes during execution, or automatic retry.
- Recheck every segment against current measurements. Its absolute change must
  be at most 25 raw units; the preceding target must have settled within +/-5.
- At least three matching fresh readings spanning 200 ms, spread at most 3 units,
  before advancing; at least 900 ms between writes; at most two seconds to observe
  each waypoint. The tighter +/-5 gate may fail under the handoff's reported
  5–9-unit residual error; such a failure ends the route, not a correction loop.
- Any uncommanded joint deviation over 12 units, weak/stale feedback, timeout,
  uncertainty, Stop, hidden page, or read/write fault cancels all future segments.
  A hanging write retains ownership until cleanup settles. A transmitted segment
  cannot be recalled; physical cutoff/support procedure remains necessary.
- Completion requires every joint within five units of Reference A, without any
  extra correction. Export the result before considering a retry or other movement.

The return and joint tests share one guarded serial writer and exclusive
connection lease. Neither can be enabled while the other is enabled/running.
A canceled or uncertain write cannot release ownership for a replacement writer
until the outstanding write and close cleanup settle. The consumed base-test
marker remains unchanged; the staged return has its own one-shot marker.

This first build permits **one return attempt total**, not one per reload or per
joint. Failure/Stop also consumes it. Another return needs a reviewed follow-up;
do not erase storage to repeat it. All six joints are covered by the planner, but
it is not a reusable classroom Home button yet. Arrival is based on reported raw
values and teacher inspection, not proof of shaft accuracy or mechanical zero.

## Teacher test sequence

1. Use the local preview's teacher inspection link, then **joint tests and staged
   reference return** (`/mapping.html`). Close other robot controllers first.
2. Review anchoring, clearance, empty gripper, and cutoff access. Check the selected
   joint clearance box and click **Connect for joint tests**. Check the live readings.
3. Review the complete return preview and physical sweep. Check its separate
   clearance box, click **Enable staged return**, review the frozen route, then
   **Start staged return**. Stay with the robot. Unexpected behavior requires the
   reviewed physical cutoff/support procedure; software Stop cancels future steps.
4. After completion, inspect the physical pose. The app collects a new stable
   window before any joint test becomes enabled. If the return faults, export and
   report it before attempting other movement.
5. For each remaining joint, select it, renew clearance (plus the separate pinch
   confirmation for servo 6), Enable, and Send its one test. Record which physical
   joint moved and its direction from a stated viewpoint. Selection sends nothing.
6. Export **all joint observations** before leaving. The JSON includes the prior
   confirmed base result, staged-return state/route/readings, and each new test
   with teacher notes. Avoid student names. Everything stays local.

Automated tests use synthetic USB streams. They cover the eight-step return,
all-six signed route planning, settling/write ordering, command spacing,
unexpected drift, Stop, hanging writes, storage failure, independent joint
attempts, and reload lockouts. They do not establish physical speed/acceleration,
collision freedom, gripper force, or actual stopping behavior.
