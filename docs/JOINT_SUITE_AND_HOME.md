# Joint tests, staged return, and teacher recovery

Updated for 0.7.0-dev.8. Supervised teacher commissioning only; this is not student
live control or calibrated general homing. The teacher requested the remaining
joint tests, a return for all servos, and subsequently a practical retry/manual
positioning workflow. The assistant has not connected to or moved real hardware.

## Recover from the previous lockout

1. Export the existing result. After a fault, Stop / Disconnect and reconnect
   explicitly. Close other robot controllers first.
2. Wait for fresh stable readings. Inspect holding behavior, anchoring, empty
   gripper, cable slack, movement sweep, and accessible physical cutoff.
3. In **Teacher recovery**, confirm inspection and review. Choose **Allow one more
   staged return** or **Allow one more selected-joint test**. Review sends nothing.
4. Clearance boxes reset and a new observation window is required. Reconfirm
   clearance, then use Enable and the separate Send/Start action.
5. Export before leaving. If a pose gate still blocks movement, report its
   displayed observed/permitted readings; recovery does not bypass these gates.

Each review permits one additional attempt for that scope on this connection.
Stop, disconnect, page hiding, selection changes, and reload revoke unused retry
permission. Failed/uncertain writes consume attempts without automatic retry.
Review is unavailable during active operations, stale/weak feedback, unresolved
write/close cleanup, or an out-of-region pose. The historical base test cannot be
renewed here. Do not clear browser storage or change profiles to bypass guards.

Original consumed markers remain. Each review records scope, timestamp, readings,
previous marker, and available previous result in local storage; each retry uses
its own consumed marker. Schema-version-2 export includes recovery reviews and
retry command records, the current return result, latest joint results, session
attempt history, and teacher notes. Notes stay in memory until export; avoid
student names. Earlier observations lost on reload cannot be reconstructed from
command records. Storage failure blocks review/write without erasing evidence.
History is bounded to 500 reviews and 2 MB; a full history needs export and
engineering review, not a storage reset. All data stays local.

## Teacher manual positioning in the browser

The teacher confirmed that factory All Off allows manual placement, All On held
the new pose in that test, Read Pos refreshes the factory number fields, and the
browser passive inspector matches those refreshed readings. This supports the
current setup workflow; it is not a guarantee of torque behavior at every pose.
The earlier unchanged factory number was resolved by Read Pos, not by changing
servo calibration or weakening the browser's packet checks.

On `/mapping.html`, connect and collect fresh stable readings, then:

1. Support the arm, empty the gripper, clear all pinch areas and the possible
   sweep, and check cutoff access. Check the manual-support confirmation.
2. Click **Enable manual positioning**, then **Release all servos** separately.
   Enable sends nothing. Release sends the factory All Off command once.
3. Verify it released before gently placing it. Never force resistance. Continue
   supporting its weight; removal of holding power can let the arm fall.
4. Once placed and readings are stable, click **Restore servo holding**. Continue
   support and clearance while verifying the physical result. A completed write
   is not proof of torque state, and prior observed holding is not a universal
   firmware guarantee against movement toward an old goal.
5. After a new stable observation window, check the separate physical-holding
   confirmation and click **Confirm holding restored**. It sends nothing. Recheck
   movement clearance and collect a new window before any return or joint test.

The only added packets are factory system command61, device255: All Off
`FF FF FF 03 3D 00 C0`, All On `FF FF FF 03 3D 01 BF`. They come from the supplied
factory software, not bridge command98. There is no position target, center reset,
mode switch, automatic restore, or recording/playback in this manual operation.
They use the same guarded writer, >=900 ms command interval, two-second write
deadline, fresh full-checksum feedback, and exclusive serial lease as the tests.

Joint selection, tests, returns, and retry review are blocked throughout manual
setup. A durable interlock is saved **before** release/restore writes. Stop, fault,
page hiding, disconnect, or reload sends no automatic holding command and leaves
**Recovery required** after a potentially transmitted release. Reconnect explicitly
and restore or physically verify holding. A new connection reloads the interlock
even when its page was opened before another tab released the arm. Hanging writes
retain ownership until cleanup settles; late completions cannot resume setup.
An unsent Enable can be canceled without changing physical holding.

If the factory app restored holding externally, reconnect and confirm physically
restored holding with fresh stable readings; no redundant All On is needed.
`nexarm.commissioning.manual-positioning.v1` stores the interlock and the last50
local command/confirmation events, timestamps, and readings. The combined export
adds `manualPositioning`; measured torque state is explicitly unknown. Storage
failure blocks writes/confirmation, never silently clears the interlock.

## Factory controls as an alternative

Hiwonder's [ESP32 Getting Started guide: PC Software / Action Group Control](https://wiki.hiwonder.com/projects/NexArm/en/esp32-version/docs/1_Getting_Started_NexArm.html)
documents **All Off** to release torque and **All On** to enable it. Teach Edit
also releases servos on entry and powers them on at exit. This documents a
manufacturer manual-positioning route, consistent with the teacher's local test.

Export and disconnect the browser
before opening the supplied factory app. Support the arm before torque release;
gravity can make it fall. Use an empty gripper, keep fingers out of joint/jaw pinch
areas, and never force powered joints. Re-enabling may move toward an old goal;
do not assume All On captures the newly placed pose. Maintain support and
clearance and follow the manufacturer procedure. Unexpected resistance/movement
ends the test. Avoid All Home and Calibration Center for this recovery.

