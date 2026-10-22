# Reference A review and first mapping-test proposal

Date: 2026-10-22  
Status: teacher confirmed the configuration and approved this single positive
servo-1 test in this conversation on 2026-10-22.
Scope: a guarded one-shot teacher page is implemented; the agent has not executed
a physical test. No reverse, repeat, homing, gripper, or other joint is authorized.

## First teacher-executed result

Teacher supplied `nexarm-mapping-test-result.json`, captured at 10:00:06 Eastern
on 2026-10-22 (`2026-10-22T14:00:06.871Z`), and reported: **“The arm moved clockwise
a small amount.”** The agent did not access the physical robot.

| Reported servo | Before command | Latest exported reading | Change |
| --- | ---: | ---: | ---: |
| 1 | 2051 | 2066 | +15 |
| 2 | 2044 | 2044 | 0 |
| 3 | 2043 | 2043 | 0 |
| 4 | 2049 | 2049 | 0 |
| 5 | 2043 | 2043 | 0 |
| 6 | 2053 | 2053 | 0 |

The requested target was 2068, a +17-unit target change from the measured start
of 2051. The latest reported position is 2066, two units below the target. The
report marks `attempted: true`, `written: true`, and `phase: Complete`, meaning
the application's candidate feedback criteria were satisfied. The exported
before/latest vectors show only channel 1 changing; they are not a complete
time series of all movement. Do not issue a corrective command for the two-unit
residual.

The teacher explicitly confirmed that this was **the base rotating clockwise
when viewed from directly above**. Record the local mapping as **servo 1 = base
turn; increasing raw value = clockwise from above**. This is a teacher-observed
local axis/direction result; angular scale, mechanical zero, travel limits,
reverse behavior, and repeatability remain unverified. The source report's
physical-joint/direction fields are null; the confirmed teacher observation is
recorded here separately rather than rewriting the original file.

This result does not establish degrees per raw unit, reversal/backlash behavior,
safe travel limits, a Home pose, or a route back. The one-shot approval is consumed.
Do not clear the marker or automatically return to 2048/2051. No additional
movement has been authorized by submission of this result.

Teacher-requested refinement on 2026-10-22: allow servo 1 to report **2043–2053**
throughout the observation window, instead of requiring exactly 2048. The target
remains **2068**, so the commanded positive change is **15–25 raw units**. This
is not a general tolerance policy for other joints or future tests. The original
approval-consumption key is retained; this change does not grant another attempt.

## Running the approved test

1. Run `npm run dev`, open teacher passive inspection, and follow **Teacher:
   approved Reference A single-axis test** in its footer. Close the passive
   connection before connecting the test page. Direct local path: `/mapping.html`.
2. Recheck the photographed setup, full-arm clearance, cable slack, empty gripper,
   anchoring, physical cutoff, and marked viewing direction; check the setup box.
3. Click Connect for approved test. It only opens/listens. If the reviewed starting
   values are not present, stop and report the discrepancy; do not force or command
   the robot back to 2048.
4. Once the full-checksum observation window passes, click Enable one attempt.
   This also sends nothing. Recheck the physical scene, then deliberately click
   Send single test: servo 1 to 2068. This is the one physical movement action.
5. Observe the actual joint and direction. Use Stop / Disconnect for cancellation
   of future work and the reviewed physical cutoff procedure if needed. A transmitted
   command cannot be recalled. No automatic return or correction follows.
6. Export the current test report and provide the observed physical joint,
   direction from your marked viewpoint, and any unexpected behavior. Do not
   attempt a reverse movement or force the arm by hand.

The approval is marked consumed in browser localStorage before write initiation,
even when delivery is uncertain. Reload, reconnect, or a write error does not grant
another attempt. There is no reset/clear-approval button. Storage denial/failure
blocks sending; a pending write keeps the connection lease until cleanup settles.
Browser storage can be cleared by administrators or users and differs between
origins/profiles, so this is an accidental-repeat guard, not tamper-proof security.
Do not clear storage, switch origin/profile, or use the old prototype to repeat it.
A blocked/consumed test requires review and a separately approved follow-up.

