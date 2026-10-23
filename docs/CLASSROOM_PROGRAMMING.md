# Programming development test: dev.31

The user confirms Blockly motion is working after identifying the selected J3
block. Diagnostic export remains available for unexpected behavior. To release,
physically position, and name a measured pose, see [Teach a position](./TEACHING_POSITIONS.md).
That guide also covers Move to position and Blockly sequences of saved positions
with Wait and Repeat. Start with New empty program when using only saved poses.

Operator-provided [operating ranges](./OPERATING_RANGES.md) are checked before
live movement. Stricter protected student policy is deferred. There is no station
setup requirement, student-editable limit panel, or per-program teacher approval.
Protected limits are a required [student-release roadmap item](./ROADMAP.md).
The current build is for development hardware testing.

1. Open `http://127.0.0.1:5173/` and confirm **0.7.0-dev.31**.
2. Build or edit a program. Choose **Simulation** for practice without USB, or
   **Station robot** for hardware testing. Simulation remains the default.
3. In robot mode, click **Connect robot** and wait for Ready. Fresh stable
   feedback makes controls available without a checkbox or Enable. Connect sends
   no movement. If Run is unavailable, the adjacent message explains why.
4. For a first check, load the short practice program: S1 to 2130, then 2050.
   Inspect the starting pose and movement clearance. Use **Robot setup controls**
   for manual positioning/Home if needed. Loading blocks does not reposition
   the robot. Keep the arm secured, gripper empty and physical cutoff accessible.
5. Click **Run program**. Commands use speed 600 / acceleration 10 and wait for
   settled feedback between steps. You can edit and Run again without extra
   confirmation. All program targets are checked against the
   operating ranges before the first move. An invalid saved pose names its
   offending joints; record a replacement rather than forcing or clamping it.
6. Test **Stop** during a run. It cancels subsequent blocks and attempts a hold
   at every commanded joint's measured position. It remains available after a fault
   while USB is connected. After fresh readings stabilize, choose Run to start
   again. There is no automatic return or retry. Software Stop is not a
   certified emergency stop.
7. Test switching to Simulation during a run: robot work is canceled and USB
   disconnected. Reload never reconnects or resumes a program.

Input validation still checks joints 1–6, finite whole-number raw targets within
0–4095, repeat expansion, and program size. That range is an encoding constraint,
not a measured mechanical limit; live goals must also fit each joint's operating
range. A live run is capped at 100 steps (including waits) and 60
seconds; existing feedback, path/deviation, settling and write checks remain.

After release, click Restore servo holding. Once its write completes and fresh
readings stabilize, movement controls become ready without confirmation or Enable.
This is a feedback check, not a physical torque measurement; support the arm
through restoration and check it holds before removing support. Interrupted
release persists across reload and still needs an explicit Restore command.
Uncertain USB write delivery requires disconnect/reconnect before another move.
Old saved station profiles are ignored and are not erased automatically. No
student identity, account, upload, or new storage is required. Programs remain
memory-only and are lost on reload.

Before student release, provision validated robot-specific limits through
protected teacher/admin configuration, without exposing editable limits or a
bypass in the student interface. See ROADMAP.md for enforcement and testing gates.
