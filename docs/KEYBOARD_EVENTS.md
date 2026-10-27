# Keyboard events: dev.50

Use **When [Space] pressed** to run a block sequence from a key. The same event
hat can contain a function call when My Blocks is implemented later. Functions
are not part of this update.

## Build and check without hardware

1. Confirm **0.7.0-dev.50** and save any work you want to keep.
2. Open **Events** and drag a When Space pressed hat into the workspace, or use
   **Add block → Add key event block**. It is a separate stack beside When Run
   clicked, not a block inside that stack.
3. Attach the actions you want beneath the key hat. For a first check, add Wait.
   Quick-add buttons use **Add blocks to** in the Add block menu. Adding a key
   hat selects that stack automatically. The position library's Add to code also
   uses this selection. Dragging blocks can connect them directly instead.
4. Choose a key from the hat's dropdown: Space, an arrow, A–Z, or 0–9.
5. Click **Check program**. It validates the startup and all nonempty key stacks
   without USB or movement. Check results appear under Program steps and keyboard
   editing. Check does not start listening.

Keep the single When Run clicked hat. It may have no actions when you only want
keyboard events. Other loose statements still need a hat. Use one stack per key,
up to 16 keys, within the existing overall authored-block and variable limits.
Duplicate key hats produce a correction message before activation. Empty key hats
are saved but do not listen until code is attached.

## Use with the robot

1. Connect and wait for fresh readings. Inspect clearance for Home and the full
   sequences, including transitions between their destinations.
2. Click **Run program**. The app checks all startup and key-stack destinations
   before sending any movement. Actions beneath When Run clicked run first using
   the existing Home-first behavior. If that stack is empty, starting keyboard
   listening sends no movement.
3. Wait for **Keyboard events active / Keys active**. The keyboard-control strip
   receives focus automatically. Click it again if focus is on another control.
4. Press and release the selected key. One press runs its entire stack using the
   existing Home-first program path and motion settings. If already near Home,
   the existing rule skips the redundant Home move. The event can use saved
   positions, joints, Wait, Repeat, variables and conditions.
5. Wait for completion before pressing another key. Holding a key does not repeat
   it. Key presses while preparing, moving or unready are discarded; none are
   queued to execute later. Release and press again when ready.
6. **Stop** cancels future keyboard triggers as well as the current sequence and
   attempts the existing measured-position holds. Run is needed to listen again.

Typing in names, numbers, dropdowns, Blockly, dialogs, or editable content does
not trigger the arm. Buttons and links retain their ordinary keyboard behavior.
Ctrl/Alt/Meta/Shift combinations and input-method composition do not trigger it.
Only real browser keyboard events are accepted, not script-dispatched key events.
Use the focused page; this is not a global computer shortcut or a background
robot control. Only configured key identities are held temporarily in memory;
there is no keyboard logging, upload, or persistence of listening state.

## Stop, editing and recovery

- Editing blocks, numeric fields, Undo/Redo, changing position records, replacing
  the program, or using Check ends listening. Run again after editing.
- Release/restore and separate manual positioning end listening. Restore does
  not reactivate keyboard events.
- A program fault or disconnect ends listening. Recover using the existing
  controls, then explicitly Run again; there is no automatic retry or Enable step.
- Losing window focus stops keyboard listening. An active keyboard session's
  running sequence is canceled through the existing Stop path. Pending keyboard
  preparation is canceled before it can activate. Returning focus never resumes
  events automatically. Hidden-page behavior still stops/disconnects as before.
- Software Stop remains the existing software control; hardware capabilities,
  joint ranges and physical classroom-release requirements are unchanged.

## Variable scope and files

Each accepted key runs a fresh evaluation of its own stack. **Set variables inside
that stack before using them.** Startup assignments are not shared with key
handlers, and values do not accumulate between presses. This matches the current
fresh-run model and allows every handler to be checked before activation.
Displayed final values are preparation results, not live sensor measurements.
Only one sequence runs at a time; parallel event scripts and shared event-state
variables are not implemented.

Programs with keyboard hats save in **format 3**, retaining startup blocks,
key choices, handler code and all used position snapshots. Programs without hats
continue to save as format 2. Old formats 1 and 2 still load. Loading or reconnecting
never starts listening, restores holding or runs any stack. Listening/held-key
state is never saved. Invalid files preserve the current workspace.

Factory firmware only. No new joint movement profile or firmware command is
introduced. Functions/My Blocks remain the next language feature.
