# Factory Action Group Editor investigation

Dev.36 follow-up: the retained endpoint-path comparison also conflicted with
timed frames when earlier targets remained in motion. Timed Home and pose
playback now records such observations without aborting. Target-range checks,
feedback/write guards and Stop remain active. See IMPLEMENTATION_NOTES.md.

Current follow-up (dev.35): the user requested factory-style arrival handling.
Saved poses and Home now send all six targets and advance after effective frame
time, without settling/accuracy gates. Profile caps remain 600/10; fresh measured
starts, range/path/freshness checks, and Stop remain. See IMPLEMENTATION_NOTES.md.
The investigation and earlier proposal below are historical.

Follow-up: the user approved implementation. Dev.33 adds timed pose frames with
per-joint speeds, cancellable separate writes and consistent J3 pose accuracy.
It retains the tested 600/10 envelope, extends infeasible durations, and still
requires measured settling as well as time. See IMPLEMENTATION_NOTES.md for the
final implementation and TEACHING_POSITIONS.md for testing. The investigation
below records the factory behavior and proposal that preceded that approval.

Investigated 2026-10-23 against the supplied NexArm.exe. This is static inspection:
the executable was not launched, no USB port was opened, and no robot command or
device setting was sent. Application motion behavior was not changed in this pass.

## Outcome

The factory's online action-group player is a timed frame sequencer. Our current
Blockly pose player is a feedback-gated joint-target sequencer. They send the same
basic servo-write layout but differ in speed calculation, acceleration selection,
inter-command spacing, scheduling and definition of completion. Factory playback
can continue with a residual position error because it does not require the
position tolerance that currently blocks our program.

The latest error exposes a specific defect in our dev.32 policy: J3 from 2811 to
2838 is a 27-unit request, so the >=100-travel condition selects ±12, not ±30.
The same actual position accepted after a large approach can fail when the next
pose requests a small correction to the identical target. That is an inconsistent
pose-arrival policy. It is not evidence of a malformed packet or a confirmed
physical stall, and our preceding tolerance change did not resolve this case.

## Provenance and reproduction

The supplied executable SHA-256 was rechecked and matches the earlier extraction:
`85405602fc2ca6f67dbfb9bb6bb9c0cd38f187f00d4fe7b9a55f33e833ea9fa1`.
Existing bounded marshal-reader output is in ignored `.analysis/nexarm-factory/`.
The added inspection helper prints Python 3.8 wordcode, constants, names and source
line metadata; it never imports or executes the extracted code.

```powershell
node scripts/disassemble-factory.mjs nexarm_qt.ui.servo_tab --list
node scripts/disassemble-factory.mjs nexarm_qt.ui.servo_tab '^(_run_thread|_calc_time_based_speed|_send_frame_preview|act_dl)$'
node scripts/disassemble-factory.mjs nexarm_qt.ui.servo_tab '^ServoControlWidget$'
node scripts/disassemble-factory.mjs nexarm_qt.comm_manager '^send_packet$'
```

This helper requires the locally extracted JSON and opcode table; it is not an
application dependency. Factory implementation is not bundled into app assets.
The line numbers below are original source metadata embedded in the bytecode,
not a claim to possess the original Python source or firmware.

## How the editor builds an action

`ServoTab._build_action_frame_from_ui` (line 685) stores a frame time and six
servo records containing `pos` and `acc`. Its list comprehension (line 688) reads
the UI's servo target and acceleration arrays. It does **not** store a speed for
each new frame. `_normalize_action_frame` (697) retains position and acceleration,
normalizes to six joints, and defaults missing values to position 2048 (or the
provided starting pose) and acceleration zero. It does not validate joint-specific
position ranges. Newly built frames use the current UI acceleration, initially 100;
imported/legacy frames can differ. Do not assume every frame uses 100.

The frame-time spinbox allows 10–10000 ms and defaults to 1000 ms. The normalization
helper also accepts zero time, which takes a special maximum-speed calculation.
Loop count allows 0–9999; zero means unbounded repetition. Those are factory
features, not proposed replacements for our bounded run budget.

Selecting a row calls `on_tree_select` (808), which loads that frame's values into
the UI and, unless an online run is active, starts `_send_frame_preview` in a
thread. **Selecting a factory row can physically preview the pose.** Highlighting
during playback uses `suppress_tree_preview` to avoid triggering another move.
Our row selection should remain an editing action unless preview is explicit.

## How online Run moves between frames

`act_run_online` (874) starts `_run_thread` (897). For each repetition:

1. `_get_actual_positions` (644) sends the system joint-position query (command
   65), waits for its event, and returns `latest_actual_positions`. If the event
   times out it still returns that cached list. This is not a strict fresh-data
   guarantee like the browser's passive feedback guard.
2. For each frame it reads `time` and each joint's `pos` and `acc`.
3. It computes a different speed for every joint from the starting vector and
   frame duration using `_calc_time_based_speed` (885):

   ```text
   distance = abs(int(target) - int(start))
   speed = int(distance * 1000 / float(frame_ms) * 1.2)   if frame_ms > 0
           3400                                      otherwise
   speed = clamp(speed, 10, 3400)
   ```

4. It sends a normal register-0x29 write to each ID in order **1,2,3,4,5,6**,
   including joints with little or zero requested travel. The data is
   `[0x29, acc, positionLo, positionHi, 0, 0, speedLo, speedHi]`.
   `CommManager.send_packet` (385) adds the same header, length and complement
   checksum used by our encoder. A transmit lock serializes each write. There is
   a **2 ms sleep after each servo write**, including the last one.
5. The loop replaces that joint's entry in its local starting vector with the
   **requested target**, not newly measured actual position.
