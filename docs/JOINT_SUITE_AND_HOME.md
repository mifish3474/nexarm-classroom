# Joint tests, staged return, and teacher recovery

Historical commissioning workflow, now at **`/mapping-tests.html`**. For the
current reusable +/-20 controls and the teacher's new Home values, use
[`/mapping.html` and these instructions](./TEACHER_CONTROLS.md). Reference A below
is the earlier pose; its approvals and bounds remain separate.

Updated for 0.7.0-dev.10. Supervised teacher commissioning only; this is not student
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
write/close cleanup. An out-of-region pose blocks return renewal only. The historical base test cannot be
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

## Continue testing without precise manual Home placement

If holding is already restored, do not repeat release/restore to fit a narrow
numeric window. In dev.10:

1. Reconnect if needed and wait for stable readings. After holding confirmation,
   the **Choose your next step** panel explains why each action is unavailable and links to
   its controls. Movement-clearance boxes must be checked again deliberately.
2. In **Review current test start**, inspect the current pose and holding,
   clearance for positive 20-unit tests, and cutoff access. Check its confirmation
   and click **Review current test start**. This records readings; it sends nothing.
3. Wait for a new stable window. Confirm the selected joint's clearance and use
   **Enable one attempt → Send single test**. Record physical joint and direction.
4. Select each remaining joint in turn, renew clearance, and repeat its separate
   test. The current-pose review stays active across selection on this connection.
   Gripper requires its additional pinch-area confirmation.
5. If a test was consumed earlier, use the separate teacher retry review. Reviewing
   the current pose never erases or renews an old attempt. Export before leaving.

The current-pose review uses the teacher's on-site clearance assessment for a
single +20 test. It is independent of the historical Home-return bounds below;
servo 2 at 2108 can be reviewed and tested toward 2128. The old 2004-2076 region
is a return-route scope, not a mechanical limit. Single-joint retry review also
uses this separation; reviewing the pose alone does not renew a consumed test.

New per-joint start windows are within 12 of the captured readings. At Enable,
target freezes at current reading +20; actual Send delta must remain 15-25.
Uncommanded-joint drift supervision remains 12. A recorded earlier positive test
may leave a companion near its endpoint; fresh feedback must still fit the
reviewed relative observation window. The encoder rejects targets above 4095;
0-4095 describes the protocol, not safe mechanical travel. No automatic reversal
or general jog controls are added. The teacher must inspect physical clearance
at the reviewed pose; student live control remains disabled.

Active start reviews are session-only and are invalidated by Stop, fault,
disconnect, reload, new manual setup, or enabling a return. Reference A stays
unchanged. The review is saved in the existing bounded local review history;
exports include `testStartReview`, and each attempted command retains its review
evidence even if that attempt faults. No new accounts or network requests exist.

## Teacher manual positioning in the browser

The teacher confirmed that factory All Off allows manual placement, All On held
the new pose in that test, Read Pos refreshes the factory number fields, and the
browser passive inspector matches those refreshed readings. This supports the
current setup workflow; it is not a guarantee of torque behavior at every pose.
The earlier unchanged factory number was resolved by Read Pos, not by changing
servo calibration or weakening the browser's packet checks.

On `/mapping-tests.html`, connect and collect fresh stable readings, then:

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
placement does not redefine Reference A. The staged return keeps its own
starting-region limits; current-pose joint tests use the teacher-reviewed start. Position
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

The table describes legacy starts when no current pose has been reviewed. A
reviewed current start replaces these windows with captured readings +/-12.
Target/packet preview freezes at Enable. Send requires continued reviewed-start
evidence and a positive measured command of 15–25 units. Readings can change the
preview before Enable, never the frozen target afterward. This fixes the old
mismatch between Reference A arrival and tests centered on earlier readings.
The old targets still result when enabling at those old exact readings. Servo 1's
original fixed command/window remains unchanged internally.

Without a current-pose review, legacy starting windows combine Reference A +/-9 with earlier reviewed windows.
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

These are staged-return software bounds, **not verified mechanical or
collision limits**. They apply only to this automatic route. Upper edges are unchanged. Lower edges for 1, 4, 5, and 6 now
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
and torque state remain unmeasured. Factory release/re-enable, post-manual readback,
and browser manual positioning through holding confirmation were teacher-tested.
The revised page order and current-pose policy need teacher validation. Automated
regressions cover reviewed servo 2 starts 2018 and 2108, independent Home blocking,
selected-joint retry at 2108, and rejection of an unencodable +20 target.