Use factory Read Pos to refresh its numbers. After holding is restored and stable,
close the factory app, reconnect the browser, and inspect fresh readings. If they
do not follow a changed pose, stop before any movement and report it. Manual
placement does not redefine Reference A or bypass numerical gates. Position
telemetry does not prove torque state. The external manufacturer link opens only
on a click. Autonomous hand-guided recording/playback remains unimplemented.

## Remaining joint tests

Servo 1 is the prior confirmed base test: increasing raw values moved it clockwise
viewed from above. It is recorded and never repeated by this UI. Servos 2–6 are
selected/tested individually. Factory joint labels remain hypotheses until observed.

| Servo | Hypothesis | Allowed starting readings | Target at Enable |
| --- | --- | --- | --- |
| 2 | Shoulder | 2039–2057 | Current reported value +20 |
| 3 | Elbow | 2038–2056 | Current reported value +20 |
| 4 | Wrist pitch | 2039–2057 | Current reported value +20 |
| 5 | Wrist roll | 2033–2051 | Current reported value +20 |
| 6 | Gripper | 2044–2062 | Current reported value +20 |

Target/packet preview freezes at Enable. Send requires continued near-reference
evidence and a positive measured command of 15–25 units. Readings can change the
preview before Enable, never the frozen target afterward. This fixes the old
mismatch between Reference A arrival and tests centered on earlier readings.
The old targets still result when enabling at those old exact readings. Servo 1's
original fixed command/window remains unchanged internally.

Starting windows combine Reference A +/-9 with earlier reviewed windows.
Unselected joints match the reviewed reference/test regions; attempted joints may
remain near their declared local positive endpoint. Base must match Reference A
(2039–2057) or the historical result (2061–2071). Markers do not prove position.
All retained samples must pass checksum, freshness, stability, and pose gates.
Gate failures show the joint, observed range, and permitted range.

Gripper requires separate empty-gripper/clear-pinch confirmation at Enable and
Send; positive values may open or close it. Candidate feedback requires >=8 units
of positive change, target error <=12, and three matching samples spanning >=200 ms
with spread <=3. Another joint drifting >12, unexpected selected-joint deviation,
or a two-second write/observation deadline faults the operation. Record which
physical joint moved, direction, and viewing side; feedback cannot establish these.

## Staged return

Reference A: `[2048,2048,2047,2048,2042,2053]`. Order: **2, 3, 4, 5, 1, 6**, one
joint at a time. Joints already within +/-9 are skipped. The handoff documents
ordinary 5–9-unit residual error; the old +/-5 gate could reject that normal result.
The new gate accepts settled +/-9 without chasing error; it does not prove angular
accuracy. Teacher physical inspection remains necessary.

These are local commissioning software bounds, **not verified mechanical or
collision limits**. Upper edges are unchanged. Lower edges for 1, 4, 5, and 6 now
include Reference A minus9. An out-of-region pose is rejected.

| Servo | Permitted return-start readings | Reference A |
| --- | --- | --- |
| 1 | 2039–2080 | 2048 |
| 2 | 2004–2076 | 2048 |
| 3 | 1938–2075 | 2047 |
| 4 | 2039–2081 | 2048 |
| 5 | 2033–2075 | 2042 |
| 6 | 2044–2085 | 2053 |

Evenly spaced rounded targets are at most16 units apart (previously20), leaving
room for up to9 units of lag while retaining the <=25-unit command-from-measured-
position ceiling. The planner supports both signs, caps at32 waypoints, previews
exact factory-register packets, and freezes at Enable. Start requires <=5 drift
from the frozen starting vector. From the earlier reported pose
`[2046,2009,1943,2048,2044,2052]`, the route now has ten steps: S2
`2022,2035,2048`; S3 `1958,1973,1988,2002,2017,2032,2047`. Other servos are skipped.

Each waypoint requires three fresh samples spanning >=200 ms, spread <=3, and
target error <=9. Writes remain >=900 ms apart, with a two-second write/settling
deadline. Actual readings must match the preceding planned region and actual
command delta must be <=25. Uncommanded drift >12 is supervised during motion
and between waypoints. Completion requires all six within9 of Reference A. No
automatic correction or post-test return is performed.

Tests and return share one guarded writer and exclusive connection lease.
Weak/stale feedback, unexpected deviation, timeout, Stop, hidden page, read/write
fault, or uncertainty cancels future commands. Hanging writes retain ownership
until cleanup settles. Reload/connect/selection/review/Enable sends nothing. Stop
cannot recall a transmitted target and is not a certified physical stop.

Automated checks use synthetic USB streams, including the ten-step route, 9-unit
lag, near-home starts, review/reload/storage failures, Stop, hanging writes, and
command spacing. Release/restore checks also cover exact factory packets,
physical-confirmation gates, storage failures, reload/older-tab interlocks,
hanging writes, and late completion. Actual speed, force, clearance, stopping,
and torque state remain unmeasured. Factory release/re-enable and post-manual
readback were teacher-tested; these new browser controls still need their first
supervised physical check.
