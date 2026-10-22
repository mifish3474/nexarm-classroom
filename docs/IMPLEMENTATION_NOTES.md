# Simulation and teacher control preview 0.7.0-dev.12

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
