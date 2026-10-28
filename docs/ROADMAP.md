# NexArm Classroom development roadmap

Updated 2026-10-28.

## Current safety usability step

Dev.51 adds the signal tower and dedicated Space stop using the existing
position-hold Stop. Space is retired as a programmable event; old hats load
for explicit reassignment. Validate physical stopping on the existing motion
profiles before advancing. Automatic stop-then-release remains a separate
investigation; no release is introduced by Space/Stop in dev.51. Functions/My
Blocks follow this safety work. Browser controls remain dependent on focus,
responsiveness and USB; a physical cutoff is part of the classroom procedure.

## Current scope: joints and named positions on factory firmware

Dev.47 removes XYZ blocks and coordinate execution. Core learning uses joint
positions, named six-joint poses, sequencing, Wait and Repeat. Dev.49 adds numeric
variables, math, comparisons, if/else and offline Check program. Functions/My
Blocks remain the next language phase. Old XYZ files
are rejected without replacing the current workspace or sending commands.

Only unmodified factory firmware is supported. Do not develop, install or rely
on custom ESP32 or AT32 firmware. The completed observer experiment is historical;
the original application was restored. Fault protection can use only evidenced
factory capabilities; reliable pinch protection remains unverified. No coordinate
or custom-firmware research is a dependency for the classroom programming path.

Earlier XYZ development notes below are historical, not active milestones.

Dev.41 adds the operator-approved Home-first Run sequence: validate all
destinations, return Home with the existing timed-joint executor, check fresh
readings near Home, then run blocks. No movement on Connect/Load. Validate the
return route from expected station starting poses; Home is not a clearance model
or hardware calibration. Invalid XYZ goals still fail before any return.

Dev.40 replaces direct native XYZ execution with calculation-only requests,
all-program joint-target validation and the existing timed-pose joint executor.
Direct command 8 remains blocked. Verify installed firmware calculation replies
on hardware; no unsupported-firmware fallback is provided. Individual joint
limits cannot guarantee link clearance or zero overshoot. Investigate valid-angle
combinations, J3 continuity, reference/scaling, and physical stopping before
student release. Do not reproduce the earlier hazardous route or restrain a joint.

The current build is for development hardware testing. The product owner has
deferred protected student station policy during this stage. Operator-provided
development operating ranges now reject invalid movement goals; see
[the current ranges](./OPERATING_RANGES.md). No stricter student margins are
implemented. Student
groups will iterate independently; there will be no per-program teacher approval.

## Required before student release: protected robot limits

- Establish measured, robot-specific joint ranges, gripper restrictions, speed
  and acceleration caps, and permitted movement combinations and workspace paths.
  Encoder values 0–4095 and a Home-centered window are not mechanical limits.
- Provision these settings through a separate teacher/administrator workflow.
  Students must not be able to edit, replace, import over, disable, or widen the
  active safety policy through the programming interface or a project file.
- Choose and validate the protection/enforcement model. Hiding a settings panel
  or storing an editable browser value does not provide administrator protection.
  Define robot/profile matching and checks after reconnects or hardware changes.
- Enforce the active policy inside the shared motion gateway for every movement
  source, including Blockly, manual movement, Home, and saved-pose replay.
  Students Connect per session and run independently within policy, without
  per-run teacher approvals or repeated confirmation/Enable controls.
- Validate joint combinations, saved-position transitions, tracking and Stop
  response on factory firmware. Coordinate execution remains removed.
- Make missing, invalid, stale, or incompatible protected policy block live
  movement in the student release. Keep simulation available. Do not reuse the
  development exception as a student-facing toggle or silent fallback.
- Treat old `nexarm.classroom-profile.v1` browser records as untrusted legacy
  data, not reviewed policy. Plan migration or deletion in the administrator flow.
- Test unauthorized edits, project imports, numeric boundaries, profile changes
  during runs, cancellation, reconnect, and managed student-account behavior.
- Validate clearance, stopping behavior, anchoring, pinch-zone procedures and
  account permissions on the actual classroom robots before student acceptance.
- Validate feedback fault criteria for overlapping timed frames, reversals,
  overshoot and continued travel while targets are being sent. A frame's raw
  start/target interval is not a physical path model. Dev.36 logs that comparison
  without aborting timed poses; student-release motion supervision still needs
  measured limits and hardware acceptance.
- Validate the hand-positioning support, release, restore and interruption
  procedure for student use. Recording is implemented for development; arm weight
  support and pinch-zone training remain physical classroom-release requirements.

## Programming and classroom usability

- Dev.40 implements local program JSON save/load with self-contained pose
  snapshots and no accounts. Add autosave/recovery and broader project management.
- Dev.49 implements numeric variables, arithmetic/rounding, numeric comparisons,
  boolean logic, if/else/else-if and bounded preparation before movement. Check
  program evaluates without USB and reports final, non-live variable values.
  Format-2 program files preserve expressions/branches and load legacy format 1.
- Next language phase: functions/My Blocks, then parameters. Live sensor-driven
  conditions, while/forever loops and virtual events remain separate decisions.
- Dev.50 adds explicit Run/Stop-scoped keyboard event hats, using independent
  fresh evaluations and one sequence at a time. Format 3 retains event stacks.
  Shared persistent event variables and concurrent scripts remain out of scope.
- Named position capture, direct replay and Blockly pose sequences are available
  for development testing in dev.26. Validate routes/policy and hand-positioning
  procedures before student release. Add pose import/project portability.
- Keyboard accessibility and classroom testing across 10–20 robot stations.
- Dev.40 retains the passive LCD readout and replaces native XYZ moves with
  calculated, range-checked joint poses. Verify USB calculation support, units,
  physical endpoints and Stop. Coordinate preview/simulation remain deferred.
  The Station robot is the default/only current view; the virtual frame is hidden.

## Current development controls retained

Explicit Connect and deliberate Run/manual actions, automatic readiness from
fresh stable feedback, one shared writer and exclusive USB lease, bounded
instruction expansion, servo ID/numeric/encoding checks, speed up to 600 and
acceleration 10 for program poses, feedback freshness/write-deadline supervision, Stop,
60-second/100-movement budgets, cancellation on mode/visibility/connection
changes, and a durable interrupted-release record cleared by explicit Restore
and fresh stable feedback. Position feedback does not measure holding power.
Timed Home/saved poses advance on frame time; endpoint-path comparisons are
diagnostic-only in dev.36. Explicit individual-joint controls retain their
existing path/settling checks.
Station limits are not
enforced as protected policy in the current development build. Fixed development
operating ranges are enforced for targets through the current motion controller.
Coordinate execution is retired. Calculated joint/pose targets from variables and
conditions use these same ranges and profiles after bounded preparation, before
Home or block 1. See VARIABLES_AND_LOGIC.md for current programming semantics.
