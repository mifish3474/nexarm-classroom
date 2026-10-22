# NexArm Classroom

A middle-school programming environment for the Hiwonder NexArm robot.
Development priorities are student safety, privacy, reliability, and learning.

The root `index.html` is the working **Connection Lab v0.6.1** prototype. It
supports teacher-tested USB communication and small individual-servo commands;
it is not a student-ready safety-controlled programming environment.

The separate `app/` entry now contains a simulation-only development preview:
six virtual joints, an animated arm illustration, a Blockly repeat-loop lesson,
manual simulation jogging, Stop, and Reset Simulation. It has no USB connection
or live movement capability. A separate teacher page provides read-only USB
inspection and unreviewed reference capture; open it explicitly from the footer.
That page links to direct teacher controls at `/mapping.html`: reusable +/-20
buttons on every servo and a slow return to the teacher-requested Home
`[2050,2150,2100,2200,2000,1080]`. Follow [the operating and testing steps](docs/TEACHER_CONTROLS.md).
Home moves one joint at a time with one continuous speed-controlled target per
joint (speed 300 raw units/second, acceleration 10), with completion feedback.
Stop attempts a hold at the latest measured position, cancels future joints, and permits
explicit re-enabling on the same connection. Optional manual release/restore
retains the physical-holding confirmation and durable interrupted-setup interlock.
The earlier mapping suite and Reference A return remain at `/mapping-tests.html`,
with their original approval history; see [the earlier scope](docs/JOINT_SUITE_AND_HOME.md).
Project saving is not implemented yet. The arm is an illustration, not a calibrated
NexArm model. See the calibration plan before connecting hardware.

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
