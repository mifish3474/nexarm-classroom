# Variables, math and conditionals: dev.49

Dev.57 adds [project names and reusable My Blocks](./MY_BLOCKS.md). Functions share
program variables and work from Run or key events. Earlier phase notes below are historical.

Open the classroom page and confirm **0.7.0-dev.49**. The toolbox now has Motion,
Control, Math, Logic and Variables categories. Click a category to open its
palette. New and loaded programs close the palette so the code stays visible.
There is no new firmware, account, upload, or robot setup requirement.

## Try the example without a robot

1. Save any existing program you want to keep.
2. Choose **File → Load variables and logic example**.
3. Click **Check program**. It checks calculations and targets without connecting
   or sending any robot command.
4. Open **Program steps and keyboard editing**. The planned waits are 0.2, 0.2
   and 0.4 seconds. The calculated final values are `counter = 3` and `cycles = 3`.
5. Change the comparison from `< 2` to `< 1` and Check again. The planned waits
   become 0.2, 0.4 and 0.4 seconds. Checking again starts from the program's initial
   assignments; it does not continue counting from the previous check.
6. Save the program, make a new empty program, then Load the file and Check again.
   Variables, calculations, branches and any used positions stay in the file.

The example contains:

```text
When Run clicked
  set counter to 0
  set cycles to 3
  repeat cycles times
    if counter < 2
      wait 0.2 seconds
    else
      wait 0.4 seconds
    change counter by 1
```

You can also Check a program containing only assignments and calculations. Its
results show zero planned moves/waits. Run requires a joint move, saved position,
or Wait on the selected path; a calculation-only Run sends no Home command.

## Build your own

**Variables:** open Variables and choose Create variable. Use a short descriptive
name such as `counter`, `cycles`, `target` or `pause`. Drag out Set, Change and
the variable's rounded value block. The Add block menu also appends Set/Change
blocks. It uses the first existing variable, or creates `counter` if none exist;
choose another name from the block's dropdown as needed. Set a variable before
reading it or changing it. Variables hold numbers in this phase.

**Math:** use numbers, addition, subtraction, multiplication, division, powers
and rounding. These blocks plug into joint targets, Repeat counts, Wait durations
and saved-position durations. The joint selector remains a J1–J6 dropdown.
For example, set `target` to `2050 + 20`, then move J1 to `target`.

**Logic:** comparisons provide =, ≠, <, ≤, > and ≥ for numbers. AND, OR, NOT,
true and false combine conditions. Comparisons produce true/false results, not
joint targets or numeric variable values.

**Control:** add an if/else block. Its edit/mutator control lets you add else-if
branches or remove Else. Only the first true branch runs. A Repeat evaluates
its count once when entering the loop; changing that variable inside does not
extend the current loop. An if condition is evaluated again each time the loop
reaches it.

Keep one When Run clicked block. Without keyboard events, connect all statements
beneath it. Dev.50 also allows [separate keyboard event hats](./KEYBOARD_EVENTS.md);
each handler initializes its own variables and uses the same bounded language. The
program can contain at most 100 authored blocks, excluding default numeric
shadows, and 32 used variables. Existing limits of 20 repeats, 100 expanded
movement/wait steps and 60 seconds remain. Excessive calculation-only nesting
also stops on a bounded instruction budget.

## What Check and Run mean

Both prepare the whole selected sequence from fresh variable values. All
calculations and branch decisions finish before robot movement. Variables are
not persistent between checks/runs, and are not live sensor readings. The
displayed final values describe preparation results, including while the
physical sequence is running. Editing clears the old preparation results.

Check validates the selected joint/position targets against the same operating
ranges as Run. It neither connects nor changes holding. Run uses the existing
Home-first startup and existing movement profiles. Connecting, opening a file,
creating a variable and dragging a block do not move the robot.

All branches are checked for supported structure, including branches that are
not selected. Arithmetic and range checks apply to the resulting selected
sequence. A later calculated target outside its joint's operating range rejects
the whole run before Home or block 1. Targets are never silently clamped.

Joint targets must be whole raw servo units. Durations use tenth-second steps:
Wait 0–10 seconds, saved position 0.1–10 seconds. Tiny floating-point noise from
arithmetic such as 0.1 + 0.2 is normalized, but a real 0.25-second duration is
rejected. Use rounding deliberately when calculating joint targets.

Undefined variables, division by zero, nonfinite/oversized numbers, invalid
repeat counts, and exceeded budgets produce an explanation before movement.
Preparation errors highlight the relevant source block where available. Fix
the input and Check again. There is no additional teacher approval or Enable step.

## Files and scope

Downloads without keyboard hats use **program format 2**; keyboard projects use
format 3. They retain assignments, expressions,
all conditional branches, used variable names and six-joint position snapshots.
Existing format-1 joint/pose programs still load. Older app builds cannot open
format-2 downloads. XYZ remains rejected, including inside an unused branch.
File loading validates data before replacing the workspace and never runs it.
Unused variable names without any blocks referencing them are not included in
the program file. Save requires a valid connected program; there is no autosave.

This phase includes no functions/My Blocks, live sensor conditions, while/forever
loops, or automatic fault-response programming. Existing robot fault checks,
operating ranges, Stop and release/restore behavior are unchanged. Protected
student motion policy remains a separate release requirement on the roadmap.
