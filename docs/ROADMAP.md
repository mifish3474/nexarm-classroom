# NexArm Classroom development roadmap

Updated 2026-10-23.

The current build is for development hardware testing. The product owner has
deferred station limits so they do not block Run during this stage. Student
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
  source, including Blockly, manual movement, Home, and future saved-pose replay.
  Students still Connect/Enable per session and run independently within policy.
- Make missing, invalid, stale, or incompatible protected policy block live
  movement in the student release. Keep simulation available. Do not reuse the
  development exception as a student-facing toggle or silent fallback.
- Treat old `nexarm.classroom-profile.v1` browser records as untrusted legacy
  data, not reviewed policy. Plan migration or deletion in the administrator flow.
- Test unauthorized edits, project imports, numeric boundaries, profile changes
  during runs, cancellation, reconnect, and managed student-account behavior.
- Validate clearance, stopping behavior, anchoring, pinch-zone procedures and
  account permissions on the actual classroom robots before student acceptance.
- Validate the hand-positioning support, release, restore and interruption
  procedure for student use. Recording is implemented for development; arm weight
  support and pinch-zone training remain physical classroom-release requirements.

## Programming and classroom usability

- Local project saving, export/import, recovery, and deletion without accounts.
- Wait blocks, conditionals, variables, functions, and bounded virtual events.
- Named position capture is implemented in dev.25; add Blockly pose references
  and replay after route/policy validation. Add pose import/project portability.
- Keyboard accessibility and classroom testing across 10–20 robot stations.
- Measured simulation geometry and XYZ research after hardware calibration.

## Current development controls retained

Explicit Connect/Enable, one shared writer and exclusive USB lease, bounded
instruction expansion, servo ID/numeric/encoding checks, speed 600 and
acceleration 10 for programs, feedback path/settling/deadline supervision, Stop,
60-second/100-movement budgets, cancellation on mode/visibility/connection
changes, and the existing holding recovery interlock. Station limits are not
enforced in the current development build.
