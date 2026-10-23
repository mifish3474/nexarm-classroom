# Simulation and teacher control preview 0.7.0-dev.20

## Current update: concurrent Home at doubled speed

The teacher explicitly requested starting all Home joints together and doubling
Home speed. Home now sends the needed targets back-to-back in one guarded USB
write at speed 600 / acceleration 10, using up to six existing checksum-valid
unicast position commands. This changes the physical sweep from the earlier
sequential route. It is not a new firmware broadcast instruction, an atomic
delivery guarantee, coordinated Cartesian planning, or synchronized arrival.
Joints traveling shorter distances can finish first. Near-Home joints are skipped.

ConcurrentHomeMotion supervises each moving joint's path, settling, and deadline
through the existing motion supervisor. Other commanded joints are expected to
move; all joints, including skipped and already-settled ones, retain group path
checks. Completion requires all moving joints to settle and the final whole-pose
check. One joint's fault fails the group without automatic retry. Stop attempts
fresh-position holds for every commanded joint in one write, retaining existing
handling of stale feedback, pending writes, and uncertain delivery. A partial USB
delivery is possible and never treated as successful completion.

The page now says Return together to Home, shows individual joint feedback, and
estimates duration from the longest move rather than the sum of all distances.
Manual slider speed/acceleration, live reversal behavior, Home values, and student
simulation are unchanged. The teacher reports dev.19 now resembles the factory
app, including a slight J2 tremor that then settles; this concurrent return still
needs its own physical test.

Validation: 154 unit tests, ten synthetic-USB Chrome browser tests, and the
TypeScript/Vite build pass. Tests cover grouped
dispatch, frame checksums, independent settling, skipped and already-settled
joints, path faults, timeout, feedback loss, and fresh-position holds for all
commanded joints. All automated motion checks use synthetic USB.

The following sections record earlier versions.

## Current update: fast slider reversals and small input changes

The reported fault (S1 at 2463, newest path 2078 to 2038) exposed a problem with
checking each live update as an isolated move. A still-moving slider now retains
the range of targets actually dispatched for its joint. Later readings can travel
toward an earlier target during a reversal, within the existing 100-unit margin.
Overwritten pending targets do not widen this range. Settling, switching joints,
Stop, disconnect, and fault end the operation; a later operation starts a new
range. Arrival still concerns the newest target only. Reversal settling waits
and deadlines allow for travel from the earlier dispatched targets. Export
includes the commanded path range. Home and jog supervision retain their paths.

Live input changes smaller than 10 raw units from the last dispatched target
are suppressed to reduce small mouse-driven target changes. The release/change
event sends the exact final target once, including a change below that threshold.
Updates remain limited to ten per second, with one newest-target pending slot.
Speeds, acceleration, holding commands, and Home values are unchanged.

The teacher also reports J2 vibration during dragging and with the mouse still;
the factory app vibrates less during movement and briefly before settling.
Input filtering
addresses a possible command source, not a verified physical cause. The browser
does not issue feedback-driven corrections or automatic retries. Persistent
vibration after input stops remains unresolved; it is not treated as successful settling or fixed by raising
arrival tolerance. No firmware tuning or automatic torque release is introduced.

Export retains up to 64 feedback samples per operation (within the existing
100-operation history), in memory until local export, to investigate J2's
position oscillation alongside the command profile. No data is uploaded.

Validation: 146 unit tests, ten synthetic-USB Chrome browser tests, and the
TypeScript/Vite build pass. Regression checks
reproduce the reported fast reversal, reject travel beyond dispatched targets,
reset the range after settling/Stop, budget reversal deadlines, suppress small
J2 input changes, preserve the final release target, and verify that oscillating
feedback alone sends no corrective command. Physical testing remains necessary.

The following sections record earlier versions.

## Current update: wider motion tolerance and slider handoff

Teacher motion now permits 100 raw units of selected-joint overshoot beyond the
commanded path and 100 raw units of companion-joint variation, replacing 20.
These are feedback fault thresholds, not calibrated mechanical limits. Manual
slider completion permits that companion variation rather than applying the old
12-unit whole-pose check. The selected joint still needs settled target feedback;
Home retains its existing arrival and final-pose accuracy checks. Speeds, Home
targets, Stop, USB failure handling, and feedback deadlines are unchanged.

