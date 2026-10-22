# Reference, calibration, and repeatable starts

Status: passive observation implemented; one Reference A servo-1 positive test
has been explicitly approved. All other physical movement tests remain gated.

The first teacher-supplied export and photographs are reviewed in
[Reference A and the first mapping-test proposal](./REFERENCE_A_REVIEW.md).
That single test is approved and implemented on a separate teacher page. Passive
inspection remains read-only, and simulation has no hardware access.

## Three different operations

1. **Observe:** Read where the factory controller reports the joints are now.
   The teacher inspection page implements this without sending application commands.
2. **Calibrate:** Establish which physical joint each value describes, its direction,
   offsets and angle relationship, real limits, and measured link geometry. Recording
   a six-number vector does not perform this work.
3. **Return to a lesson start:** Explicitly command an approved route to a reviewed
   pose and verify arrival. This remains unimplemented and requires separate approval.

The virtual arm still starts at six values of 2048. These are illustrative values,
not a robot-neutral position or a safe target. No new feature maps live readings
onto the illustration yet: doing so with invented offsets would suggest a calibrated
physical pose that we cannot substantiate. Simulation Reset never affects hardware.

## Stage 1: teacher passive inspection

Run the development app and open the footer's **Teacher: read-only reference
inspection** link, or `/commissioning.html` on the same local server. Close the
prototype and other serial apps first. Check anchoring, workspace clearance, and
physical cutoff access. Read the page's setup notice before connecting. Opening
USB can affect controller reset/startup; that physical behavior has not been
verified. Do not assume absence of application commands prevents firmware actions.

Click Connect read-only and choose the device through the browser's permission
dialog. The page uses the established 1,000,000 baud setting. It has no writer,
read-request command, torque command, mode change, homing, or movement button.
Do not force powered joints into a desired position.

The browser grants serial access through an explicit user gesture; the implementation
follows the [Chrome Web Serial connection and stream lifecycle guidance](https://developer.chrome.com/docs/capabilities/serial).
A same-origin exclusive lease is retained throughout the connection using
[Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/LockManager/request).
The lease coordinates this application, not other websites or desktop programs.

The inspector checks the exact passive packet layout. Abbreviated-only checksums
are counted but never become trusted reference readings. If that counter rises
while full-checksum readings remain absent, leave capture disabled and report the
result; do not weaken validation or switch firmware modes to get past it.

Record draft reference becomes available only after at least 10 accepted samples
over one second, no gap greater than 500 ms, no latest-reading age greater than
500 ms, and no joint spread over 12 raw units in the retained observation window.
At most 100 samples from the last two seconds are retained. These are conservative
draft observation rules, not commissioned freshness/stall/settling limits. Browser
arrival times cannot prove sensor sampling time, shaft accuracy, or physical rest.

Export the JSON if you want to keep the observation. It includes the latest six
reported values, time, sample count/range, and unknown calibration fields. It is
always marked unreviewed and carries no movement authority. It does not include
device IDs, teacher/student names, or raw byte logs. Downloads are local; no data
is uploaded. Reload discards the in-memory draft. Delete draft clears it explicitly.
After disconnect, historical drafts remain exportable, but live capture is disabled.

Disconnect, hidden page, read errors, navigation, or application errors invalidate
the observation window. Reconnect is explicit. Failed close leaves connection
controls blocked rather than reusing an uncertain session. Browser teardown is
best effort and Disconnect is not a physical stopping mechanism.

## Stage 2: build the physical mapping evidence

Before proposing a movement test, collect:

- The exported draft reference and whether full/abbreviated packet counts rose.
- A teacher description or photo of the current arm configuration, with the base,
  shoulder, elbow, wrist, and gripper identifiable; no student faces or identifiers.
- Confirmation of anchored base, accessible cutoff, cable routing, clear local
  movement region, and an unloaded gripper. Do not rearrange joints by force.
- Available manufacturer joint-limit, geometry, angle/raw-unit, and payload data.
  Missing information stays unknown rather than receiving generic limits.

From those facts, prepare a separate proposal for **one joint in one direction**.
The proposal must specify the observed starting value, teacher-reviewed local bounds,
the proposed raw increment, exact expected packet, observation deadline/tolerance,
and failure/cutoff procedure. Tiny increments can be indistinguishable from the
handoff's observed 5–9-unit residual error; never repeat commands to chase that error.

The proven factory packet template is:

```text
FF FF [servo ID] 05 03 2A [target low] [target high] [checksum]
```

For an encoding example only, servo 1 target 2520 produces
`FF FF 01 05 03 2A D8 09 EB`. This is **not** a proposed safe target or an instruction
to send it. We cannot finalize the test command or safe bounds before seeing the
reference and physical configuration. No calibration writer has been introduced.

Obtain approval of the completed command/test proposal before introducing or
executing that movement. One-axis mapping approval does not cover other joints,
reverse motion, gripper closing, multi-joint routes, or homing. Use teacher
observation to establish mapping and direction; raw position feedback alone cannot
tell us which part of the arm moved. Verify repeatability without assuming one
test establishes mechanical zero, full range, collision freedom, or angular scale.

## Stage 3: model and lesson-start profile

Only after the mapping/geometry work, create a reviewed robot-specific profile
containing reference pose, raw-to-angle transforms, allowed starting region, verified
joint/working limits, gripper conditions, and route constraints. A reference pose
is neither mechanical zero nor proof that the route to it is safe. Changes to the
arm, tool, base setup, or profile invalidate relevant review evidence.

The eventual connection flow reads the actual state without moving, then displays
the calibrated model. A lesson checks whether the measured state is in its approved
starting region. If not, execution is refused. A separately approved Move to lesson
start action may be offered only when a route and actual stop/hold behavior have
been established. It never runs on page load, connect, reconnect, or Reset Simulation.

Simulation can later reset to the profile's virtual lesson-start pose independently
of the physical arm. Draft observation files will not be accepted as commissioned
profiles or automatically imported into either backend.

## Verification and remaining limits

Automated checks use synthetic streams only. They verify consent timing, exclusive
ownership, connection cancellation, late-open cleanup, read failures, failed-close
lockout, reference freshness/drift gates, draft export/deletion, and weak-checksum
rejection. Mock ports throw if their writable stream is accessed. No real hardware
test has been performed by the agent. Real teacher-account/student-account USB
behavior, factory integrity mode, physical startup behavior, geometry, actual stop,
and movement calibration remain unverified.
