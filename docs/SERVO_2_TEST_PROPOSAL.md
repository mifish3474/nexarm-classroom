# Servo 2: next local mapping test

Status: proposed; not approved, implemented, or executed. Existing servo-1 approval
remains consumed. No movement is authorized by this document.

Deferred while [factory software findings](./FACTORY_SOFTWARE_FINDINGS.md) are
used to build/validate a candidate model without additional physical movement.

## Purpose

Identify which physical joint servo ID 2 controls and the direction of increasing
raw values. Shoulder movement is the working hypothesis, not an established fact.
Observe from a fixed side viewpoint and describe movement toward/away from the
gripper-facing side of the base, or supply a short before/after description.
Do not assign clockwise/counterclockwise without specifying the viewing side.

Keep the base at its current measured position. Do not return it to Reference A
as a prerequisite. Mapping all axes and their directions comes before attempting
an accurate visual model or a move-to-start action.

## Proposed command and matching conditions

The teacher's last exported readings were:
`[2066, 2044, 2043, 2049, 2043, 2053]`. They are historical evidence; a new full
telemetry observation window must confirm the current state before Enable/Send.

| Item | Proposed value |
| --- | --- |
| Commanded servo | 2 only |
| Permitted starting readings | 2039–2049 inclusive (2044 +/-5) |
| Fixed target | 2064 |
| Positive commanded change | 15–25 raw units |
| Expected servo-1 starting region | 2061–2071 (2066 +/-5); no base command |
| Other starting joints | Within 12 raw units of their last exported values |
| Number of attempts | One, consumed before write; no retry or automatic return |

Packet: `FF FF 02 05 03 2A 10 08 B3`.
`10 08` encodes 2064; `~(02+05+03+2A+10+08) & FF = B3`.
This uses the proven single-servo factory register-write path, not bridge mode.
No torque, mode, gripper, or firmware changes are proposed.

Require the same full-checksum observation gates: at least ten samples over one
second, latest age at most 500 ms, no gap over 500 ms, and no retained per-joint
spread over 12 units. The entire retained window must match the starting regions,
and checks run again immediately before Send. Rejection never triggers a reset
or a substituted target. These small numeric regions are test-matching conditions,
not verified mechanical limits or proof of collision clearance.

## Physical review before approval/execution

Teacher reconfirms anchoring, empty gripper, cable slack, cutoff access, and
unchanged hardware/setup. Inspect the arm's full local clearance, particularly
possible lifting/lowering of the upper arm and gripper. Moving another axis has
different mechanical effects from turning the base; the first test does not
establish safe speed, gravity behavior, or clearance for this axis.

Keep the initial mapping hypothesis provisional: if another physical part moves,
record that fact and end the test. Do not force powered joints, explore hard stops,
or issue extra commands to discover which joint responds.

## Observation, cancellation, and result

After an explicit Enable and separate Send action, observe for at most two seconds
including write time. A candidate feedback result requires servo 2 within 12 raw
units of target 2064 and at least 8 units above its immediate starting value, with
three consecutive fresh matching readings spanning at least 200 ms and spread at
most 3 units. Reported servo-2 motion outside 2027–2076 or another joint moving
more than 12 raw units from its pre-command baseline faults the test. These are
draft observation bounds, not guaranteed physical motion limits.

Weak/stale feedback, changed preconditions, unexpected motion, errors, timeout,
page hiding, or Stop end the operation without further commands. Retain the same
exclusive session and consumed-approval policy, including uncertain delivery and
hanging-write cleanup. No automatic correction, return, or reverse is allowed.

Software cancellation cannot recall an already transmitted target or establish
physical stopping. The accessible physical cutoff and teacher-reviewed support
procedure remain necessary; torque-off/hold packets are not introduced.

Export the test report, and report which physical joint moved and its direction
from the fixed side viewpoint. Feedback alone cannot establish the mapping.
No angular scale, neutral pose, general safe range, or calibrated model follows
from one successful local direction observation.

## Approval checkpoint

Ask the teacher to approve this specifically scoped servo-2 test and reconfirm
the physical clearance/setup. Only after approval implement its guarded writer
and mock-stream checks. Preserve the consumed servo-1 marker; a separate approval
must never silently reactivate that earlier command.
