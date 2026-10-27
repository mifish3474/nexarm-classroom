# NexArm Classroom

A middle-school programming environment for the Hiwonder NexArm robot.
Development priorities are student safety, privacy, reliability, and learning.

**Dev.41: Run validates destinations, returns to the established Home, then
executes the blocks.** Already near Home skips the redundant return. An unsuccessful
return stops before block 1; Stop cancels startup as well as the program. Connect
and Load remain motion-free. Home-first does not make an invalid destination valid.

XYZ/P/R/C programs calculate and check all six joint targets before
any program movement. Accepted targets use the established timed-pose joint
executor. Direct native coordinate movement remains blocked. Installed firmware
calculation support still needs hardware verification. See
[coordinate testing and limitations](docs/COORDINATE_PROGRAMMING.md).

The root `index.html` is the working **Connection Lab v0.6.1** prototype. It
supports teacher-tested USB communication and small individual-servo commands;
it is not a student-ready safety-controlled programming environment.

The separate `app/` entry now contains a classroom programming development preview:
the Station robot view, Blockly programs, Stop and live joint readouts. The
simulator and virtual-arm frame are hidden for now. Connect, Release and Restore
are above Run. The bounded Blockly
programs use the shared motion controller after Connect and fresh stable
readings. There are no repeated confirmation checkboxes or Enable controls.
Operator-provided [development operating ranges](docs/OPERATING_RANGES.md) are
checked before joint and saved-pose movement. Stricter protected teacher/admin student limits
remain required before student release in [the roadmap](docs/ROADMAP.md).
The intended classroom workflow lets students edit and rerun without teacher
approval for each program. Follow [the classroom testing guide](docs/CLASSROOM_PROGRAMMING.md).
The main page also supports [hand-positioned named pose recording](docs/TEACHING_POSITIONS.md):
support/release the arm, capture its measured positions, then Restore holding.
Fresh stable feedback completes restore readiness; physical holding is not measured.
Named positions save locally with export and deletion. Move to position buttons
and Blockly position blocks replay them as timed frames with per-joint speeds up
to 600 and acceleration 10. Each block has an editable duration;
Wait and Repeat connect them into sequences. Pose playback advances when frame
time elapses, matching factory online actions; exact arrival is not verified.
Live readings show the result. Add Wait for an extra pause between positions.
Timed-pose start/target path comparisons are diagnostic-only; continued movement
from previous frames does not trigger a path fault. Target limits, feedback-loss
checks, USB write checks, and Stop remain active.
New empty program starts a sequence without the starter's joint movements.
The [XYZ/P/R/C blocks](docs/COORDINATE_PROGRAMMING.md) use calculation-only
firmware requests followed by checked joint movement. Unsupported or out-of-range
calculations stop the program before any movement. This enforces commanded joint
limits, not link clearance, obstruction protection or straight XYZ paths.
A passive readout supports LCD comparison. Blocks connect with Wait, Repeat and
saved positions. Coordinate preview and simulation are deferred. Browser Stop
attempts the existing measured-position holds.
A separate setup page provides read-only USB
inspection and unreviewed reference capture; open it explicitly from the footer.
That page links to direct teacher controls at `/mapping.html`: reusable +/-20
buttons on every servo and a slow return to the teacher-requested Home
`[2050,2150,2100,2200,2000,1080]`. Follow [the operating and testing steps](docs/TEACHER_CONTROLS.md).
Home sends all six targets together with one continuous target per joint
(speed up to 600 raw units/second, acceleration 10) and finishes on frame time.
Stop attempts holds for all commanded joints at their latest measured positions and permits
a new explicit action on the same connection once fresh readings stabilize.
Manual release/restore retains the durable interrupted-setup record across reload;
an unfinished release requires an explicit Restore, with no confirmation button.
The earlier mapping suite and Reference A return remain at `/mapping-tests.html`,
with their original approval history; see [the earlier scope](docs/JOINT_SUITE_AND_HOME.md).
**Save program / Load program** download and reload a local JSON file with the
blocks and snapshots of their named positions. Loading preserves the browser's
saved-position library and never connects, restores holding or runs automatically.
Files contain program data only; no accounts or uploads are involved.

Use Node.js 24 or newer. From the repository folder:

```powershell
npm ci
npm run dev
```

Open the local URL printed by Vite (normally `http://127.0.0.1:5173`). This serves
the new app, not root `index.html`. The development server uses a local WebSocket
for code updates; the production build disables runtime data connections.

Verification commands:

```powershell
npm test
npm run build
npm run test:browser
```

Browser tests use an installed Google Chrome browser and serve the built `dist/`
output. Run the build before browser tests. `npm run preview` serves that same
output for manual review. No command deploys or modifies the existing prototype.
Do not publish the repository root or substitute this preview for student release
without the planned review.

Project documents:

- [Technical handoff and mandatory requirements](docs/CODEX_HANDOFF.md)
- [Engineering and collaboration instructions](docs/CODEX_PROMPT.md)
- [Proposed architecture and implementation outline](docs/ARCHITECTURE.md)
- [First implementation scope and teacher review](docs/IMPLEMENTATION_NOTES.md)
- [Read-only reference capture and calibration plan](docs/CALIBRATION_PLAN.md)
- [Factory software inspection and candidate model findings](docs/FACTORY_SOFTWARE_FINDINGS.md)
- [Joint mapping suite and staged return instructions](docs/JOINT_SUITE_AND_HOME.md)

The architecture covers module boundaries, execution and fault handling,
local project storage, privacy, testing, and incremental delivery. New physical
movement behaviors require explicit teacher approval before introduction.
