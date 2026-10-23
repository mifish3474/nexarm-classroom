# Development operating ranges: dev.30

The operator supplied these ranges on 2026-10-23, based on factory-software
values with adjustments during testing. The pairs are interpreted as low/high.
They are not independently verified mechanical limits or the stricter protected
student policy planned for later.

| Joint | Low | High |
| --- | ---: | ---: |
| J1 | 900 | 3000 |
| J2 | 525 | 2600 |
| J3 | 2000 | 2900 |
| J4 | 1250 | 3000 |
| J5 | 1024 | 3072 |
| J6 | 1024 (open) | 2731 |

In dev.30 the operator lowered J2's minimum from 1200 to 525. The upper
endpoint remains 2600. Live readouts, recording, sliders and movement validation
all use this same range.

`app/src/safety/OperatingRanges.ts` is the shared, fixed configuration. There is
no browser range editor, saved-profile setup, additional margin or teacher
approval workflow. This does not write limits or other settings into the servos.

Current robot-mode Blockly programs are checked in full before any movement:
every joint target and all six targets of every saved position must fit these
ranges. Invalid programs name the position, joint, target and applicable range.
Rejection sends no command and leaves the session enabled so the operator can
edit and retry. Direct pose buttons and the setup page's live sliders, absolute
moves, jogs, Home and Servo 3 comparison use the same target checks. Sliders and
numeric targets show their joint-specific range; jogs beyond it are unavailable.

Existing saved positions are preserved exactly, with visible per-joint warnings
and disabled direct playback when invalid. No target is silently changed to an
endpoint. Record a replacement inside the displayed ranges, select that new
position in the block, then delete the old one when appropriate. The recording
panel shows six live read-only boxes beside the position-name field, with each
joint's range. Any invalid joint turns its box and the panel border red and
shows an Out of range label. New recording is blocked until every joint is
inside range, feedback is fresh and no motion/write is active. The controller
revalidates the actual snapshot on capture; a stale enabled button cannot save
invalid values. Exact range endpoints are allowed. Existing records are retained.

Readings outside range do not disable Connect, current-session readiness or release/
restore. A deliberate target back inside range remains available. Stop retains
its existing behavior: attempt holds at fresh measured positions, even if those
positions are outside the requested-movement ranges. Changing a Stop hold to a
range endpoint would itself request a new movement, so it is not clamped.
Settling accuracy is separate from these exact goal bounds: ±12 generally,
with ±30 for J3 program/pose/Home moves of at least 100 units in dev.32.
Direct manual controls and smaller J3 moves retain ±12. Range checks for
recording and requested targets remain exact; settling allowances do not widen them.

Simulation retains the general 0–4095 encoding range for learning; hardware
mode checks the operating ranges before executing that program. The legacy
root Connection Lab and archived mapping-test suite retain their original
behavior; these new ranges apply to the current classroom/setup controller.

The supplied diagnostic file showed the t2 request twice stopping at S3 3058
instead of 3144, and S4 3084 instead of 3407. Feedback continued, with no later
goal commands before the fault. This establishes repeated shortfall, not its
physical cause. Under the new operating ranges, t1's J3 3006 and t2's J3 3144 /
J4 3407 are rejected before movement. Other old poses may also need replacement.
No wider tolerance, increased power, retry, calibration or automatic movement
was added as a remedy. Home remains inside all six supplied ranges.
