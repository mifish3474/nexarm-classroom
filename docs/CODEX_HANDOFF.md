# NexArm Classroom — Technical Specification and Codex Handoff

**Project:** NexArm Classroom  
**Owner/context:** Middle-school (7th-grade) Coding & Robotics classroom  
**Production URL:** https://nexarm.mrfish.app  
**Repository:** https://github.com/mifish3474/nexarm-classroom  
**Baseline:** Working proof of concept v0.6.1 (2026-10-21)  
**Audience:** Codex acting as a careful engineering partner; teacher is product owner and tester.

## 0. Product mission and priority order

Create a friendly, polished, accessible, browser-based **block-programming environment** for the Hiwonder NexArm six-axis robot arm, running on Windows Chrome and student Chromebooks. The target experience is VEXcode-like in approachability, but purpose-built for seventh graders.

**Non-negotiable priority order:**
1. **Student physical safety and privacy.** A feature that conflicts with either must be omitted or disabled.
2. **Reliability, recoverability, and classroom simplicity.**
3. **Education:** meaningful use of events, loops, variables, functions, and conditionals.
4. **Capability and visual polish** (including inverse kinematics / XYZ moves, teaching paths) only when proven safe.

A browser-only software safeguard cannot guarantee physical safety. The hardware power switch, mechanical clearance, supervision, and fail-safe hardware design remain necessary. Do not represent a software Stop button as a certified emergency stop.

## 1. Verified hardware and software findings

### Equipment
- Hiwonder **basic NexArm**, ESP32-based controller, unmodified factory firmware (not the optional camera/AI package).
- USB serial port detected on Chromebook as `ttyserialUsb0`; Windows Chrome also works.
- Web Serial connection operates at **1,000,000 baud** (115,200 showed garbled data).
- Browser requires HTTPS (or localhost); GitHub Pages + custom domain via Cloudflare DNS-only CNAME.
- The arm's servos **hold position while powered**; users must not force them by hand.
- Original manufacturer software can command servo positions and was used to compare feedback.

### Verified in our classroom testing
- Browser opened serial connection on Chromebook (teacher account) and Windows desktop. **A genuine student account has NOT yet been tested**, and district policy may differ.
- Site passively receives repeating framed data and successfully decodes six changing servo values.
- Sending individual servo position commands from our own browser page caused **all six joints to physically move** (tested by teacher, both directions; website displayed updated measured values).
- Single-servo movement with ±20 raw position increments worked smoothly.
- Actual measured positions can settle about **5–9 raw units** away from commanded target; do not chase tiny residual errors forever.
- Positions seen after commanding all servos near 2720: ~2705, 2724, 2720, 2720, 2718, 2716.
- After reset and commanding servo 1 to 2500, candidate 1 was ~2486; commanding only servo 2 to 2500 then gave candidate 2 ~2499 while the others remained effectively unchanged. Evidence strongly supports index-to-servo mapping.
- Factory firmware did **not** respond to a LeRobot command-96 read request within 2 seconds. This does **not** block passive position telemetry. Do not assume LeRobot bridge mode is enabled, nor switch modes automatically.

### Existing deployed application (v0.6.1)
Single-file `index.html`: USB connect/listen; 1 Mbps; binary/hex diagnostic log; passive packet inspection; six live readings; six independent ±20 buttons; dynamically set ±100 raw-unit **test window** around each servo's initial reading; 900 ms minimum separation between movement commands; read-only experimental LeRobot request that times out under factory firmware. Connection crash from a shadowed `positions` variable was fixed in v0.6.1. **Study the code before refactoring and preserve working serial behavior.**

This proof-of-concept is NOT yet safe to deploy to students. Its ±100 relative window is not an anatomical, collision, or workspace safety limit; it has no reliable run-stop mechanism, no trajectory planner, and no classroom permissions verification.

## 2. Communication protocol — observed and source-backed

Source: Hiwonder official LeRobot NexArm driver:  
https://github.com/Hiwonder-official/lerobot-nexarm/blob/main/src/lerobot/motors/nexarm/nexarm.py

Custom framing used in that driver:
`FF FF [device_id] [length] [command] [args ...] [checksum]`
- `length = args.length + 2`
- `checksum = (~sum([device_id,length,command,...args])) & 0xFF`
- The official parser accommodates an abbreviated checksum bug in some firmware; do not simply accept arbitrary bytes.
- Values generally are little-endian; verify each payload's layout independently.