The two-second observation deadline includes write time. The implementation
checks feedback gaps and staleness, bounds the starting window, disarms on hidden
page/Stop/errors, and records only a feedback candidate. Physical joint/direction
fields in the report remain unknown until the teacher supplies observations.

## Evidence supplied

Teacher-supplied reference export captured at 09:33:37 Eastern on 2026-10-22
(`2026-10-22T13:33:37.343Z`), plus top/oblique photo `IMG_0663.JPG` and side photo
`IMG_0662.JPG`. The photographs are treated as views of the exported configuration
pending teacher confirmation. They were not copied into the repository; the
original images and their metadata remain with the teacher.

| Reported servo | Latest raw value | Observed minimum | Observed maximum |
| --- | ---: | ---: | ---: |
| 1 | 2048 | 2048 | 2048 |
| 2 | 2048 | 2048 | 2048 |
| 3 | 2047 | 2047 | 2047 |
| 4 | 2048 | 2048 | 2048 |
| 5 | 2042 | 2042 | 2043 |
| 6 | 2053 | 2052 | 2053 |

The export reports eleven accepted full-checksum samples spanning 1997 ms.
The observed spread is zero raw units for channels 1–4 and one unit for channels
5–6. This is useful evidence of a steady reported configuration at capture time.
The export contains summary statistics rather than raw frames or per-sample
timestamps, so it does not independently establish packet integrity, individual
sample gaps, present freshness, physical shaft accuracy, or long-term repeatability.
It does not include total abbreviated-only frame counts.

## What the photographs establish

The side view shows an approximately upright upper arm, a forearm descending
toward a bent wrist, and an approximately horizontal tool assembly. The other
view shows the gripper open. Clamps are visible at the base. These are qualitative
observations, not angle measurements. We cannot determine precise link dimensions,
axis offsets, payload limits, clamp tightness, or complete cable/sweep clearance
from these views. Nearby equipment and loose items must be checked in person.

The current simulator has an invented neutral shape. Values near 2048 on all six
channels do not mean all physical links are straight, parallel, or at zero angle.
Each physical axis needs its own reference angle, direction, angular scale, and
geometry. Do not silently replace those unknowns with estimates from perspective
photographs. Reference A is an observed pose, not an approved Home pose.

The images alone do not establish which numerical channel controls which physical
axis. The handoff supplies supporting earlier movement observations; deliberate
mapping and direction tests are still required for commissioning.

## Proposed first test: one positive command to reported servo 1

This teacher-operated commissioning exception is approved for one small test,
not general live arming with unknown limits. Approval came from the teacher's
explicit confirmation after reviewing the proposal, not merely from submitting
photos or data. No automatic reset precedes or follows it.

### Purpose and exact command

Test the working hypothesis that reported servo 1 is the base-turn axis, and
observe the direction of increasing raw values from a teacher-marked viewpoint.
The physical direction must be observed, not assumed from a positive number.

Starting reported servo-1 window: **2043–2053**. Fixed target: **2068** (+15–25 raw;
nominally +20 from the exported reference of 2048).
The handoff reports prior teacher-tested +/-20 factory commands; that observation
does not establish a safe absolute operating range or this setup's clearance.
Actual actuator speed/acceleration under this command is not newly validated.

```text
FF FF 01 05 03 2A 14 08 B0
```

This is one factory goal-position write to servo ID 1, register `2A`; `14 08`
encodes 2068 little-endian. The checksum is `~(01+05+03+2A+14+08) & FF = B0`.
The encoder has a golden test for these exact bytes. Nothing is sent by that test.

### Conditions before the proposal can be approved or executed

- Teacher confirms that the photos correspond to this exported reading and that
  the arm/setup has not changed. Otherwise collect a new reference and review.
