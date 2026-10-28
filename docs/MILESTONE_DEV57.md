# Classroom programming milestone: 0.7.0-dev.57

Preserved on 2026-10-28 as `milestone-0.7.0-dev.57`.
Application source baseline: `17dc4b8c44ec2ca886bfc09a2d4ab1aebdf12fbb`.
The checkpoint adds documentation only; the version and robot behavior are unchanged.

## Included capabilities

- The Blockly classroom workspace, joint moves and named six-joint positions.
- Repeat, numeric variables, math, comparisons and if/else.
- Keyboard events and reusable My Blocks with shared variables.
- Named local program downloads and loading, including used position snapshots.
- Live joint controls, manual servo release, Hold current position, and deliberate
  Restore & Return Home.
- Activity signal tower and explicit Stop/Space fast-hold-then-release sequence.
- Read-only diagnostics and existing robot setup tools.

Factory firmware only. XYZ and simulation are retired from the classroom view.
The original root `index.html` prototype is preserved in source control.

## Evidence and limitations

Recorded automated validation: build/type-check, 382 unit tests, and all 90 Chrome
browser cases across the regression and targeted corrections. Browser USB and
robot feedback are mocked. See [implementation notes](./IMPLEMENTATION_NOTES.md).
Reference toolchain: Node 24.14.1, npm 11.11.0, and the committed package lock.

The operator reported working joint/pose control, the restored integrated Stop/
release response, and combined Restore & Return Home. Project names and My Blocks
received positive operator feedback; detailed test evidence is recorded separately
from physical safety claims. The checkpoint is a development milestone, not a
completed student-release safety validation.

Home J1-J6: `2050, 2150, 2100, 2200, 2000, 1080`.
Current operating ranges: J1 900-3000; J2 525-2600; J3 2000-2900;
J4 1250-3000; J5 1024-3072; J6 1024-2731 (1024 open).
These are operator-provided development ranges, not independently measured
mechanical limits or the future protected student configuration.

Pinch/obstruction detection and physical standstill/holding verification remain
unproven. Home is a destination, not a collision-free route guarantee. Follow the
support, sweep-clearance and physical cutoff procedures in [Home recovery](./HOME_RECOVERY.md)
and [Signal and Stop](./SIGNAL_AND_STOP.md). Protected student policy, fuller
classroom recovery testing and a small supervised pilot remain on the roadmap.
No autosave exists yet. Functions have no parameters, local scope or return values.

## Backups and reopening

Local preservation artifacts are placed in `.milestones/dev57/` and deliberately
excluded from Git: a source ZIP, a self-contained Git bundle, a manifest and
SHA-256 checksums. Copy that directory to another storage location for an
independent backup. Browser-local programs, saved positions, private diagnostics,
factory binaries and `.analysis` firmware-investigation backups are not included.
Export any browser work you want to retain using the app's file controls.

The source ZIP can be extracted into a separate folder without altering ongoing
development. Run `npm ci`, then `npm run dev` with Node 24 or newer. For a production
preview, use `npm run build`, then `npm run preview`. Opening the app, loading a
program and checking code do not automatically connect or move the robot.

The tag is the precise source checkpoint; later publishing configuration can
change without altering it. To inspect its code, use `git show milestone-0.7.0-dev.57`.
Recover from the bundle into a separate folder rather than resetting a working
checkout. Publishing and rollback instructions are recorded in `DEPLOYMENT.md`.