**Factory firmware / currently proven movement command (already implemented in index.html):**
- Per-servo write of goal position using servo ID **1–6**, command `03`, register `2A` (decimal 42).
- Bytes: `FF FF [id] 05 03 2A [position_low] [position_high] [checksum]`.
- `position` is a raw servo value; nominal advertised scale is **0–4095**. THIS IS NOT A SAFE RANGE FOR EVERY JOINT. Joint-specific limits must be established before production.
- Example only: command formatting is in the existing `moveServo()` implementation. Make the verified packet encoder a tested pure function.

**Passive data protocol (observed and experimentally cross-checked):**
- Repeated packets with `FF FF FF 1A 0B` header.
- Parser validates frame length and checksum.
- `length = 0x1A`; 24 payload bytes.
- The **last 12 payload bytes**, parsed as six little-endian uint16 values, reflect the actual six servo positions. Tested against manufacturer-commanded movements. Command identifier `0x0B` is an observed packet type; semantic details of other payload fields are still unknown.
- Parser must tolerate arbitrary chunk boundaries, repeated frames, extraneous bytes, corrupt frames, and disconnections. Extract six values only from validated packets with the expected structure.

**LeRobot bridge mode (NOT established for factory setup):**
- Official driver lists command 68 mode toggle, 96 six-position read, 97 six-position write, 98 torque control. Those are for a bridge-mode workflow and are **not interchangeable with the proven factory register-write path**. Never enable/toggle mode or torque automatically.
- Current v0.6.1 includes an experimental `CMD 96` request that timed out. Remove or quarantine the confusing button from the student-facing UI.

**Physical joint labels:** Existing UI proposes Base, Shoulder, Elbow, Wrist pitch, Wrist roll, Gripper corresponding to IDs 1–6. Confirm actual physical naming/direction through deliberate one-joint tests; do not claim full mechanical calibration is complete.

## 3. Mandatory privacy architecture

- Default **local-first**: program workspaces, named positions, calibrations, and settings live on the device/browser. Make **Export JSON** and **Import JSON** available for portability.
- No student account required, no email, student ID, name, school identifier, or age collected. Do not introduce sign-in, analytics, advertising, trackers, third-party telemetry, cookies for tracking, or server-side student data storage.
- Keep robot commands, raw serial bytes, motion history, and projects **on the local device**. No uploads, remote control, cloud inference, logging to external endpoints, or broadcasting over classroom network.
- Host static assets on GitHub Pages via HTTPS. Bundle and self-host Blockly and other dependencies under vetted/pinned versions; avoid third-party CDNs/runtime network calls. Audit packages, supply-chain risks, licenses, and Content Security Policy constraints before release.
- Web Serial use must require **direct browser user gesture and device consent**. Never auto-connect or silently reconnect and never begin motion on connection or page load.
- No remote firmware flashing or arbitrary scripting of the USB port exposed to students.
- Local storage is not guaranteed on school-managed Chromebooks. Design clear save status and export flow. Account for school data-retention rules; don't claim local storage is inherently private against device administrators.
- For classroom privacy assurance, document network requests, browser permissions, third-party dependencies and storage; provide teacher-readable privacy statement and deletion/reset control. Validate on actual student accounts and district policies.

## 4. Mandatory physical-safety architecture

All motion sources (manual jog, Blockly execution, replay, saved pose, Cartesian/XYZ, home) MUST call **one centralized guarded motion executor**. Blockly-generated JavaScript or user-imported JSON must never get unchecked direct access to the serial writer.

**Preconditions before enabling motion:**
- USB connection active; validated continuous telemetry; identified supported factory protocol; fresh position data (e.g., <500 ms, configurable after empirical measurement); exactly one active controller; initialized/calibrated joint limits; physically clear workspace; user has explicitly armed a session with adult/teacher guidance.
- Default state: **motion disabled**. Require explicit per-session Enable Motion. Mode switches, reboots, reconnects, page refresh, serial loss, tab backgrounding, and Stop events return to disarmed state.
- For new uncalibrated robots, provide **teacher-only commissioning mode** with ultra-small single-axis moves, never automatic multi-axis execution.

