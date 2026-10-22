# NexArm Classroom

A middle-school programming environment for the Hiwonder NexArm robot.
Development priorities are student safety, privacy, reliability, and learning.

The root `index.html` is the working **Connection Lab v0.6.1** prototype. It
supports teacher-tested USB communication and small individual-servo commands;
it is not a student-ready safety-controlled programming environment.

The separate `app/` entry now contains a simulation-only development preview:
six virtual joints, an animated arm illustration, a Blockly repeat-loop lesson,
manual simulation jogging, Stop, and Reset Simulation. It has no USB connection
or live movement capability. Project saving is not implemented yet. The arm is
an illustration, not a calibrated NexArm model.

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

The architecture covers module boundaries, execution and fault handling,
local project storage, privacy, testing, and incremental delivery. New physical
movement behaviors require explicit teacher approval before introduction.