6. After sending the frame it waits the frame's duration, checking its stop flag
   in 50 ms sleep increments. There is **no per-frame measured position-error
   test, three-sample settle gate, or arrival timeout** in this loop.
7. The next frame computes speeds from the preceding requested targets. At loop
   end it also copies this target-derived vector into `latest_actual_positions`.
   Later telemetry may overwrite it. Do not copy this target/measurement mixing.

The 1.2 multiplier is a scheduling factor in the code; it does not guarantee
simultaneous physical arrival. Acceleration, load and residual errors still affect
motion. `_send_frame_preview` (651) uses the same speed formula and 2 ms spacing,
then copies its target vector into the same cache; it does not supervise arrival.

For comparison, a 1000 ms factory frame calculates speed **32** for 2811 → 2838,
and **986** for 2016 → 2838. Our current program uses **600** for both. Our
program/pose acceleration is **10**, while a factory frame built from default
controls stores **100**. The speed 2000 displayed in the real-time panel is not
the independently chosen action-group speed. The exact frame data, rather than
that panel value, is needed for a matched comparison.

## Downloaded action groups are another path

`act_dl` (940) generates one system command **5** per stored frame, with:

```text
[groupId, totalFrames, frameNumberStartingAt1, 6, timeLo, timeHi,
 servoId, positionLo, positionHi, acceleration, speedLo, speedHi, ...]
```

It uses the same speed formula, updates a target-derived starting vector and
waits 150 ms between download records. The UI's board-run button sends system
command **3** with the group ID; erase is **23**, and board stop is **4**. These
are distinct from host-side online execution. Static host code cannot show the
board's internal interpolation, limits or stop implementation. No download, erase,
run-board, or new stop command should be introduced merely from this discovery.

## Which limits exist

The extracted `ServoControlWidget.SERVO_RANGES` (class line 46) defines UI ranges:

| Joint | Factory widget range | Our current operator-provided range |
| --- | --- | --- |
| J1 | 341–3755 | 900–3000 |
| J2 | 1195–2901 | 525–2600 |
| J3 | 1024–3072 | 2000–2900 |
| J4 | 683–3413 | 1250–3000 |
| J5 | 1024–3072 | 1024–3072 |
| J6 | 1024–2731 | 1024–2731 |

The slider and position spinbox apply those UI bounds. They are not proven motor
or firmware limits. Imported/action-frame values are normalized independently
without this joint-range validation. No per-frame reachability or collision
validation appears in the inspected online runner.

The constants also define read/write servo angle-limit commands **77/78**, plus
PID/minimum-force, overload and maximum-torque settings in the advanced tab.
Their existence does not reveal the current device settings or justify changing
them. The current action runner does not automatically tune those settings.
No persistent settings were read from or written to the robot in this investigation.

Our old observations around J3 3058–3060 and J4 3083–3084 are not proof of a
specific hard stop or 3072 clamp. In particular the factory J4 widget permits
targets above that plateau. A device setting, pose/load-dependent shortfall or
another cause remains possible. The latest target **2838** is inside both J3
UI/operator ranges, so **our joint range check is not blocking that request**.
Our small-move ±12 arrival condition is the immediate reason for this timeout.

## Comparison and next implementation proposal

| Behavior | Factory online actions | Current browser poses |
| --- | --- | --- |
| Motion parameter | Frame time, per-joint speed calculation | Fixed speed 600, acceleration 10 |
| Acceleration | Stored per joint/frame, default UI 100 | 10 |
| Joint dispatch | Six writes in ID order, 2 ms gaps | Needed joints in one concatenated write |
| Next frame | Frame duration elapsed | All commanded joints pass settling checks |
| J3 27-unit residual | No arrival gate to reject it | ±12 for a request under 100 units |
| Starting vector | Measured/cache at loop start, then prior targets | Fresh measured vector for every move |
| Goal bounds | Widget bounds; frames are not checked here | Whole live program checked before sending |

Recommended staged implementation, for review before new physical behavior:

1. **Make pose arrival consistent.** Define J3's pose accuracy independently of
   the last travel distance. An already stable J3 27 units from a pose with a
   30-unit allowance should be treated as already within that pose's tolerance,
   rather than commanded again and then faulted. Preserve meaningful small
   explicit joint/jog commands as a separate operation. Use the same accuracy
   policy in no-op planning, active settling and final pose validation.
2. **Add explicit timed pose frames**, with duration visible in Blockly, and a
   pure planner computing per-joint speeds from distance/duration. Keep actual
   measurements separate from targets. Use current operating bounds and a
   reviewed speed/acceleration envelope; do not silently adopt factory 3400 or
   acceleration 100. If a cap makes a requested duration impossible, extend the
   duration or explain the conflict instead of pretending it will finish in time.
3. **Match dispatch deliberately.** Compare separate existing packets with 2 ms
   spacing against our combined write. Keep one writer and cancellable dispatch;
   Stop during a partial frame must know exactly which joints were sent.
4. **Separate timing from accuracy in status.** “Frame time elapsed” is different
   from “measured target reached.” Choose the residual-error policy explicitly.
   Retain feedback integrity, path/deviation, range and cancellation checks;
   don't blindly replace them with the factory's timer-only progression.
5. **Use a short matched hardware comparison** with the same two in-range poses,
   actual frame time and acceleration, recording transmitted bytes and passive
   measurements. Compare online host playback first; onboard download is not
   needed for Blockly testing. Accept a behavior change only after its concrete
   plan and expected packets are reviewable by the operator.

This investigation establishes host-software behavior and explains why factory
playback can appear successful where our app reports failure. It does not prove
that the factory reaches every target accurately or diagnose the physical reason
for J3's residual error. More tolerance patches based only on move distance are
not the recommended path forward.
