# Programming development test: dev.41

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

1. Open `http://127.0.0.1:5173/` and confirm **0.7.0-dev.41**.
2. Build or edit a program. Station robot is the default/only visible view.
   The simulator and virtual-arm frame are hidden for now. Editing needs no USB.
3. In robot mode, click **Connect robot** and wait for Ready. Fresh stable
   feedback makes controls available without a checkbox or Enable. Connect sends
   no movement. If Run is unavailable, the adjacent message explains why.
4. For a first check, load the short practice program: S1 to 2130, then 2050.
   Inspect the starting pose and movement clearance. Use **Robot setup controls**
   for manual positioning/Home if needed. Loading blocks does not reposition
   the robot. Keep the arm secured, gripper empty and physical cutoff accessible.
5. Click **Run program**. The app first validates all destinations, returns to
   Home `[2050,2150,2100,2200,2000,1080]`, then starts the blocks. Already within
   40 raw units on every joint skips the redundant return. Home uses the tested
   all-joint profile (speed up to 600 / acceleration 10); the status identifies
   this stage. If Home readings remain outside tolerance two seconds after frame
   time, the program faults without starting blocks or retrying. Check clearance
   for the return as well as the program. Individual joint blocks use speed 600 / acceleration 10
   and wait for settled feedback. Saved-position blocks use calculated speeds up
   to 600 / acceleration 10 and advance when their planned frame time elapses;
   exact arrival is not verified. Add Wait for an extra pause. You can edit and Run again without extra
   confirmation. All program targets are checked against the
   operating ranges before the first move. An invalid saved pose names its
   offending joints; record a replacement rather than forcing or clamping it.
6. Test **Stop** during a run. It cancels subsequent blocks and attempts a hold
   at every commanded joint's measured position. It remains available after a fault
   while USB is connected. After fresh readings stabilize, choose Run to start
   again. Stop does not automatically return Home or retry; a new explicit Run
   starts the Home-first sequence again. Software Stop is not a
   certified emergency stop.
7. Disconnect during a run: subsequent robot work is canceled. Reload never
   reconnects or resumes a program. Connect, Release and Restore are above Run.

Use **Save program** to download a local `nexarm-program.json` file. It includes
the blocks and snapshots of named positions they use. **Load program** restores
the blocks for review without modifying the browser's position library,
connecting or moving. Only Run executes. Invalid files preserve existing blocks;
files cannot import servo settings or executable code. There is no autosave yet.
For checked coordinate blocks, follow [XYZ testing](./COORDINATE_PROGRAMMING.md).

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
student identity, account or upload is required. Download your program before
reload; Load program restores that file when you return.

Before student release, provision validated robot-specific limits through
protected teacher/admin configuration, without exposing editable limits or a
bypass in the student interface. See ROADMAP.md for enforcement and testing gates.
