# Variables, math and conditionals: dev.63

Dev.58 shares variables across Run, all key stacks and My Blocks. A new Run
resets state; accepted key events continue it. See [Keyboard events](./KEYBOARD_EVENTS.md).

Dev.57 adds [project names and reusable My Blocks](./MY_BLOCKS.md). Functions share
program variables and work from Run or key events. Earlier phase notes below are historical.

Open the classroom page and confirm **0.7.0-dev.63**. The toolbox now has Motion,
Control, Math, Logic and Variables categories. Click a category to open its
palette. New and loaded programs close the palette so the code stays visible.
There is no new firmware, account, upload, or robot setup requirement.

## Try the example

1. Save any existing program you want to keep.
2. Choose **File > Load variables and logic example**. You can edit and save it
   without a robot connection.
3. To execute, connect, clear the Home route and click **Run program**. Run validates
   calculations and targets before movement, checks Home, then runs the blocks.
4. The example waits 0.2, 0.2 and 0.4 seconds. Its calculations end with
   counter = 3 and cycles = 3. Edit values directly on the blocks.
5. Change the comparison from < 2 to < 1 and Run again. The waits become 0.2, 0.4
   and 0.4 seconds. A new Run starts with the initial assignments again.
6. Save, start a new program and Load the file to restore the code and positions.

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

Calculation-only projects can be saved. Run requires a joint move, Home, saved
position or Wait on the selected path; a calculation-only Run sends no Home command.

## Build your own

**Variables:** open Variables and choose Create variable. Use a short descriptive
name such as `counter`, `cycles`, `target` or `pause`. Drag out Set, Change and
the variable's rounded value block. Choose the variable's name from the block's dropdown as needed. Set a variable before
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
all handlers share Run-session variables and use the same bounded language. The
program can contain at most 100 authored blocks, excluding default numeric
shadows, and 32 used variables. Existing limits of 20 repeats, 100 expanded
movement/wait steps and 60 seconds remain. Excessive calculation-only nesting
also stops on a bounded instruction budget.

## What Run does

Run validates the program before robot movement. Calculations and branch decisions
finish during preparation; program variables are not live sensor measurements. Every accepted key event uses
current shared Run-session values; starting Run again resets them.

Targets are checked against the operating ranges before the first movement. Run
uses existing Home-first startup and motion profiles. Connecting, loading a file,
creating a variable and dragging a block do not move the robot.
