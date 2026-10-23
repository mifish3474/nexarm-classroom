# Classroom programming test: dev.21

Students can iterate independently. There is no teacher approval for each run.
Each station keeps its robot's movement limits; Connect and Enable are session
actions. Simulation remains available without a robot or saved limits.

## Set up a station once

1. Open `http://127.0.0.1:5173/` and confirm **0.7.0-dev.21**.
2. Select **Station robot**, then expand **Station setup: movement limits**.
3. Enter the minimum and maximum values you have tested for each of the six
   joints on that robot and workspace. The application deliberately leaves these
   blank; neither 0–4095 nor a Home-centered window establishes mechanical or
   collision limits. Set a program speed up to 600; acceleration is 10.
4. Click **Save station setup**. The values stay in this browser across reloads.
   If storage is blocked, the page says the setup is memory-only. Changing robots
   requires checking/replacing the station settings. No identity data is stored.

These setup controls are a classroom procedure, not password security. Joint
ranges alone cannot establish collision clearance for arbitrary combinations.
Use a clear, secured robot station with an empty gripper for development tests.

## Student iteration

1. Build or edit a program. Choose **Simulation** to practice with no USB access,
   or **Station robot** to use the robot. Simulation is optional before a live run.
2. In robot mode, click **Connect robot**, check the assigned robot/clear-area
   box, and click **Enable robot**. Connecting and enabling send no movement.
3. For a first physical check, use **Load short practice program**: S1 to 2130,
   then 2050. Check these targets and the starting pose against the station's
   tested range and clearance. Use the separate setup controls for positioning
   if necessary; loading a lesson does not reposition the arm.
4. Click **Run program**. Each joint command waits for feedback before the next
   step. The active block and program step are highlighted. A successful run
   leaves the robot enabled. Edit a target and Run again; no teacher action or
   repeat arming is required. A short command interval may briefly pause Run.
5. Try an out-of-range target. The complete program is rejected before its first
   command; fix the target and try again. Repeat expansion is capped at 100
   movements, and a live run is limited to 60 seconds.
6. Check **Stop** during a run. It cancels subsequent blocks and attempts a hold
   at the active joint's measured position. It is not a hardware emergency stop.
   Check the physical result and keep the cutoff accessible. After inspection,
   recheck clearance and Enable to continue. No automatic return is performed.
7. Test switching back to Simulation during a run: the robot session stops and
   disconnects, and the virtual simulator remains usable. Reload never reconnects,
   enables, or resumes a program.

If holding is unverified after a release/interruption, use **Robot setup controls**
to restore/confirm holding. Clearing station limits does not bypass this state.
Programs remain memory-only and are lost on reload; saved station ranges persist.

Keep student-account USB permission and privacy/storage checks in the classroom
release checklist. Automated checks use synthetic USB and do not certify physical
clearance, force, stopping distance, or configured ranges.