A completed slider operation also retained ownership of its joint and rejected
input on another slider. Ownership now permits handoff after completion while
still blocking another joint during movement, a pending target, or a USB write.
This addresses the report that only S1 responded; physical confirmation remains
necessary. Synthetic checks exercise all six live sliders with one Enable.

Validation: 141 unit tests and eight synthetic-USB Chrome browser tests pass,
including all six live sliders after one Enable. Unit checks cover both sides of the 100-unit boundary,
slider completion with companion drift, strict Home accuracy, and all-joint
handoff. TypeScript/Vite build passes. Hardware has not been operated by Codex.

The following sections record earlier versions.

## Current update: live teacher sliders

Dragging a slider now sends targets during input, at most once every 100 ms,
through the existing shared USB writer. A single pending slot retains only the
newest target; intermediate positions are replaced rather than replayed. The
active slider stays enabled through writes and settling. Releasing it keeps the
final target, with duplicate input/change events suppressed. Numeric entry still
requires Move and retains the half-second interval.

Stop immediately clears the pending target. Disconnection, page hiding, faults,
and feedback older than 500 ms also discard unsent targets. Late write completion
cannot restart canceled motion. Other joints and Home wait for the current joint.
Slider defaults remain speed 2000 / acceleration 100; Home remains 300 / 10.
No student live execution, dependency, or external request is added.

Validation: 129 unit tests, seven targeted Chrome browser tests with synthetic
USB, and TypeScript/Vite build pass. Checks cover input before release, duplicate
events, newest-target replacement, early settling, Stop, stale feedback, hanging
writes, and cancellation. Actual feel and smoothness require teacher testing.

The following sections record earlier versions.

## Current focus: factory-style sliders and faster Home

Our goal remains a privacy-first Blockly classroom: program, simulate, observe,
then run teacher-approved hardware. We have established USB communication,
holding release/restore, individual movement, and Home under tested conditions.
The teacher requested a simpler hardware test milestone instead of continuing
small-jog commissioning: operate all joints through sliders and return Home.

Each joint now has a live reading, target slider, numeric target, speed,
acceleration, and Move button. Slider changes preview locally and send on release;
numeric entry sends on Move. Sliders initialize from actual readings, and retain
selected targets while feedback updates separately. Defaults match the factory
fields: speed 2000 and acceleration 100. Encoding range 0-4095 is not a verified
mechanical range. This is supervised teacher testing, not student live control.

Home retains the requested pose and order, with speed 300 (three times its former
100) and acceleration 10. Its estimate and deadlines use that profile. Actual
travel time is not guaranteed to scale exactly threefold. Small +/-20 jogs remain
inside collapsed details in each card as secondary controls.

Only one joint moves at a time. A running slider joint can be retargeted after
500 ms with fresh feedback and an idle writer; that explicit command replaces
its old target. Other joints and Home wait. There is no queued future click.
Invalid targets do not cancel the existing move. Stop cancels future Home joints
and attempts the existing fresh-position hold.

Manual moves that settle short are labeled Settled short with the remaining
error, without claiming arrival, repeated correction, or a lockout. The teacher
can request a new target. Home retains arrival checks and does not silently skip
a joint. Unexpected deviation, missing feedback, and USB failures still fault.

Acceptance: operate each slider both ways, verify release/restore, Stop a move,
and complete Home at speed 300. Then use the observations to define the hardware
profile and resume Blockly work. The root prototype and simulator are preserved;
no new dependency, login, upload, deployment, or simulator USB access was added.

Earlier updates below are historical.

Validation for dev.16: 126 unit tests, 20 Chrome browser tests, and the
TypeScript/Vite build pass. Targeted browser checks were repeated after collapsing
the earlier comparison and requiring numeric fields; blank fields send nothing.
The slider layout was visually inspected. All motion tests used synthetic USB;
actual smoothness and the faster Home return remain teacher hardware checks.

## Current update: approved Servo 3 comparison

The teacher approved enabling **Servo 3 +20 at factory settings**. This separate
button below the joint controls sends one target from the current reading +20,
with speed 2000 / acceleration 100. Existing Enable, holding confirmation,
freshness, encoder boundaries, serialized writes, feedback, and Stop checks apply.
Extra clicks during movement are not queued. No return or retry runs automatically.