**Hard checks for every command/trajectory segment:**
- Servo ID whitelist (1–6); proper framing/checksum; numeric finite inputs; integer position conversion; **verified, robot-specific per-joint hard limits**; soft limits; velocity/acceleration limits; rate limit; single-writer serialized command queue; enforced timeouts.
- No direct jump to distant joint targets; plan bounded incremental trajectories; read back actual positions and compare to expected within a configurable tolerance, accounting for the observed 5–9-unit steady-state difference. On excessive deviation/stall, **abort further motion**, surface an error, require operator review. Never continuously correct small errors.
- Minimum workspace clearances, obstacle boundaries, self-collision constraints, and singularity checks where applicable. A Cartesian destination alone being in workspace is **not** proof of collision-free path; validate intermediate trajectories.
- Gripper needs special limits and considerations for pinching. Keep hands, hair, cords, and fragile objects clear.
- Prevent accidental repeat runs and conflicting motion from overlapping timers, events, loops, and clicks. Queue operations, max program runtime/steps/motion count and bounded loops; graceful cancellation.
- **Stop / Abort** prominently available during execution and keyboard-accessible. Immediately cancel queued/future commands; implement a conservative, tested stop/hold mechanism for the actual hardware. Never assume disconnect or torque-off safely stops an active or falling arm. If the firmware cannot provide a proven physical immediate stop, clearly document limitation, restrict unattended use, and require accessible **physical power cutoff**.
- On tab close/navigation, page hidden, stale telemetry, browser error, USB disconnect, or power fault: software must stop scheduling further commands, disarm, and require reconnection + user confirmation. A browser cannot guarantee control after losing connection.
- No automatic torque disable for hand guiding: powered joints resist movement, and disabling torque can allow the arm to fall. Hand-guided teaching must remain disabled until manufacturer-compatible gravity/support/torque procedure is researched, safely implemented, and approved.
- No implied "safe" from generic 0–4095 range or ±100 start window. Establish safe joint/pose profiles using mechanical documentation and supervised experiments before broad student use.
- Provide a conspicuous **simulator / offline mode** for student development with **no serial access** by default.

**Teacher commissioning checklist / release gate:** Document emergency physical cutoff, base anchoring, reachable workspace, pinch-zone training, maximum payload, cable routing, neutral/home pose, validated joint limits, trajectory speed, gripper limits, failure tests, and adult supervision. No student release until explicit teacher acceptance.

## 5. Educational learning experience

### UI goals
- Clean, friendly, responsive; readable on small Chromebooks; accessible keyboard interactions and ARIA.
- Two modes: **Learn/Simulate** (default, no hardware), **Live Robot** (explicit permission/arming).
- Three primary panes: **Blockly toolbox**, **program workspace**, **Robot status/preview** (optionally live actual/target joint readings). Big Run, Pause, Stop, Reset Simulation; prominent Connected/Armed/Running/Stopped/Fault status.
- Make student terminology intuitive; provide expandable advanced controls instead of overwhelming debug screens.
- Position names like `Pickup`, `Dropoff`, `Home`; clear progress and errors; sample challenge programs.
- Blockly is a library for constructing programs; implementation should use a **restricted structured AST / interpreter** feeding a validated command dispatcher, not `eval`/unbounded generated JavaScript.

### CS concepts and block families
- **Events:** `when Run clicked`, `when program starts`, `when button pressed` (virtual UI button), optional `when robot arrives` implemented without recursive uncontrolled triggers.
- **Sequence:** move to named pose, move single joint within safe range, open/close gripper to known safe positions, wait until motion settled, wait duration (capped).
- **Loops:** repeat N times, bounded while until condition; runtime iteration ceilings and execution timeouts.
- **Variables:** create/set/change/report local numeric, boolean, and text variables with type checking.
- **Conditionals:** if/else, comparisons, Boolean operators; `if at position (within tolerance)`, `if gripper open` only if grounded in feedback.
- **Functions:** define/call functions with optional typed parameters; bounded recursion/stack (default disallow recursion).
- **Coordinate goals (advanced):** `move end effector to X, Y, Z` with selectable tool orientation and speed; require calibrated forward/inverse kinematics and safe path validation (see §7).
- **Teach-by-demonstration:** record named poses; run sequence of saved poses. See §8 for safe distinctions.
- Connections to pedagogy: predict/simulate/run/observe/debug, event-driven behaviors, decomposition, repetition, and state; scaffolded lessons.

