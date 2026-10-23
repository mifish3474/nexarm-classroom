# Robot setup control testing: 0.7.0-dev.35

Home now uses a timed pose frame with individual calculated speeds, capped at
600 and acceleration 10. Its requested one-second duration is extended for
larger distances. All six targets are sent in ID order with at least 2 ms between
completed writes. Completion means frame time elapsed, matching factory online
actions. It does not require exact arrival or stable readings, and a shortfall
does not trigger a settling timeout. Inspect live readings and the physical pose.
No correction loop runs. Sliders and explicit small
jogs retain their existing behavior. Blockly saved-pose blocks expose the frame
duration; see [teaching positions](./TEACHING_POSITIONS.md).

Sliders, numeric moves and jogs use the operator-provided
[operating ranges](./OPERATING_RANGES.md). Stricter student policy remains future
work. An out-of-range measured position stays visible; choose an explicit
in-range target to return. Targets are rejected rather than silently clamped.

The setup controls remain available for commissioning and recovery. Students now
run Blockly independently on the main page after a session
Connect; see [classroom programming](./CLASSROOM_PROGRAMMING.md). There is
no per-program teacher review or approval action.

Current workflow:

1. Open /mapping.html, confirm dev.35, Connect and wait for fresh stable readings.
   There are no clearance/support checkboxes, Enable or holding-confirmation buttons.
2. Review the actual reading and target for one joint. Drag its slider to send
   live targets, or enter a numeric target and click Move. Slider defaults
   are factory speed 2000 / acceleration 100; both fields can be edited.
3. Test both directions, one joint at a time. Live updates send at most ten times
   per second; only the newest unsent target is retained. Releasing the slider
   leaves the final target in effect. A target that settles short is reported honestly
   and permits a new manual target; it is not called a successful arrival.
4. Test Stop during dragging, then wait for stable readings and choose a new
   action directly. Stop discards pending targets and never resumes them.
   Release/restore controls remain in Manual positioning.
5. Review clearance for all joints moving together, then click Return together
   to Home. Speed is now 600, doubled from 300, with acceleration still 10.
   Home values are unchanged. Shorter moves can finish first. Check Stop during
   an early return; it attempts holds for all commanded joints. Then wait for readings
   and let a return finish. Check the actual final pose and six readings.
6. Export diagnostics for unexpected behavior. Student live control remains off.

Fast direction changes now account for earlier targets sent during the same
unfinished movement. The 100-unit margin applies around that dispatched range;
an overwritten pending target does not expand it. Once the move settles, a new
move starts a fresh range. Tiny drag changes below 10 raw units are filtered;
release still sends the exact final target once.

For J2, observe whether vibration continues after releasing the slider with the
mouse stationary. The app sends no automatic corrective movements. Use Stop if
vibration persists and report whether the same behavior occurs in the factory
controller. Input filtering is not a confirmed cure for physical vibration.

Test S1 through S6 in sequence after Connect, allowing each move to
finish before selecting the next joint. The completed slider no longer blocks
another joint. Motion deviation margins are now 100 raw units for the moving
joint and companions, up from 20. Manual slider completion accepts that companion
variation; Home uses elapsed frame time. A movement fault cancels the operation
but leaves healthy USB connected. New stable readings allow a new explicit action.
An uncertain USB write requires reconnecting. No old movement resumes on recovery.

Release and Restore are one-click actions in Manual positioning. Continue to
support the arm physically; no checkbox is required. Restore waits for its write
and fresh stable positions, then makes controls ready. Torque is not measured.
Interrupted release persists across reload and needs an explicit Restore command.

Page hiding, disconnection, faults, and stale feedback discard unsent slider
targets. Fresh feedback never automatically restores a discarded target. Numeric
Move retains its half-second command interval. Other joints wait while the active
joint moves; Home sends all six targets together.

The remaining sections describe earlier versions and are historical.

**Current workflow:** Connect, confirm clearance, Enable, then use the +/-20
buttons or Return slowly to Home. Each command sets speed 100 raw units/second
and acceleration 10. Home sends one continuous target per joint, at most six
commands. Your Home remains `[2050,2150,2100,2200,2000,1080]`.

Buttons pause while a move finishes or readings are briefly unavailable; this
does not switch teacher controls off. A 500 ms command interval remains, with
no new capture window between moves. A prolonged feedback loss during movement
or unexpected deviation disarms with a visible reason. Stop attempts a hold at
the moving joint's freshly measured position and cancels remaining Home joints.
Verify stopping physically; use the cutoff if necessary. Reconfirm clearance
and Enable to continue. Test one +/-20 pair first, then try Home and Stop.

The speed and acceleration settings need physical teacher validation. Longer
movement deadlines depend on distance rather than the former two-second step
timeout. The sections below document the previous stepped implementation and
are historical; their step sizes, pacing, and capture waits no longer apply.

Jog recovery now allows presses about 500 ms apart after settled feedback,
without a fresh one-second capture after every jog. Initial Enable and manual/
fault recovery still need the longer observation. Home is still the earlier
paced route; see [the pending speed-control proposal](./SPEED_CONTROL_REVIEW.md).

The teacher requested reusable -20/+20 controls on every servo and a slow return
to a new Home pose. This explicitly replaces the one-attempt workflow for everyday
teacher jogging. It also authorizes base jogging and the new Home destination.
No assistant connection to or movement of real hardware has occurred.

Open **http://127.0.0.1:5173/mapping.html** and check the header version. The
simulator stays at `/`; the earlier commissioning suite is preserved at
`/mapping-tests.html`, with its older Reference A and existing approval records.
The root Connection Lab `index.html` v0.6.1 remains unchanged.

