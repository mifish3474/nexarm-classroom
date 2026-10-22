# Reference A review and first mapping-test proposal

Date: 2026-10-22  
Status: evidence reviewed; movement proposal awaiting teacher approval  
Scope: documentation and packet-encoding check only; no writer enabled

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

This is a proposed teacher-operated commissioning exception for one small test,
not general live arming with unknown limits. It is not implemented or authorized
by submission of the reference/photos. No automatic reset precedes or follows it.

### Purpose and exact command

Test the working hypothesis that reported servo 1 is the base-turn axis, and
observe the direction of increasing raw values from a teacher-marked viewpoint.
The physical direction must be observed, not assumed from a positive number.

Starting reported servo-1 value: **2048**. Proposed target: **2068** (+20 raw).
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
- Servo 1 must remain exactly 2048 throughout that window. Other reported values
  must remain within 12 raw units of Reference A. These are test-matching gates,
  not commissioned robot limits. Recheck them immediately before any write.
- If the starting conditions differ, reject this test. Never command 2048 to make
  the hardware fit the plan, adjust the target silently, or automatically retry.
- One session, one writer, an explicit teacher enable, and a separate deliberate
  Send single test command action. No student block, keyboard repeat, or generic
  raw-packet control may trigger it. Retire authorization after one attempt,
  including uncertain delivery; reconnect does not restore the permission.

The teacher must approve these conditions and the command before a commissioning
writer is introduced. The intended local travel is 2048 toward 2068; this is not
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

The next teacher response should confirm the photographed/exported configuration,
current clearance/cutoff/cable conditions, and whether the narrowly described
single positive servo-1 test is approved for implementation. If any condition is
uncertain, retain passive inspection and revise the proposal instead.