Each motion plan carries its explicit profile through packet dispatch, deadlines,
visible diagnostics, and export. Normal jog and Home retain 100/10 and send those
values on every command. Stop retains its normal-profile current-position hold.

Refresh `/mapping.html`, confirm dev.15, close the factory app, Connect and Enable.
Click the separate comparison once. Report whether Servo 3 physically moved,
the displayed start/target/actual readings, and any fault. Export movement
diagnostics if needed. Hardware success is not assumed.

Validation: 123 unit tests, six synthetic-USB Chrome tests, and TypeScript/Vite
build pass. Tests cover the comparison packet, blocked overlapping clicks, visible
profile, and a following jog returning to the normal profile.

The following sections record previous updates.

## Current update: Servo 3 diagnostics

Follow-up: the teacher confirms actual bidirectional factory movement at displayed
2000 / 100 and no physical movement on browser +20. A concrete
[factory-settings comparison](./SERVO3_FACTORY_COMPARISON.md) is prepared and its
packet is unit-tested. Enabling that comparison awaits approval of the parameter
change. No current speed, acceleration, Home route, or other movement is changed.

The teacher reports Home stopping at Servo 3 and +20 becoming grey after a press,
while negative presses work. Controls intentionally disable during an outstanding
move; this does not establish whether the positive move stalls or triggers another
fault. The code has no Servo-3-specific positive-direction restriction except the
generic 4095 encoder ceiling. Synthetic tests accept both signs. The physical
cause is not established.

Dev.14 displays the commanded joint, initial reading, target, actual reading, and
remaining distance directly under the jog controls. Fault messages identify a
timeout/no reported progress, the specific companion joint drifting, or a reading
outside the commanded path. Local export preserves the failure-time readings and
command even when later feedback changes. Export movement diagnostics is now
visible beside the controls. No motion limits, Home values, speed, acceleration,
retries, or force settings are changed in this diagnostic update.

The teacher's factory screenshot displays speed 2000 / acceleration 100 for all
six joints, compared with our explicit 100 / 10. This is a potential lead, not
proof of a firmware or mechanical cause. The factory UI has previously shown
cached values, so distinguish displayed fields from confirmed applied settings.
Do not silently increase app speed twentyfold based on the screenshot. Await
observations of actual Servo 3 movement and the new fault details before choosing
a parameter-change test.

Validation: 121 unit tests and build pass, including Servo 3 positive-stall and
negative-success diagnostic cases. Browser checks exercise synthetic motion.

## Current rebuild: continuous speed-controlled movement

The teacher requested a rebuild for smooth joint control and smooth Home. This
authorizes the combined speed/acceleration/position packet researched in the
previous update. Every new jog and Home command explicitly sets speed 100 raw
units/second and acceleration 10. Home sends at most one destination per joint,
in order 2,3,4,5,1,6, rather than a chain of small waypoints. The requested Home
values remain unchanged. These are initial physical-test settings, not measured
velocity or acceleration guarantees.

The old narrow sample-window gates and repeated capture waits are removed from
direct controls. Valid readings within 500 ms permit commands; shorter feedback
gaps pause buttons without disarming. Idle gaps do not revoke Enable. During
movement, a 1.5-second feedback loss cancels future commands and disarms. Weak
frames are ignored while waiting for valid feedback. Actual failure reasons stay
visible. USB writes have a two-second deadline and retain ownership if unresolved.

Home completion is supervised per joint, with distance-based deadlines and
deviation checks. Stop cancels future targets and attempts a speed-controlled
hold at the latest measured position on the moving servo, when fresh readings
and an idle writer permit it. A pending write or stale reading can prevent this;
the page reports that condition. A hold request is not a certified physical stop.
Disconnect and page hiding also cancel and attempt that hold before cleanup.

Tests now model gradual servo movement for the browser workflow. The simulated
robot demonstrates the packet sequence and responsiveness, not real-arm smoothness.
Validation: 119 unit tests, 18 Chrome browser tests, and the TypeScript/Vite build
pass. The running local page reports 0.7.0-dev.13. No physical robot was connected
by the assistant; verify the feel of speed 100 / acceleration 10 on a single jog
before trying the complete Home return.
Earlier sections below describe superseded implementations.

