# Project names and My Blocks: dev.57

Name your project in the box above the code. **File → Save program** downloads
that name as a `.json` file. The name is stored inside the file and restored by
Load program. Older files still open; their filename supplies the initial name.
Loading and renaming never connect or move the robot. Save before closing;
there is no autosave or account. Use a task or team label, without student names.

My Blocks are reusable named sequences, also called functions or procedures.
For example, define **Pick up** once, then call it from Run or a keyboard event.
The definition does not execute by itself, and a call finishes its sequence before
the next block runs. Calls can be placed inside Repeat or if/else, and functions
can call other functions. Existing movement, Home-first startup and Stop behavior
remain in effect.

## Try it without a connected robot

1. Start with **File → New empty program**. Give the project a name such as
   **Sorting challenge**.
2. Open **Add block**, enter **Short pause** under **Name for new My Block**,
   and click **Define My Block**. The **Add blocks to** selector now points to
   that definition. Click **Add wait block** to put a wait inside it.
3. Select **When Run clicked** under **Add blocks to**. Choose **Short pause**
   under **My Block to call**, and click **Add My Block call** twice.
4. Click **Check program**. Expect two planned waits. No connection is needed.
5. Use **File → Save program**, start a new empty project, then Load the file.
   The project name, definition, calls and any used position snapshots return.
6. To use a keyboard event, add a key-event block, choose a supported key, and
   put a function call underneath it. Run explicitly starts listening. Space
   remains reserved for Stop.

You can also drag definition and call blocks from the **My Blocks** category.
Edit the name on a definition to rename its callers. To add existing saved
positions to a function, select its **Define …** stack before clicking a
position's **Add to code** or **Add position block**.

## Rules for this first version

- Use up to 16 definitions, with unique names of 1–40 characters.
- Functions share the existing numeric program variables. Set a variable before
  reading it. Values reset on every Check, Run, or accepted key event. Parameters,
  local variables and return values are deferred.
- Direct and indirect recursion are rejected; use Repeat instead. At most 12
  nested function calls are allowed. Missing functions and invalid definitions
  block checking/running, including references in unused branches.
- The existing limits apply after calls and repeats expand: 100 movement/wait
  steps, 60 seconds of pose/wait time, plus bounded calculation work. Authored
  blocks, variables, file size and joint-target limits still apply.
- Programs containing functions save as data-only format 4. Formats 1–3 remain
  loadable; function-free exports retain formats 2/3 with optional name metadata.
  Older app builds cannot open format 4.

All blocks are checked before robot movement. Only the prepared joint/pose/wait
plan reaches the existing robot controller; no executable JavaScript is loaded
from files. Stop/Space cancels later work in a function just as it does ordinary
blocks. Functions add no new movement profile, firmware, upload or approval step.
