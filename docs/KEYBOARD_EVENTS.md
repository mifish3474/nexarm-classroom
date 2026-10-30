# Keyboard events and shared variables: dev.62

All stacks and My Blocks share one set of numeric variables during a Run session.
A new Run starts with fresh variables. Run validates before movement.

## Increment a joint with A

Under **When Run clicked**:

1. Set **Joint1** to **2100**.
2. Move joint **1** to the **Joint1** variable.

Under **When A pressed**:

1. Set **Joint1** to **Joint1 + 50** (or use Change Joint1 by 50).
2. Move joint **1** to **Joint1**.

Connect, check the sweep, and click Run. The app checks Home once and completes
startup before listening. After Keys active appears, press and release A. The
successive requested targets are **2150, 2200, 2250**, within J1's operating range.
Key events continue from the current pose; they do not return Home between presses.
The variable is a program target, not a measured servo position.

An event may set a variable that another event or function uses later. If it has
not been set when read, that activation is rejected with a block-specific message.
Set shared initial values under When Run clicked whenever possible.

## Build without hardware

- Drag a When key pressed block from Events, then drag statements beneath it.
  Keep the single When Run clicked hat.
- Use one stack per key, up to 16. Letters, numbers and arrows are supported.
  Space is reserved for Stop. Empty key hats do not listen until code is attached.
- Run validates startup and each first-event preparation before movement. Variables
  supplied by another event are checked when that event is actually activated.
- Every accepted activation uses the same 100-step, 60-second and calculation
  budgets, operating ranges and existing movement profiles.

## Use with the robot

1. Save your program, connect, wait for fresh feedback, and clear Home and the
   complete intended movement sweep. Keep the physical cutoff accessible.
2. Run initializes a new session, returns Home if needed, and runs startup blocks.
   Even a key-only program checks Home before listening. Event keys are ignored
   during startup, including a Home return.
3. Wait for Keys active. The keyboard-control strip receives focus. Click it again
   if focus is elsewhere, then press and release the desired key.
4. That activation is prepared from the latest shared variables and fully validated
   before movement. Other event presses during preparation/movement are discarded;
   they are never queued. Held keys do not repeat. Only one stack runs at a time.
5. Successful completion commits its final variables for every stack and My Block.
   Calculation-only events also update shared values. A rejected preparation sends
   no movement and keeps the prior values, so another key may correct the target.
6. Space or Stop cancels the active sequence and keyboard session, sends the tested
   fast hold, then requests release after fresh steady readings. Support the arm.
   Recover with Restore & Return Home or Hold current position, then use Run to
   initialize a new session. Nothing resumes automatically.

## Cancellation, privacy and files

Editing, replacing the program, changing position records, release/restore,
manual motion, focus loss, disconnect and controller faults end the session. A late
worker response cannot restart it. Lifecycle cancellation does not add a release
request. Typing, modifiers, composition and synthetic keyboard events cannot
activate a key stack. Space remains Stop during preparation, motion and listening.
This is a focused-page control, not a global computer shortcut.

Only program variables and configured key identities are held in page memory.
There is no keyboard logging, account, upload or persistence of runtime state.
Saved files retain initial assignments, events and all saved positions, not
current variable values or listening state. New files use format 5; older formats 1-4 remain loadable. See [Program files](./PROJECT_FILES.md). Old Space hats remain editable but must be reassigned
before Run/Save. Invalid files preserve the current workspace.

Parallel execution, live sensor variables and function parameters are deferred.
Factory firmware and Stop/release timing are unchanged. See [My Blocks](./MY_BLOCKS.md)
and [Signal and Stop](./SIGNAL_AND_STOP.md).