## Current update: half-second jog recovery and speed-control research

Jog controls can accept the next click 500 ms after the preceding write completes,
provided the preceding move has settled and the last three fresh readings span
at least 200 ms with spread no greater than three. They no longer wait for a new
full one-second capture after each jog. Initial arming, manual setup, and fault
recovery retain their full observation window; Home retains its existing pacing.
No clicks queue while movement or a write is unresolved.

The factory app and manufacturer documentation agree on an atomic command carrying
acceleration, target position, and speed. An offline-only encoder and a concrete
[one-joint test proposal](./SPEED_CONTROL_REVIEW.md) are ready for approval. There
is no live caller for the new command. Speed-controlled Home is pending that
physical test and review of cancellation during a longer in-flight move.

Verification: 125 unit tests and the TypeScript/Vite build pass. Chrome directly
exercises all twelve jog buttons at 500 ms intervals with synthetic USB data.

This preview starts architecture packages A/B/C. It is not a complete safety
controller, full programming curriculum, or student live-robot release.

The simulator, passive inspection, and joint mapping pages now display the loaded
version in their headers. Vite fills these labels and the simulator footer from
`package.json` in development and production builds, so future version changes
need only one application version source.
The development server reads that source for each HTML response; a running server
does not retain an older label after the package version changes.

## This update: direct +/-20 controls and the requested Home

The teacher requested more direct control: reusable -20/+20 buttons on all six
servos, Home `[2050,2150,2100,2200,2000,1080]`, and a slow return. The main
`/mapping.html` now provides those controls. Connect, one per-session setup
confirmation, and Enable are followed by direct reusable jog buttons and Home.
No test-start review or consumed-attempt renewal is required for these actions.
The historical base approval and all old attempt markers remain unchanged.

Home uses a finite frozen route, one joint at a time in order 2,3,4,5,1,6.
Nominal increments are at most 10 raw units, completed writes are at least 1200 ms
apart, actual command delta is at most 20, and each step needs settled feedback.
No new firmware speed command is used; this paces the return rather than setting
the physical velocity of each step. Final feedback within nine raw units is
accepted. Stop cancels remaining steps and leaves USB connected; inspect and
Enable to jog or start a newly calculated return. There is no automatic restart.

Fresh stable full-checksum readings, single-writer ownership, command spacing,
step supervision, timeouts, and the durable manual holding interlock remain.
Healthy connections can recover from a fault with inspection, stable readings,
and deliberate Enable; outstanding writes still block new commands. The optional
release/restore section uses the existing factory commands and physical holding
confirmation. Reports export locally. No student hardware execution was enabled.

The earlier workflow is preserved at `/mapping-tests.html`; its Reference A stays
separate from the newly requested Home. Its page and regression tests retain the
prior one-shot approvals. The root prototype remains unchanged.

See [direct-control testing steps and exact behavior](./TEACHER_CONTROLS.md).
Verification: **122 unit tests, 18 Chrome browser tests, and the TypeScript/Vite
build pass**. Browser tests use synthetic USB data; the long gripper return is
tested with an accelerated clock. The final layout was visually inspected and
the running local server reports version 0.7.0-dev.11 with all six requested Home
values. Real hardware speed and clearance remain teacher validation.
The following sections describe the earlier commissioning workflow and history.

## Earlier update: teacher-reviewed starts and a usable page order

The teacher reported that Review current test start stayed unavailable and the
page order made testing difficult. The reported servo-2 value was first 2018,
then corrected to possibly 2108. The latter is outside the old 2004-2076 return
region. The underlying defect was applying a historical Home-route envelope to
the teacher's review of a small single-joint test. Those bounds were never
established as mechanical travel limits. Following the teacher's request, that
inherited restriction now applies only to the automatic staged-return route.

The page follows this workflow:

1. **Connect and inspect readings.** Connect is independent of the joint-test
   clearance checkbox and sends no application command. Stop stays visible when
   scrolling. Stable feedback still takes about one second after an action.
2. **Position the arm if needed.** Skip release/restore if already holding a
   suitable pose. If used, finish physical holding confirmation first.
3. **Review current test start.** Inspect holding, the physical pose, clearance
   for small positive tests, and cutoff access; check the box and click Review.
