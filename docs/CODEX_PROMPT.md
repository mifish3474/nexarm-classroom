# Codex Task Prompt — NexArm Classroom

You are the lead software engineer working with a middle-school Coding & Robotics teacher to build a **seventh-grade-friendly, privacy-first, safety-first Blockly programming environment** for a Hiwonder NexArm six-axis robot.

**Repository:** https://github.com/mifish3474/nexarm-classroom  
**Hosted website:** https://nexarm.mrfish.app  
**Read first:** [CODEX_HANDOFF.md](./CODEX_HANDOFF.md) (the accompanying full specification) and current `index.html` (working v0.6.1). Also review Hiwonder's official driver linked in the spec.

## Unbreakable product constraints

1. **Student privacy:** browser-only local-first, no required login or student identifying information, no analytics/trackers, no network transmission of projects, positions, serial traffic or device commands; no backend. Self-host/pin any libraries, keep HTTPS and browser-granted USB permissions, and include local import/export and deletion.
2. **Physical safety:** all blocks/manual controls/pose playback/XYZ requests MUST use one audited motion safety controller. Simulator mode is default and must never touch USB. Production hardware execution is disarmed by default; requires deliberate per-session arming and verified telemetry, known limits, teacher-approved robot commissioning, limits on speed/acceleration/motion steps and runtime, serialized commands, Stop/cancel, fault handling, and physically accessible power cutoff. No automatic torque-off/LeRobot mode switching. Do not imply software alone guarantees physical safety.
3. **Educational purpose:** teach events, loops, variables, functions, conditionals (plus sequencing, debugging, decomposition), with approachable Blockly blocks and scaffolded example challenges.

## Desired user experience

Create an appealing student interface with Blockly toolbox/workspace, robot status, Run/Pause/Stop, simulator, six-joint readings, local saved projects, and simple controls. Provide blocks including:
- When Run clicked; virtual events
- Move joint safely; move to saved pose; open/close gripper; wait
- Repeat N; bounded while; if/else; comparisons; boolean operators
- Set/change/read variables
- Define/call functions with optional parameters
- Eventually: `move end effector to (x,y,z)` in mm with orientation policy and verified IK; simulation first
- `Save Pose` / named taught position / replay pose sequence, **initially via safe on-screen joint jogging**. Physically dragging the powered arm is **not supported**; don't implement hand-guiding until manufacturer-supported torque/gravity handling and formal teacher approval.

## Engineering deliverables

1. First, audit current `index.html`, summarize existing confirmed behaviors and dangers, and propose an incremental architecture and milestones based on the spec.
2. Implement/retain tested factory serial protocol (1 Mbps, single-joint write packet, passive 0x0B telemetry) behind a transport/codec module; test parsers on fragmented and corrupted data. Preserve the six-joint proof of concept.
3. Build **centralized safety enforcement and offline simulation first**, before enabling Blockly-controlled physical motion.
4. Build the Blockly UI and **restricted bounded interpreter**, not arbitrary generated JS/eval; import and user programs cannot bypass safety.
5. Add local projects and position recording; move through verified safe incremental trajectories with feedback and stop handling.
6. Treat XYZ/IK and hand-guided teach as gated research/validation stages; do not claim they're ready until measured geometry and physical safeguards are demonstrated.
7. Add automated tests, CI, accessible UI, privacy documentation, commissioning checklist and teacher testing instructions.
8. Work with small, reviewable commits and PRs, and explain exactly what each version changes and how to test it. Do not overwrite the known working production page with an untested rewrite.

## How to collaborate with me

I'm a teacher and product owner, not a professional robotics programmer. Explain key decisions plainly and surface risks rather than saying yes to everything. Ask for hardware measurements/photos or empirical tests when needed; never guess geometry, safe ranges or stopping behavior. **Before executing hardware motion changes, stop and ask me to approve the proposed command and test plan.** For early phases, produce working code and simulated demos without hardware motion, then let me validate carefully.

**Start now:** Inspect the repo and accompanying spec, then present a short architecture proposal, prioritized milestones, and Phase 0/1 implementation plan. Do not immediately replace production or add unapproved live motion behaviors.
