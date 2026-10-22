# Simulation and teacher mapping preview 0.7.0-dev.4

This preview starts architecture packages A/B/C. It is not a complete safety
controller, full programming curriculum, or student live-robot release.

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
The approved mapping page records one localStorage approval-consumption marker
(`nexarm.approval.reference-a-servo1-plus20.2026-10-22`) containing scope, target,
and attempt timestamp. It contains no student/USB identifiers and is not uploaded.
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

[Factory software findings](./FACTORY_SOFTWARE_FINDINGS.md) provide the next
non-motion route: the supplied controller contains a URDF, arm meshes, and the
3D viewer's joint-specific offsets/scales. Build and validate a simulation-only
candidate model from those facts before resuming physical mapping tests.
[Servo 2 mapping proposal](./SERVO_2_TEST_PROPOSAL.md) is deferred, remains
unapproved, and is not implemented. The base stays where it is.

The first supplied reference and two photographs are summarized in
[Reference A review](./REFERENCE_A_REVIEW.md), including the exact proposed
single-axis command, preconditions, and observation/failure plan. The teacher has
approved this one test; `/mapping.html` implements its fixed single command,
explicit Enable/Send, feedback deadline, and persisted no-repeat guard. Follow
the review document for the teacher test sequence and recorded result. The teacher
completed the one attempt: servo 1 reported 2051 → 2066 toward target 2068, other
exported channels were unchanged, and a small clockwise movement was observed.
The teacher confirmed servo 1 is the base-turn joint and increasing raw values
rotate it clockwise when viewed directly from above. This establishes a local
mapping/direction, not degrees per raw unit, zero angle, travel limits, or reverse
behavior. The agent has not accessed a real robot; no repeat or reverse movement
is authorized.

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