4. **Test one joint.** Select a joint, confirm clearance, Enable, then Send.
   Record its physical joint/direction and export observations just below.
5. **Teacher recovery** permits one more selected-joint attempt after inspection
   if a previous test is consumed. Review the current start first if needed.
   **Optional staged return** is at the bottom and is not a prerequisite.

The on-site teacher's review records the current stable six readings without
redefining Reference A. Single tests use relative start windows within 12 raw
units of the review; at Enable, target freezes at the latest selected reading
+20. Send still allows only 15-25 raw units of positive command from feedback.
Targets must be encodable (0-4095); that is a protocol validity check, not a
claim that the whole range is mechanically safe. The teacher reviews actual
clearance for this supervised test. There is no arbitrary target input,
automatic reverse direction, student hardware access, or expanded Home route.
The historical base test remains consumed and cannot be repeated here.

Joint retry review no longer inherits the Home-route envelope either. Return
retry still requires its original route bounds. Reviewing a pose never renews
a consumed test; the separate retry action preserves prior records. Selected
start drift, uncommanded-joint drift, full-checksum fresh stable telemetry,
command spacing, exclusive writer, feedback deadline, and manual-setup interlock
remain enforced. Unchecking joint clearance while idle no longer disconnects;
it still stops an enabled or running joint test.

Active pose reviews remain connection-only and expire on Stop, fault, manual
setup, return enable, disconnect, and reload. Local audit evidence persists in
the bounded review history and reports, including faulted attempt snapshots.
No new accounts, dependencies, uploads, or runtime network requests were added.

A prior browser regression also exposed a staged-return timing race. Scheduling
now waits for the shared 900 ms interval before dispatch, measured from write
completion. The interval remains enforced; it was not shortened.

## This build: joint suite and staged return

The teacher requested a build testing all remaining joints, then a staged return
covering all servos so the robot can reach Reference A before those tests.
`/mapping.html` now provides five separate deliberate tests (servos 2–6), teacher
observation fields, and one combined local report. Servo 1's confirmed clockwise
base test remains recorded and consumed; it is not offered for a repeat.

The staged return covers all six servos, skips joints already within +/-9 of
Reference A, previews its complete route, and requires separate Enable and Start.
From the teacher's reported `[2046,2009,1943,2048,2044,2052]`, it plans three shoulder
waypoints and seven elbow waypoints. It uses at most 16 raw units per nominal step,
checks actual readback before sending (maximum 25), waits for settled feedback,
and preserves at least 900 ms between writes. Tests and return share one guarded
writer and cannot overlap. Stop/fault cancels future commands without automatic retry.

This is a bounded teacher commissioning tool, not general calibrated Home or
student live control. Each attempt is consumed before its first write; reload
does not restore it. Teacher recovery now records an explicit review permitting
one more return or selected-joint attempt, with renewed clearance, fresh evidence,
and separate Enable/Send or Start. Original records remain. A pending write, fault
without reconnect, or stale feedback cannot be bypassed. Only the automatic
return remains confined to its historical start region.
Joint targets now freeze at current reading +20 at Enable, with <=5 drift before
Send, and starting windows accept Reference A +/-9. This fixes the mismatch
between the return's arrival readings and historical test starting values. The
9-unit settling tolerance matches the handoff's observed residual error; 16-unit
return steps retain the 25-unit maximum measured command without correction loops.
Numerical bounds are
local commissioning guards, not verified mechanical/collision limits. Physical
clearance, speed, force, and stopping behavior still require teacher validation.
See [exact bounds, targets, failure rules, and operating steps](./JOINT_SUITE_AND_HOME.md).

Verification: 101 unit tests, production TypeScript/Vite build, and 13 mocked
Chrome tests pass for manual positioning, current-pose review, recovery, joint tests, staged return,
simulation, and passive inspection. The assistant has not accessed real hardware. The
existing Blockly bundle-size warning remains; Chromebook performance is unverified.

The teacher confirmed factory All Off releases the arm, All On held a manually
changed pose in that test, Read Pos updates the factory number fields, and our
passive inspector matches the refreshed readings. The earlier readback concern
is resolved for this observation; it is not a general calibration guarantee.

