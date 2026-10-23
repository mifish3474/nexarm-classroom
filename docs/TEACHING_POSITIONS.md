# Teach and use a position: dev.30

Open `http://127.0.0.1:5173/`, confirm **0.7.0-dev.30**, select **Station robot**,
and Connect. Open **Teach a position → Release, record, and restore**.

Live targets must fit the [current operating ranges](./OPERATING_RANGES.md).
Existing saved poses outside these ranges show per-joint warnings and cannot
play back. Reposition and record a replacement, then choose it in the relevant
block. Existing records are never silently adjusted. The entire live program
is checked before its first movement; rejection retains the session Enable.

1. Secure the base, empty the gripper, clear pinch areas, and keep the physical
   power cutoff accessible. Support the arm's weight before checking the support
   confirmation and clicking **Release servos for hand positioning**. Motion
   programming is disabled during hand positioning.
2. Verify the servos have released. Move the arm gently by hand while continuing
   to support it. Never force a joint that still resists. The six live value
   boxes sit beside the naming field and show each joint's valid range. A box
   turns red and says Out of range when invalid. Recording stays disabled until
   all six joints are in range and feedback is fresh. Last readings are labeled
   when feedback is stale or disconnected; they cannot be recorded.
3. Hold the desired position, enter a label such as **Pickup**, and click
   **Record current position**. Recording reads the current six measured values;
   it sends no robot command. It can also capture a normally held pose without
   releasing. It waits for fresh feedback and no active movement/write.
4. You may record additional supported positions while released. Each must have
   a unique name. Use position labels rather than student names or identifiers.
5. Still supporting the arm, click **Restore servo holding**. Verify the arm
   holds the placed pose. Check the physical-holding confirmation, then click
   **Confirm holding restored**. Only then remove support as appropriate.
6. Use the normal clear-area confirmation and **Enable robot** before running
   another program. No program or movement resumes automatically.

If interrupted, reconnect here and follow the displayed restore/confirmation
steps. There is no consumed-attempt lockout. Reload never restores holding or
clears the pending verification automatically. Deleting saved poses does not
change servo holding or bypass recovery.

Saved positions persist in this browser profile and may be visible to others
using it. Up to 32 positions are retained, with names of at most 40 characters.
Use **Export saved positions** for a local JSON backup. If saving fails, the
message says **Memory only**; export before reloading or closing. Individual
Delete and Clear saved positions affect only pose records. Import is not yet
implemented, so keep exported backups for the later import feature.

To test one saved position, restore/confirm holding and Enable, check the full
movement sweep, then click **Move to position** beside that position. All needed
joints receive targets together at speed 600 / acceleration 10, using the same
executor as Home. Wait for completion and inspect the measured values. Joints
have independent arrival times. An already reached pose sends no command.
Use Stop to cancel and attempt holds at the latest measured positions.

To connect positions in code:

1. Click **New empty program**. This removes the starter's movements.
2. Choose a name in **Saved position for new block**, then **Add position block**.
3. Click **Add wait block** for a one-second pause. Edit its seconds in Blockly
   or under **Program steps and keyboard editing** (0–10 seconds).
4. Choose a second position and add another position block. For example:
   `Pickup → wait 1 second → Dropoff → wait 1 second → Pickup`.
5. Drag blocks to change their order or place the sequence inside Repeat.
   Each position block's dropdown can select a different saved position.
6. Try Simulation first; its illustration shows joint targets, not calibrated
   robot geometry. For hardware, select Station robot, Connect/Enable if needed,
   inspect the starting pose and combined sweep, then Run program.
7. Every move waits for all commanded joints to settle before the next block.
   Settling allows ±12 raw units from target, with three stable readings over
   at least 150 ms; a stable 10-unit residual can therefore complete.
   Test Stop during a short sequence; later blocks must not run. Inspect the arm
   before enabling and running again. Successful runs retain the session enable.

A missing/deleted position blocks Run until its block selects a valid position.
Each run copies its targets; editing or deleting records cannot change an active
run. Programs are limited to 100 expanded steps (including waits) and 60 seconds.
Programs are lost on reload even though their saved positions persist locally.

Playback connects endpoints; it does not reproduce the path used while moving
the arm by hand. A recorded endpoint does not establish a collision-free route.
The workflow is available for development testing. Student release still requires
validated support/pinch-zone training and protected motion policy in ROADMAP.md.
