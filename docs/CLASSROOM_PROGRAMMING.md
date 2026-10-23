# Programming development test: dev.25

The user confirms Blockly motion is working after identifying the selected J3
block. Diagnostic export remains available for unexpected behavior. To release,
physically position, and name a measured pose, see [Teach a position](./TEACHING_POSITIONS.md).

Station limits are deferred for this development stage. There is no station
setup requirement, student-editable limit panel, or per-program teacher approval.
Protected limits are a required [student-release roadmap item](./ROADMAP.md).
The current build is for development hardware testing.

1. Open `http://127.0.0.1:5173/` and confirm **0.7.0-dev.25**.
2. Build or edit a program. Choose **Simulation** for practice without USB, or
   **Station robot** for hardware testing. Simulation remains the default.
3. In robot mode, click **Connect robot**, check the assigned robot / clear-area
   box, then **Enable robot**. Connecting and enabling send no movement. If Enable
   is unavailable, the adjacent message names the remaining prerequisite.
4. For a first check, load the short practice program: S1 to 2130, then 2050.
   Inspect the starting pose and movement clearance. Use **Robot setup controls**
   for manual positioning/Home if needed. Loading blocks does not reposition
   the robot. Keep the arm secured, gripper empty and physical cutoff accessible.
5. Click **Run program**. Commands use speed 600 / acceleration 10 and wait for
   settled feedback between steps. Successful runs leave the robot enabled so
   you can edit and Run again. There are no saved-limit checks in this build.
6. Test **Stop** during a run. It cancels subsequent blocks and attempts a hold
   at the active joint's measured position. It remains available after a fault
   while USB is connected. Inspect the result, recheck clearance and Enable to
   continue. There is no automatic return or retry. Software Stop is not a
   certified emergency stop.
7. Test switching to Simulation during a run: robot work is canceled and USB
   disconnected. Reload never reconnects, enables, or resumes a program.

Input validation still checks joints 1–6, finite whole-number raw targets within
0–4095, repeat expansion, and program size. That range is an encoding constraint,
not a measured mechanical limit. A live run is capped at 100 movements and 60
seconds; existing feedback, path/deviation, settling and write checks remain.

If holding is unverified, use the separate setup controls to restore/confirm it.
Old saved station profiles are ignored and are not erased automatically. No
student identity, account, upload, or new storage is required. Programs remain
memory-only and are lost on reload.

Before student release, provision validated robot-specific limits through
protected teacher/admin configuration, without exposing editable limits or a
bypass in the student interface. See ROADMAP.md for enforcement and testing gates.