The browser now implements **Enable manual positioning → Release all servos →
Restore servo holding → Confirm holding restored** on the teacher mapping page.
Separate support/clearance and physical-holding confirmations are required.
It uses the factory system command61 All Off/All On through the shared guarded
writer. No position target, reset, torque action on connect/Stop, or automatic
holding restoration is added. Tests/returns/retries remain blocked until manual
setup ends with physical confirmation and new fresh evidence. An interlock saved
before torque writes survives reload and is refreshed at each connection, including
pages opened before a different tab released the arm. Interruption leaves holding
unverified; late writes cannot resume setup. Physical support, cutoff access,
clear pinch areas, and adult supervision remain necessary. The teacher passed the
browser manual-positioning steps through holding confirmation; the assistant has
tested only synthetic USB streams. The revised current-pose flow needs teacher testing.

Local storage adds `nexarm.commissioning.manual-positioning.v1`: a durable holding-
verification interlock and the last50 command/confirmation events with times and
readings. Export includes `manualPositioning`, explicitly labeling torque state
as not measured. No new runtime network requests or dependencies were added.

## What works

- A separate TypeScript/Vite app, leaving root Connection Lab v0.6.1 untouched.
- Six simulated raw joint positions with separate target readings.
- An editable Blockly lesson with When Run clicked, Move virtual joint, and
  Repeat blocks; simulated +/-20 jogging and active-block highlighting.
- An SVG arm illustration with base turn, three bending joints, wrist roll, and
  gripper opening. Scaling is exaggerated for visibility and never used to plan
  physical movement. Reduced-motion preference freezes the drawing until settling
  or Stop while readings continue updating. An explicit Animate arm illustration
  checkbox shows whether animation is enabled and allows a session-only override.
  Reduced-motion users see why a round-trip program can otherwise look motionless.
- A restricted interpreter worker expands validated instructions to at most 100
  movement steps, with nesting/visit limits and a main-thread preparation timeout.
  Main-thread validation and the simulator's duration budget check the resulting
  plan again. Stop terminates preparation and cancels simulation; stale responses
  cannot start a replacement run. No generated JavaScript or eval is used.
- A frozen plan is used for each run; editor interaction is disabled while busy.
  Keyboard number fields edit the same Blockly program; full keyboard structural
  editing and screen-reader Blockly access still need dedicated validation.
- Single-operation ownership, Stop, Reset Simulation, and cancellation of old
  scheduled work. Hiding the page stops the simulated run.
- Input validation, a 100-step ceiling, and a 60-second virtual movement budget.
  Simulation timing and ranges are educational choices, never hardware settings.
- Pure factory-register packet encoding and bounded-buffer streaming decoding,
  exercised by synthetic fixtures. Full versus abbreviated-only checksum results
  are distinguished; only full-checksum exact-structure frames become positions.
- Local bundled assets, no remote runtime dependencies, and a production Content
  Security Policy that disables data connections. No project data is persisted.

The simulation entry does not access USB. A separate teacher inspection page now
supports explicitly requested, read-only serial connection and draft reference
capture/export. It does not access a writer, change modes, send packets, or move
the arm to a reference. See [the calibration plan](./CALIBRATION_PLAN.md) for setup,
limitations, evidence needed, and the approval process before any physical test.

## Teacher review

1. Follow the README's local startup instructions.
2. Predict which joints change during Run program; observe the highlighted blocks
   and illustrated base/arm. Open Program steps and keyboard editing to inspect
   the expanded sequence or edit numeric values without a pointer.
3. Change Repeat from 2 to 3. Run again: the elbow movement should repeat three
   times. Then press Stop partway through another run; values and drawing stop.
4. Reset Simulation. All values return to the virtual starting value 2048.
5. Try a joint's +/-20 controls. Other joints should remain unchanged.
6. Start the example, switch to another tab, and return. It should be stopped.
7. Reload. This preview discards state; there is no save feature yet.

The schematic readings do not model actual geometry, clearance, force, inertia,
or real robot dynamics. Simulation success does not approve a physical route.

## Tooling and privacy inventory

