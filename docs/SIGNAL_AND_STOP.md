# Signal tower and Space stop: dev.51

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
events. Where fresh readings and the USB writer permit it, the existing controller
requests a hold at the latest measured positions. It sends no automatic Release
or Restore command. A joint already moving may not stop immediately; read the
status message if a hold could not be sent. The physical power cutoff remains
available as taught in the classroom safety lesson.

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

1. Refresh the coding page and confirm **0.7.0-dev.51**. Save your current work.
2. Connect with the arm clear for the existing Home return. Start with a program
   containing only a several-second Wait. Run should show pulsing green,
   including during Home if needed. Press Space: the program should stop, the
   tower turn red, and holding remain enabled. No Release/Restore is needed.
3. Release Space. Nothing should restart. Use Run deliberately for another trial.
   Repeat with an existing, already-tested movement program and stop it partway
   through. Verify its later actions do not execute and inspect physical stopping.
4. For key events, Run an A-key stack. Amber means listening; an accepted A press
   turns it green until completion, then amber again. Space ends the session and
   turns it red. Pressing A afterward must do nothing until another Run.

Do not restrain or pinch-test a powered joint for this check. This update leaves
motion speeds, acceleration, joint ranges, Home, firmware, and the controller's
existing position-hold stop behavior unchanged. Automatic stop-then-release is
the separate next investigation, subject to observation and approval.
