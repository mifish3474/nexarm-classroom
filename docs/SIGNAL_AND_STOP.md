# Signal tower and Space stop: dev.52

Dev.52 enables the operator-approved faster-stop test: **speed 600 / acceleration
100** for Stop's measured-position hold. Ordinary motion still uses its previous
settings. This is a stopping-response experiment, not a measured stopping-time
guarantee. Servo holding is retained; no Release or Restore is sent.

The coding page has a fixed industrial signal-tower graphic beside the program
status. It works offline, has text labels, and stays visible above the code.

| Appearance | Software activity |
| --- | --- |
| Pulsing green | Program or saved-position motion running, including Home and Wait |
| Steady amber | Listening for programmed keys, checking a program, or holding needs attention; read the label |
| Steady red | Stop requested or a robot fault; read the status message |
| Gray | Idle, connecting, or disconnected; read the label |

The pulse is slow (one cycle per 1.5 seconds). With the system's reduced-motion
preference enabled, running uses steady green. Colors are accompanied by words.
The tower reports application state; it does not measure holding force or prove
that a physical joint has stopped. Red says **Stop requested**, not “safe.”

## Space means Stop

On the focused coding page, **Space** uses the same stop operation as the Stop
button. It cancels preparation, Home, the current sequence, and further keyboard
events. Where fresh readings and the USB writer permit it, the controller
requests a fast hold at the latest measured positions. It sends no automatic Release
or Restore command. A joint already moving may not stop immediately; read the
status message if a hold could not be sent. The physical power cutoff remains
available as taught in the classroom safety lesson.

If a USB write is already active, one priority stop request waits for that write
to finish, then submits the hold immediately using the newest available readings.
It bypasses the normal command interval. Repeated Stop presses do not duplicate
the pending hold or restart the original movement. No new movement/Release/Restore
can start while it waits. A failed write, the existing two-second write deadline,
stale readings at transmission, disconnect, or a holding-state change prevents
the pending hold from being replayed later. The page reports that condition.
Disconnecting while waiting cancels the pending hold; use Space/Stop while staying
connected for this hardware check.

During a program or active keyboard session, Space takes priority even over text
fields, Blockly fields, menus, and modifier combinations. At idle you can still
type spaces in a position name or other text field. Space on a focused Run or
other control button stops instead of activating that button while connected.
Holding Space does not repeatedly send stop requests. Run and position/holding
actions remain disabled while the consumed Space press is held. Releasing it
does not resume anything or activate a button; deliberately use Run again.

This shortcut belongs to the coding page. It is not a computer-wide hotkey, and
does not control another browser tab, the factory app, or the separate setup
pages. If the browser/USB cannot respond, use the physical cutoff. No background
keyboard hook or logging is added. Space does not provide pinch detection.

## Existing keyboard programs

Space is no longer offered as an event key. New key hats default to **A**.
Arrows, letters, and digits remain available. Old format-3 programs with Space
hats load with their code and saved-position snapshots preserved, but those hats
show **Choose key (Space is Stop)**. Choose an explicit replacement key in each
hat. Check, Run and Save explain the correction until all hats have valid keys.
The app does not silently choose a replacement that might trigger movement.

## Hardware check

1. Refresh the coding page and confirm **0.7.0-dev.52**. Save your current work.
2. Connect with the arm clear for the existing Home return. Start with a program
   containing only a several-second Wait. Run should show pulsing green,
   including during Home if needed. Press Space: the program should stop, the
   tower turn red, and holding remain enabled. No Release/Restore is needed.
3. Release Space. Nothing should restart. Use Run deliberately for another trial.
   Repeat with an existing, already-tested movement program and stop it early
   in a clear part of its path. Verify its later actions do not execute. Observe
   whether stopping is quicker and whether there is a small backward correction
   or a jerk as the measured-position hold takes over. End the check if motion
   is unexpected; do not repeat an uncomfortable stopping response.
4. For key events, Run an A-key stack. Amber means listening; an accepted A press
   turns it green until completion, then amber again. Space ends the session and
   turns it red. Pressing A afterward must do nothing until another Run.
5. Export robot diagnostics after the stop, before closing the page. Under
   `diagnostics.stopping`, each bounded record includes request/submission/write
   completion times, held joints, the selected position readings and their age,
   and up to two seconds of subsequent feedback (at most 40 samples). The regular
   events log also records the time from Stop to hold submission. Stream write
   completion is not an acknowledgment of physical stopping; these observations
   help distinguish host delay from joint response, not certify a stopping time.

Do not restrain or pinch-test a powered joint for this check. This update leaves
ordinary movement speeds/acceleration, joint ranges, Home and firmware unchanged.
Only the Stop hold uses the new 600/100 profile and priority submission.
Automatic stop-then-release is
the separate next investigation, subject to observation and approval.
