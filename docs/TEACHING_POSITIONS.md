# Teach and use a position: dev.51

Open `http://127.0.0.1:5173/`, confirm **0.7.0-dev.51**, and Connect.
The **Positions** side panel contains Teach a position, Release holding,
live readings and ranges, naming/Record, and Restore holding. Run and Stop
remain in the top toolbar while you teach or scroll the saved-position list.

Live targets must fit the [current operating ranges](./OPERATING_RANGES.md).
Existing saved poses outside these ranges show per-joint warnings and cannot
play back. Reposition and record a replacement, then choose it in the relevant
block. Existing records are never silently adjusted. The entire live program
is checked before its first movement; rejection leaves controls available for editing.

1. Secure the base, empty the gripper, clear pinch areas, and keep the physical
   power cutoff accessible. Support the arm's weight before clicking
   **Release servos for hand positioning**. There is no support checkbox. Motion
   programming is disabled during hand positioning.
2. Verify the servos have released. Move the arm gently by hand while continuing
   to support it. Never force a joint that still resists. The six live value
   boxes sit directly above the naming field and show each joint's valid range. A box
   turns red and says Out of range when invalid. Recording stays disabled until
   all six joints are in range and feedback is fresh. Last readings are labeled
   when feedback is stale or disconnected; they cannot be recorded.
3. Hold the desired position, enter a label such as **Pickup**, and click
   **Record current position**. Recording reads the current six measured values;
   it sends no robot command. It can also capture a normally held pose without
   releasing. It waits for fresh feedback and no active movement/write.
4. You may record additional supported positions while released. Each must have
   a unique name. Use position labels rather than student names or identifiers.
5. Still supporting the arm, click **Restore servo holding**. Controls become
   ready after its write finishes and fresh position readings stabilize. There
   is no confirmation checkbox or button. The app does not measure holding power;
   check the arm holds the placed pose before removing support.
6. Choose Run or a saved position directly. There is no Enable step. No program
   or movement resumes automatically after Restore or Stop.

If interrupted, reconnect here and follow the displayed Restore
steps. There is no consumed-attempt lockout. Reload never restores holding or
clears the pending verification automatically. Deleting saved poses does not
change servo holding or bypass recovery.

Saved positions persist in this browser profile and may be visible to others
using it. Up to 32 positions are retained, with names of at most 40 characters.
Use **Position files & tools → Export saved positions** for a local JSON backup. If saving fails, the
message says **Memory only**; export before reloading or closing. Individual
Delete and Clear saved positions affect only pose records. Import is not yet
implemented, so keep exported backups for the later import feature.

To test one saved position, restore holding if released and check the full
movement sweep, expand **Joint values & movement**, then click **Move to position**. All six
joints receive targets together with per-joint speeds up to 600 / acceleration 10, using the same
executor as Home. Wait for frame time to elapse and inspect the measured values.
Joints have independent arrival times and may still be moving or stop short when
the frame ends. All targets are sent, even for an already-near pose.
Use Stop to cancel and attempt holds at the latest measured positions.

To connect positions in code:

1. The page starts with an empty program. **File → New empty program** clears existing blocks.
2. Click **Add to code** beside a saved position. Add block's **Add blocks to** selector chooses When Run clicked or a key-event stack. Alternatively, use **Add block → Saved position for new block**, then **Add position block**.
3. Each position block has an **over … seconds** field, default 1 second (0.1–10). The planner extends it if needed to keep speed at or below 600. The robot status and diagnostics show the effective duration. Click **Add wait block** for a one-second pause. Edit its seconds in Blockly
   or under **Program steps and keyboard editing** (0–10 seconds).
4. Choose a second position and add another position block. For example:
   `Pickup → wait 1 second → Dropoff → wait 1 second → Pickup`.
5. Drag blocks to change their order or place the sequence inside Repeat.
   Each position block's dropdown can select a different saved position.
6. Connect if needed, inspect the starting pose and combined sweep, then Run
   program. Run validates destinations and returns Home before the blocks.
   Simulation and XYZ are hidden/retired; teaching and playback use joint values.
7. Saved-position blocks advance when their effective frame time expires, matching
   factory online action playback. No pose-arrival tolerance or stable-reading
   check blocks the next frame. Add Wait for an extra pause. Reported positions,
   targets and remaining errors stay visible; no correction loop or retry runs.
   Readings outside the frame's start/target interval are logged in diagnostics
   and do not interrupt timed playback. That interval cannot predict a physical
   path while earlier targets are still in motion. Target limits, feedback-loss
   and USB write checks remain active.
   Explicit individual-joint blocks retain their existing completion behavior.
   Test Stop during a short sequence; later blocks must not run. Inspect the arm
   before running again. Fresh stable readings make controls ready without Enable.

A missing/deleted position blocks Run until its block selects a valid position.
Each run copies its targets; editing or deleting records cannot change an active
run. Programs are limited to 100 expanded steps (including waits) and 60 seconds.
Programs are lost on reload even though their saved positions persist locally.

Playback connects endpoints; it does not reproduce the path used while moving
the arm by hand. A recorded endpoint does not establish a collision-free route.
The workflow is available for development testing. Student release still requires
validated support/pinch-zone training and protected motion policy in ROADMAP.md.