## 6. Architecture and module boundaries

Suggested TypeScript/Vite or equivalent static build deployable to GitHub Pages, retaining the production domain; avoid a backend. Break the single HTML prototype into:
- `serial/WebSerialTransport`: browser consent/connect/disconnect, streams, exact baud settings, errors. No knowledge of Blockly.
- `protocol/NexArmCodec`: factory packet encoding, streaming frame parser, telemetry decoding, integrity verification, fixtures.
- `robot/RobotState`: timestamped observed positions, target positions, connection state, fault state.
- `safety/SafetyController`: exclusive command gateway, motion arming, limits, heartbeat/freshness, trajectory planning, stop/cancel, collision/workspace limits.
- `robot/CalibrationProfile`: physical joint IDs, direction, safe min/max, neutral pose, speed/acceleration caps, robot-specific versioned data; never silently import untrusted safety profiles.
- `runtime/BlockInterpreter`: Blockly AST to bounded safe operations, interruptible execution, loops/functions/variables/events.
- `simulation/RobotSimulator`: no USB; minimal joint-state visualizer first, 3D visualization later only if accuracy is adequate.
- `projects/LocalProjectStore`: browser local save, import/export schema and validation; explicit user choice.
- `ui/`: accessible user/student/teacher screens.

**Safety boundary:** No Blockly block, UI component, file import, or simulator may invoke raw serial writes. Only the safety-controlled dispatcher may send motion packets. Production does not expose arbitrary command bytes to students. Keep debug tools teacher-only, never falsely assume client-side access controls are tamper-proof security.

## 7. XYZ Cartesian movement — desired, but conditional

Goal: block **Move tool to (x, y, z)** in millimeters (coordinate frame explicitly displayed); optionally specify gripper/tool orientation. This is an **engineering workstream, not currently implemented or proven**.

Required milestones:
1. Obtain accurate NexArm dimensions, joint-axis definitions, zero offsets, linkage geometry, tool center point, and real joint limits; define base/world frame (e.g., X forward, Y lateral, Z up; origin at measured base center).
2. Implement and unit-test **forward kinematics (FK)**: joint vector → tool XYZ/orientation.
3. Implement **inverse kinematics (IK)**: XYZ(+orientation) → validated feasible joint solutions; deal with multiple solutions, singularities, and unreachable targets; prefer solutions near current configuration and safe joint limits.
4. Validate against the physical arm at supervised calibration points. No hardware XYZ button until validation passes.
5. Interpolate trajectories with velocity/acceleration constraints, self-collision and obstacle checks, and continuous feedback supervision. Disallow paths crossing forbidden areas.
6. Provide **simulation-first** `move to XYZ` block; live functionality feature-flagged and teacher-approved only after verification. A 3-coordinate goal does not completely determine six-joint pose; orientation must be fixed, explicitly selected, or otherwise constrained.

Do not fake XYZ movement by arbitrarily mapping XYZ numbers to raw servo positions. If geometry cannot be verified, preserve only the simulation and label the live feature **unavailable**.

## 8. Teaching / recording positions — two separate approaches

**Phase A (recommended first): "Teach by Jogging"**
- With servos powered and holding, use safe on-screen **jog controls** one joint at a time to position the arm. Click **Save Pose** to capture the **measured six-joint vector** and optional computed XYZ from verified FK.
- Name poses; edit/rename/delete; preview poses and proposed safe route; insert Blockly block `move to saved pose [Pickup]`.
- Build sequences from saved poses with controlled transitions, wait-until-settled/tolerance, and bounded replay. Export/import locally.
- Start playback only after a simulation + preflight check; use rate-limited waypoints instead of instant jumps.

**Phase B (possible later): "Hand-guided teaching"**
- Teacher physically repositions the arm by hand, records waypoints, and replays. **Not currently safe/feasible with powered, resisting servos**. Manufacturer documentation and real safety testing must establish whether compliant/torque-off modes are supported and how arm weight is supported. Torque-off can cause gravity drops.
- Keep this feature **out of student live UI** until approved. Never direct students to force the powered arm.
- If validated, require supervised hand-guiding workflow, supported arm, guards, explicit warning, and restoration of safe servo holding before replay.

## 9. Implementation phases and acceptance tests

