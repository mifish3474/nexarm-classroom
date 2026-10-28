# NexArm Classroom

A middle-school programming environment for the Hiwonder NexArm robot.
Development priorities are student safety, privacy, reliability, and learning.

**Dev.55: restore tested release pacing.** Stop/Space still use the fast hold,
then release, but once again wait for three new steady reports after the hold
write. The zero-gap dev.54 change failed on the arm despite successful USB
writes. Status now says Release sent, not confirmed release; the manual Release
control permits an explicit All Off retry without restoring torque first.
See [the recovery check](docs/SIGNAL_AND_STOP.md).

**Dev.56: deliberate Home recovery.** Positions now offers **Restore & Return Home** and the secondary **Hold current position**. Recovery checks fresh steady readings before moving, uses the established Home profile, and checks readings near Home afterward. Stop/Space cancels recovery; no program resumes automatically. The tested Stop/release timing is unchanged. See [Home recovery and testing](docs/HOME_RECOVERY.md).

**Dev.54 (superseded): Stop includes prompt release.** Stop/Space and setup Stop motion send
the fast hold, then factory All Off immediately after the hold write completes
with fresh feedback. The three-reading wait and separate test button are removed.
Restore holding deliberately before another Run. Disconnect, focus cancellation,
and faults do not add release. See the [hardware check](docs/SIGNAL_AND_STOP.md).

**Dev.53 (superseded): separate stop-then-release test.** Positions includes a test button
that sends the proven fast hold, waits for new steady readings, then sends
factory All Off once. Support the arm. Space/Stop cancel a pending release and
still retain holding when used on their own. Restore is deliberate; nothing
resumes automatically. See the [hardware test guide](docs/SIGNAL_AND_STOP.md).

**Dev.52: faster-stop test.** Stop uses a dedicated 600/100 hold profile and
waits for an active USB write instead of skipping its hold. It uses fresh readings
when submitting, cancels pending movement, and never releases holding or resumes
the program. Diagnostics include request/write timing and post-stop readings.
Physical stopping time still needs hardware observation; see the
[stop testing guide](docs/SIGNAL_AND_STOP.md).

**Dev.51: signal tower and Space stop.** A fixed tower pulses green during
programs, shows amber while listening for keys, and red after Stop or a fault.
Space now uses Stop, retaining servo holding. It cancels preparation and events;
held/released Space never restarts a program. Old Space hats remain editable but
require an explicit replacement key. See [Signal tower and Space stop](docs/SIGNAL_AND_STOP.md).
Automatic stop-then-release remains a separate future investigation.

**Dev.50: keyboard events.** Events adds When arrow/letter/number pressed
stacks. Run validates all stacks and starts listening; Stop ends listening.
One idle key press runs its stack through the existing Home-first controller;
held/busy presses are never queued or repeated. Typing is excluded, editing and
faults end listening, and loading a file never enables it. Keyboard projects
use format 3 while legacy formats still load. See
[Keyboard events](docs/KEYBOARD_EVENTS.md). Functions remain a later phase.

**Dev.49: variables, math and conditionals.** Blockly now includes numeric
Set/Change variables, arithmetic/rounding, comparisons, AND/OR/NOT and if/else.
Calculated values plug into joint targets, Repeat, Wait and pose durations.
Check program works without USB and shows the prepared final variable values.
Run prepares and validates the selected sequence before its existing Home-first
startup. New format-2 files preserve the logic; legacy format-1 programs still
load. See [Variables and logic](docs/VARIABLES_AND_LOGIC.md) for a no-robot example.
Functions and live sensor conditions are deferred.

**Dev.48: workspace layout.** Code is visible immediately, with persistent
Connect/Run/Stop controls, File and Help menus, and Robot/Positions tabs.
The Positions panel groups release, readings, recording and restore; each saved
position has Add to code. Programs start empty, the palette groups Motion and
Control, and Undo/Redo are visible. Motion settings and program-file compatibility
are unchanged. Project naming, autosave and destructive-edit recovery remain
future work. See [the usability review](docs/USABILITY_REVIEW.md).

**Dev.47: joint and saved-position programming.** Blockly offers joint moves,
saved six-joint positions, Wait and Repeat. XYZ blocks and coordinate execution
have been removed. Older XYZ program files are rejected with an explanation
without replacing the current workspace; joint/pose programs still load normally.
The project uses factory firmware only; custom ESP32/AT32 firmware is out of scope.

**Dev.46 updates [read-only servo diagnostics](docs/READ_ONLY_SERVO_DIAGNOSTICS.md)**
at `/servo-diagnostics.html`, linked under Help & tools. It collects raw identity,
configuration and feedback observations using a fixed READ-only packet whitelist,
with factory configuration reads and gated direct-register probes. It supports
the captured ESP32/AT32 six-byte firmware reply. A bounded raw receive capture
helps investigate unrecognized replies; it stays local until explicit export.
Review raw controller/debug data before sharing.
It changes no robot settings or movement behavior. Export its JSON for review;
the readings do not establish verified pinch protection.

**Dev.41: Run validates destinations, returns to the established Home, then
executes the blocks.** Already near Home skips the redundant return. An unsuccessful
return stops before block 1; Stop cancels startup as well as the program. Connect
and Load remain motion-free. Home-first does not make an invalid destination valid.

Programs validate joint and saved-position targets before Home or program
movement. Coordinate instructions are rejected, including inside loops. Earlier
[coordinate research](docs/COORDINATE_PROGRAMMING.md) is historical only.

The root `index.html` is the working **Connection Lab v0.6.1** prototype. It
supports teacher-tested USB communication and small individual-servo commands;
it is not a student-ready safety-controlled programming environment.

The separate `app/` entry now contains a classroom programming development preview:
the Station robot view, Blockly programs, Stop and live joint readouts. The
simulator and virtual-arm frame are hidden for now. Connection and execution
controls stay in the toolbar; Release and Restore are in Positions. The bounded Blockly
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
The initial program contains only When Run clicked; File provides examples.
Saved positions contain six measured joint values. Their blocks connect with
Wait and Repeat. The programming page shows joint readings; passive coordinate
data remains available only in setup/diagnostics. Browser Stop attempts the
existing measured-position holds.
A separate setup page provides read-only USB
inspection and unreviewed reference capture; open it explicitly from Help & tools.
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