Pinned direct development dependencies: Vite 8.3.5, TypeScript 7.0.2,
Vitest 5.0.5, and Playwright Test 1.64.1. Vite and Vitest declare MIT licenses;
TypeScript and Playwright declare Apache-2.0 licenses. Their upstream license
files remain in installed packages. The committed npm
lockfile fixes transitive versions and integrity values. Review the complete
dependency/license inventory before a student release or adding runtime packages.
Blockly 13.4.0 is now a pinned Apache-2.0 runtime dependency. Its media is copied
from the installed package before dev/build and served locally; sound is disabled.
No CDN is used. Vite may emit its own build helper code. The build currently warns
about the Blockly bundle size (about 200 kB gzip); real Chromebook performance
remains a release check. The production CSP allows inline styles for Blockly's
injected CSS and field positioning, but continues to disallow inline scripts,
eval, and runtime data connections. The worker loads from the same origin.

The production app loads its HTML, CSS, and JavaScript from the same origin.
The mapping page retains the original servo-1 localStorage approval marker
(`nexarm.approval.reference-a-servo1-plus20.2026-10-22`), adds five independent
`nexarm.approval.joint-suite.servoN.positive.2026-10-22` markers, and uses
`nexarm.approval.staged-reference-a.2026-10-22` for the first return. Only attempted
scopes are stored. They contain scope/target/route and attempt time, no student or
USB identifiers, and are never uploaded. New recovery reviews, prior command/result
evidence, and raw readings persist under `nexarm.commissioning.retry-reviews.v1`;
consumed retries use separate original-scope `.retry.UUID` keys. Unused retry
permission is session-only and is revoked by Stop, disconnect, hiding, selection,
or reload. Teacher notes and current full results remain in memory until export,
except result snapshots retained at review; reload loses unsaved observations.
The schema-version-2 export includes history and review records. Do not
clear those markers to repeat movement; a new attempt requires review.
There are no accounts, cookies, analytics, telemetry upload,
project uploads, or external fonts. Hosting still receives normal asset-request
metadata. The local development server uses Vite's local update connection; use
the production build to inspect the shipped network policy.

Unit tests cover encoding, malformed and fragmented packets, weak-checksum
classification, simulated ownership, immutable snapshots, input rejection, and
cancellation. Chrome browser tests cover Run/Stop/Reset, demo completion, the
absence of USB access/runtime data requests in those flows, and viewport fit.
These checks do not replace actual Chromebook, student-account, assistive
technology, or hardware validation.

## Next work

[Factory software findings](./FACTORY_SOFTWARE_FINDINGS.md) provide a candidate
model: the supplied controller contains a URDF, arm meshes, and the 3D viewer's
joint-specific offsets/scales. Use the requested joint-suite observations to
check that hypothesis before representing its display as an accurate live model.
[The earlier servo-2 proposal](./SERVO_2_TEST_PROPOSAL.md) is superseded by the
teacher-requested suite and staged return documented above.

The first supplied reference and two photographs are summarized in
[Reference A review](./REFERENCE_A_REVIEW.md), including the exact proposed
single-axis command, preconditions, and observation/failure plan. The teacher has
approved and completed this first test. Its fixed command, feedback deadline,
and persisted no-repeat guard are retained; the current UI offers only remaining
tests. Follow the review document for the historical scope and recorded result. The teacher
completed the one attempt: servo 1 reported 2051 → 2066 toward target 2068, other
exported channels were unchanged, and a small clockwise movement was observed.
The teacher confirmed servo 1 is the base-turn joint and increasing raw values
rotate it clockwise when viewed directly from above. This establishes a local
mapping/direction, not degrees per raw unit, zero angle, travel limits, or reverse
behavior. The agent has not accessed a real robot. The later staged-return request
covers the bounded return described above, not a repeat of the base mapping test.

Following teacher testing, the approved servo-1 starting window is now 2043–2053
inclusive. The fixed target remains 2068 (a 15–25-unit positive command). Every
sample in the retained observation window must satisfy that range; freshness,
other-joint checks, and consumed-approval persistence remain unchanged.

Expand the small language with capped waits, conditionals, typed variables, functions,
project storage, and keyboard accessibility in reviewable packages. The complete
live arming/fault state machine, feedback supervisor, parser processing deadlines,
robot profiles, commissioning, and physical Stop procedure remain future work.

Prompt for a reasoning-level change before beginning live safety/serial failure
design or movement review. New physical movement remains subject to the teacher's
explicit command and test-plan approval.