## Use and first physical check

1. Close the factory controller and other robot tabs. With the base secure,
   gripper empty, sweep clear, and physical cutoff accessible, click **Connect**.
   It sends no application command. Wait about one second for stable readings.
2. Confirm holding and clearance, then click **Enable teacher controls** once.
   There is no narrow start-pose gate, fixed starting window, or attempt counter.
3. Try one joint's **+20**, observe the actual movement and readings, then **-20**.
   Allow the buttons to become ready between clicks. Repeat on the other joints.
   Every click uses the latest actual position, so residual error means an out-
   and-back pair need not return to the identical raw reading.
4. Check the displayed Home values and the sweep for the displayed joint order.
   Click **Return slowly to Home**. Watch the arm and progress. Try **Stop motion**
   early in the first return to verify the workflow. Stop cancels future steps;
   it cannot recall a target already transmitted. Use the physical cutoff if
   immediate intervention is needed.
5. After inspecting the arm, check clearance and Enable again. USB stays connected.
   Click Home again to plan a new route from the current readings. There is no
   consumed-return lockout or automatic retry. Later, let a complete return finish
   and inspect the resulting pose and six readings.
6. **Disconnect** closes USB. Reload, disconnect, page hiding, or a fault disarms
   controls. Fresh readings and deliberate Enable are required to continue.

## Your Home

| Servo | Home raw value |
| --- | ---: |
| 1 | 2050 |
| 2 | 2150 |
| 3 | 2100 |
| 4 | 2200 |
| 5 | 2000 |
| 6 | 1080 |

These constants are defined once in `TeacherControlPlan.ts`. They persist through
reload/build and do not send any calibration, reset, midpoint, or factory-home
command. The earlier Reference A is preserved separately as historical evidence.

Home order is **2, 3, 4, 5, 1, 6**, one joint at a time, retaining the earlier
commissioning order. Review the physical sweep for this starting pose. This is a
sequential raw-position route, not collision-aware or Cartesian planning.

Home freezes a finite route at the click: evenly spaced target increments of at
most **10 raw units**, at least **1200 ms between completed writes**, settled
feedback before advancing, and no new command more than **20 raw units from
actual readback**. Up to nine units of lag fit within that last limit. The page
shows step count and an approximate duration before starting; a large gripper
change can take about two minutes by itself.

This paces the overall return. The existing factory goal-position packet does
not set per-movement velocity. No unverified speed/acceleration register or
coordinate command is introduced. The firmware still controls each small step's
speed, so physical speed and suitability need teacher observation.

Joints already within **9 raw units** of Home are skipped. Final readings must
all be within nine; there is no correction loop to eliminate ordinary residual
error. A second Home click at that pose sends nothing. Completion reports the
feedback tolerance, not exact angular or mechanical alignment.

## Responsiveness and recovery

All new jog, Home, and release/restore commands use one guarded writer in
`TeacherRobotControl.ts`, with the same exclusive USB lease as the passive and
earlier commissioning pages. There is no click queue: extra clicks during a write,
feedback wait, or Home run are rejected. Holding a keyboard key does not request
repeated jogs. Jogging requires the next stable observation window and at least
500 ms since the last write for settled jogging; Home enforces its longer
1200 ms interval. Manual holding operations retain a 900 ms minimum.

Full-checksum passive telemetry, six valid integer readings, freshness within
500 ms, and initial/post-action stability remain required. Commands use the
proven single-servo goal-position packet. Jog requests are restricted to +/-20,
servo IDs 1-6, and encodable targets 0-4095; the latter is protocol validity,
not a verified mechanical travel range. The teacher controls physical clearance.
There are no inherited Reference A bounds on these controls.

Each step requires three settled readings across at least 200 ms, spread at
most three, with target error at most nine. Unexpected companion drift above
12, excessive selected-joint deviation, a telemetry gap, or a two-second
write/settling deadline cancels the rest and disarms. A fault leaves a healthy
read connection open so inspection and fresh stable data can support a deliberate
Enable. No motion automatically resumes when data returns. An unresolved write
blocks rearming; disconnect retains the exclusive lease until pending work and
port cleanup finish. Late completions cannot restart canceled work.

## Optional manual positioning and privacy

The collapsed manual section retains the factory All Off/All On commands. Support
the arm, confirm clear pinch areas, and click **Release all servos**. After placing
it gently and allowing readings to settle, click **Restore servo holding** and
physically check the result. Confirm holding separately, then Enable movement.
The teacher's prior observation supports this workflow; software does not measure
torque. Interrupted setup persists in the existing local holding interlock across
reload or navigation. If the factory app restored holding externally, reconnect
and physically confirm it here without a redundant holding command.

No old approval marker is erased or renewed. New direct controls do not consult
those one-shot markers. Optional session export contains the Home target, planned
routes and completion state, latest readings, up to 100 previous operations, and
manual-positioning history. Session movement reports are memory-only until export;
the holding interlock remains local storage. No login, identifiers, upload, new
dependency, or external runtime request is added. Student live execution remains
unimplemented; the simulator never accesses USB.

Automated verification uses synthetic USB streams and Chrome's simulated clock:
all six reusable +/-20 paths, all-joint and long gripper Home returns, positive
and negative residual errors, pacing, Stop/re-enable, stale/weak feedback,
write failures and hangs, late completion, manual interlocks, reload, small-screen
layout, and local export. Hardware speed, clearance, force, and stopping behavior
remain physical teacher checks.