**Phase 0 — Stabilize existing working baseline**
- Preserve deployed v0.6.1; introduce tests for factory packet write, telemetry frame parsing, malformed data, serial disconnects, and the previously fixed shadow-variable crash.
- Fix existing inaccurate wording (site currently says no movement commands in some old copy); separate experimental LeRobot diagnostics from student screen.
- Create clear README, design doc, compatibility matrix. Do not break production; use feature branches/PRs and teacher review.

**Phase 1 — Safety foundation & simulator**
- Centralized guarded motion service, explicit arming, safe fault states, Stop/cancel, timeouts, teacher-configured absolute joint limits. Simulator default, no serial commands. No student hardware release until commissioning.
- Acceptance: invalid/NaN/overflow target rejected; malformed packet ignored; Stop halts new writes/queued actions; stale telemetry disarms; disconnection disarms; imported project cannot bypass safety; one writer only; browser reload never moves arm.

**Phase 2 — Safe manual jog and pose saving**
- One-joint jog and measured position readback, named pose store, local import/export, validated move-to-pose (stepwise trajectory, not direct teleport).
- Acceptance: six servos individually controlled; measured/target separately displayed; speed limits; positional tolerance configurable; bounded retry/no runaway corrections; safe cancellation.

**Phase 3 — Blockly core and educational lessons**
- Integrate Blockly offline, restricted AST interpreter; events, sequencing, repeat, if/else, variables, functions; bounded run. Sample school-appropriate challenges.
- Acceptance: deterministic tests in simulator; executing 10,000-step loop halts safely; corrupt/edited Blockly JSON cannot access serial commands or unrestricted JS; keyboard accessibility; Chromebook performance.

**Phase 4 — XYZ & simulator visualization**
- FK and IK calibration, validated workspace, trajectories; simulator-first. Hardware release explicitly gated.
- Acceptance: FK/IK round-trip within defined tolerances across verified safe points; unreachable/singular requests rejected with plain-English feedback; obstacle/path tests.

**Phase 5 — Optional hand-guided teach**
- Only after manufacturer-specific procedure and supervised physical-risk validation. Otherwise remain excluded.

**Phase 6 — Student-account pilot**
- Confirm Web Serial permission with a real district student account; no trackers or network data egress; local save/export on managed Chromebook; tested physical e-stop/power access; teacher-supervised pilot; document limitations and training.

## 10. Engineering quality, testing, and delivery rules

- TypeScript strict mode recommended; unit tests (Vitest or equivalent) for codec, IK, safety, runtime; simulated USB interface/integration tests; Playwright UI tests including no-permission/disconnected scenarios. CI builds and tests on pull requests.
- No production dependencies that require external network access at runtime; static hosting and pinned dependency audits. Ship README, student privacy statement, user/teacher operating guide, safety commissioning checklist, technical architecture, lessons/sample blocks.
- Test packet examples against saved **sanitized** fixtures (never include student identifiers). Report known hardware assumptions and evidence vs inference.
- Preserve backward compatibility with v0.6.1 where practical. Do NOT reset servo position, release torque, switch firmware modes, or move the arm simply by opening the site.
- Document version numbers and release notes. Keep USB access in browser and project data local.
- **Teacher approval checkpoint before any new hardware movement behavior**: explain exact command, constraints, failure modes and test plan. Never deploy unreviewed motion-control changes silently.

## 11. Sources and known uncertainties

Primary repositories:
- Working code: https://github.com/mifish3474/nexarm-classroom/blob/main/index.html
- Official Hiwonder LeRobot bus: https://github.com/Hiwonder-official/lerobot-nexarm/blob/main/src/lerobot/motors/nexarm/nexarm.py
- Official Hiwonder follower class: https://github.com/Hiwonder-official/lerobot-nexarm/blob/main/src/lerobot/robots/nexarm_follower/nexarm_follower.py

**Known unknowns:**
- Mechanical per-joint limits, safe collision envelope, payload/gripper force, tool frame and exact link geometry.
- True device-side stopping behavior and whether browser disconnect leaves motion running.
- Student-account Web Serial entitlement on managed district Chromebooks.
- Whether there is a manufacturer-approved, physically safe hand-guided teaching mode.
- Actual accuracy/repeatability under classroom loads and whether servos report actual shaft positions or some internally filtered estimate.
- XYZ IK/trajectory constraints, hardware calibration, and safe operating speed.

Do not erase these uncertainties by treating implementation assumptions as verified facts.