- Teacher verifies anchored base, empty gripper, accessible physical cutoff,
  untensioned cables, and clearance for the entire arm/tool in both directions of
  a small possible movement. The initial axis mapping is a hypothesis, so do not
  inspect only a presumed base-turn clearance. Remove nearby objects as needed.
- Teacher reviews the small local movement region in person. A raw-number window
  is not a substitute for mechanical/workspace clearance or a verified hard limit.
- Fresh expected full-checksum telemetry establishes a continuous observation
  window. Require at least ten samples over one second, latest age at most 500 ms,
  no sample gap over 500 ms, and no observed joint spread over 12 units.
- Servo 1 must remain within **2043–2053 inclusive** throughout that window. Other reported values
  must remain within 12 raw units of Reference A. These are test-matching gates,
  not commissioned robot limits. Recheck them immediately before any write.
- If the starting conditions differ, reject this test. Never command 2048 to make
  the hardware fit the plan, adjust the target silently, or automatically retry.
- One session, one writer, an explicit teacher enable, and a separate deliberate
  Send single test command action. No student block, keyboard repeat, or generic
  raw-packet control may trigger it. Retire authorization after one attempt,
  including uncertain delivery; reconnect does not restore the permission.

The teacher must approve these conditions and the command before a commissioning
writer is introduced. The intended local travel starts within 2043–2053 toward 2068; this is not
a declaration that that interval is physically safe without the setup review.

### What the supervised test would observe

1. Teacher marks a fixed viewing direction relative to the base/desk (for example,
   looking down from above with the same marked edge toward the observer).
2. Teacher explicitly sends the one approved command while monitoring the arm and
   keeping cutoff access available. Record which physical joint moves, direction
   from the marked viewpoint, any cable tension, and any unexpected movement.
3. Observe fresh reported feedback for at most two seconds after the write. This
   is a conservative observation deadline, not a proven servo settling-time spec.
   Look for servo 1 approaching 2068, with other channels near their starting values.
4. A candidate feedback result is servo 1 within 12 raw units of 2068, at least
   8 units above its actual starting value, with three consecutive fresh readings
   spanning at least 200 ms and spread no greater than 3 units. Other channels
   should not depart more than 12 raw units from their pre-command baselines.
   These are draft evaluation rules accounting for previously observed residual
   error; matching them does not prove the physical axis mapping or safety.
5. Missing/weak/stale telemetry, unexpected axis movement, excessive deviation,
   failure to settle within the observation window, read/write error, timeout,
   hidden page, or operator Stop ends the test without further commands. Treat
   uncertain delivery as possibly executed. No correction loop or return command.
6. Export/record the observed result for review. The arm stays wherever it ends;
   returning to Reference A requires a separately reviewed/approved action.

Stop can cancel an unsent operation and prevent additional commands. It cannot
recall a transmitted target or guarantee physical stopping. No torque disable,
firmware mode change, disconnect-as-stop assumption, or speculative hold packet
is part of this test. Use the teacher-reviewed physical cutoff procedure for an
unexpected physical event; gravity/support behavior under power loss is still
unverified and must be considered in the in-person setup review.

## Subsequent calibration decisions

If approved and successful, this establishes one local channel/direction result,
not an angular scale or full-range calibration. Request separate review before
testing reversal or another joint. Keep gripper-closing tests separate because of
pinch risk. Do not sweep joints to find hard stops.

Once directions and reference angles are known, measure link geometry and verify
raw-to-angle relationships against manufacturer data and supervised observation.
Then implement a profile-specific reference drawing and a lesson-start preflight.
An eventual move-to-start action additionally needs an approved route from the
actual measured configuration, velocity/acceleration evidence, and physical
failure handling. None of those permissions follow from this reference review.

The teacher confirmed the photographed/exported configuration, approved this test,
and has now supplied its result above. The operating steps in this document are historical
instructions for that consumed approval, not permission to repeat it. Any follow-up
requires its own reviewed command and setup conditions.
