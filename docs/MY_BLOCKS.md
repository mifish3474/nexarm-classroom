# Project names and My Blocks: dev.62

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
2. Open **My Blocks** in the toolbox. Drag the definition into the workspace.
   Select its default **My Block** name and enter **Short pause**.
3. Drag a Wait block from Control into the definition's body.
4. Reopen My Blocks and drag the **Short pause** call underneath When Run clicked,
   then add a second call. The definition does not run on its own.
5. Use **File ? Save program**, start a new empty program, then Load the file.
   The project name, definition, calls and saved positions return.
6. To run it, connect the robot, clear the Home route and choose Run. Run validates
   the program before movement. A keyboard stack can also call the same function.

Renaming a definition updates its callers. Drag a saved-position block from Motion
into a function and choose a recorded position in its dropdown. The Positions
panel's Add to code shortcut appends to When Run clicked.

## Rules for this first version

- Use up to 16 definitions, with unique names of 1–40 characters.
- Functions share the existing numeric program variables. Set a variable before
  reading it. All stacks share these values during a Run session. A new Run resets them; key events continue from the current values. Parameters,
  local variables and return values are deferred.
- Direct and indirect recursion are rejected; use Repeat instead. At most 12
  nested function calls are allowed. Missing functions and invalid definitions
  block running, including references in unused branches.
- The existing limits apply after calls and repeats expand: 100 movement/wait
  steps, 60 seconds of pose/wait time, plus bounded calculation work. Authored
  blocks, variables, file size and joint-target limits still apply.
- New programs save in data-only format 5 with all saved positions. Formats 1-4
  remain loadable. New clears positions; Load replaces the list. See
  [Program files](./PROJECT_FILES.md). Older builds cannot open format 5.

All blocks are checked before robot movement. Only the prepared joint/pose/wait
plan reaches the existing robot controller; no executable JavaScript is loaded
from files. Stop/Space cancels later work in a function just as it does ordinary
blocks. Functions add no new movement profile, firmware, upload or approval step.
