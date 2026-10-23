# NexArm Classroom development roadmap

Updated 2026-10-23.

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

- Local project saving, export/import, recovery, and deletion without accounts.
- Conditionals, variables, functions, and bounded virtual events. Wait blocks
  are implemented in dev.26.
- Named position capture, direct replay and Blockly pose sequences are available
  for development testing in dev.26. Validate routes/policy and hand-positioning
  procedures before student release. Add pose import/project portability.
- Keyboard accessibility and classroom testing across 10–20 robot stations.
- Measured simulation geometry and XYZ research after hardware calibration.

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
