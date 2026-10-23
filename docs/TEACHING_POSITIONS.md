# Teach a position: dev.25

Open `http://127.0.0.1:5173/`, confirm **0.7.0-dev.25**, select **Station robot**,
and Connect. Open **Teach a position → Release, record, and restore**.

1. Secure the base, empty the gripper, clear pinch areas, and keep the physical
   power cutoff accessible. Support the arm's weight before checking the support
   confirmation and clicking **Release servos for hand positioning**. Motion
   programming is disabled during hand positioning.
2. Verify the servos have released. Move the arm gently by hand while continuing
   to support it. Never force a joint that still resists. The six measured raw
   values update beside the recording controls.
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

This version records poses; it has no move-to-pose button or Blockly pose block.
A recorded endpoint does not establish a collision-free route to that endpoint.
The workflow is available for development testing. Student release still requires
validated support/pinch-zone training and protected motion policy in ROADMAP.md.
