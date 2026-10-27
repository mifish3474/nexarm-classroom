# NexArm Classroom development roadmap

Updated 2026-10-26.

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
- Validate the dev.40 calculation-only coordinate path: solver reachability,
  branch selection, valid joint combinations, actual tracking and Stop/obstruction
  response. Commanded targets now obey the raw-joint bounds and 600/10 profile;
  direct native-command bypass remains blocked.
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
- Conditionals, variables, functions, and bounded virtual events. Wait blocks
  are implemented in dev.26.
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
Coordinate blocks now use the same target ranges and timed-pose profile after
calculation-only preflight. See COORDINATE_PROGRAMMING.md for guarantees and limits.
