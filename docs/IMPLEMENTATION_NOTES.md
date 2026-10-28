# Classroom programming development preview 0.7.0-dev.55

## Restore the hardware-tested release gate

The operator reports dev.54 still holds the servos while displaying a successful
release write and no error. That evidence means the browser write path completed;
it does not establish device execution. The zero-gap change is reverted to the
dev.53 gate: hold write completion, then three new strong-checksum samples over
at least 150 ms with spread <=9 on each joint, within a two-second window. Stop/
Space and setup Stop motion retain integration and fast hold priority. The exact
firmware/timing cause remains unconfirmed; no experimental packets or retries are
sent automatically. Earlier dev.54 timing assertions below are superseded.

The UI and sequence diagnostic now say Release sent, not Released, and explicitly
mark physicalReleaseVerified=false. Manual All Off can be explicitly retried from
Manual setup, without sending All On or a new joint goal. The durable interlock,
feedback/write gates and Restore-before-Run workflow remain. Reload recovery is
unchanged. Retry is idempotent at the command level, not proof of a physical effect.

Browser regression models now distinguish a successful host write from device
execution: one modeled controller ignores All Off too close to the hold batch;
another ignores the first release write. Tests check the real simulated holding
state, command spacing and explicit retry, not just the page's status label.

Validation: build/type-check and all 361 unit tests pass. All 59 classroom/setup
browser cases pass across the regression and targeted timing-assertion update;
the targeted run also passes layout and read-only diagnostic/version checks.
The device-busy/ignored-command cases are models, not measurements or proof of
the installed firmware's cause. No physical robot was commanded. Hardware
verification of the restored integrated sequence is still required.

## Operator Stop integrates prompt release

After confirming the dev.53 experiment physically works, the operator requested
less delay and integration into Stop. Main-page Stop and trusted Space now
select stopThenRelease, as does setup Stop motion. Their sequence cancels the
worker/program/key handlers, sends the six-joint 600/100 hold with writer priority,
then sends factory All Off directly from the hold stream-completion callback.
The former three-sample/150-ms settling gate is removed; fresh feedback <=500 ms,
connection/generation checks, writer deadlines and durable holding recovery remain.
USB completion is not physical standstill; the changed interval needs observation.

The separate experiment control and its styles are removed. The controller's
hold-only stop remains the lifecycle-cancellation path for blur/hidden/disconnect
and error cleanup; those actions do not add release. New faults cancel an unsent
release. Explicit Stop can follow an earlier motion fault when the current hold
and communication succeed, while failed/uncertain delivery never authorizes off.
Release-unavailable cases still cancel the program and attempt a hold where
possible; Stop must not become a no-op because its release precondition fails.

Repeated operator Stop coalesces an active sequence and does not cancel or
duplicate release. Already-released holding keeps its ordinary Restore workflow.
Restore is deliberate and never resumes blocks/keys. Diagnostics replace the
removed steady samples with hold-write-finished time and an explicit
immediately-after-hold-write policy. Ordinary movement/firmware/ranges are unchanged.

Earlier dev.53/52 sections below describe the preceding development stages.

Validation: build/type-check and all 359 unit tests pass. All 57 classroom/setup
browser scenarios pass across the regression and targeted assertion update;
the final five-case run also passes the layout and read-only diagnostic checks.
Unit coverage verifies release at the same clock instant as hold completion,
writer ordering, no new-feedback/settling wait, lifecycle/failure cancellation,
motion-fault recovery, repeated Stop coalescing and already-released behavior.
No physical robot was connected; the shorter interval needs operator observation.

## Explicit stop-then-release experiment

The operator confirms the faster hold dramatically improved stopping and asks
to test release afterward. A separate Positions button cancels preparation/key
events/programs and requests a six-joint 600/100 hold. Ordinary Stop and Space
retain holding and cancel an active experiment; neither selects release.

StopRelease owns a single generation-bound sequence. After its hold write
resolves, it collects three new strong-checksum position reports over at least
150 ms, with spread <=9 on every joint. Earlier/in-flight/weak frames cannot
authorize release. Within a two-second post-write window, these criteria permit
one factory All Off write through the existing serialized writer, bypassing the
normal command interval. The ordinary ManualPositioning recovery interlock is
persisted before All Off. Steady readings do not prove physical standstill.

The sequence blocks Run, manual motion and ordinary release/restore while active.
Stale feedback, timeout, faults, disconnect or visibility/focus loss cancel an
unsent release without retry. Space/Stop also cancel it. An already submitted
release cannot be recalled; interruption retains Recovery required and never
restores torque automatically. Explicit Restore follows the existing fresh
feedback workflow, with no new teacher approval, Enable or confirmation steps.

The shared controller exports the latest test phase, hold reference, three
selected samples and release timestamps. Main-page status shows intermediate
phases and the normal holding recovery UI afterward. No new firmware commands,
movement profiles, background release, physical stop verification or automatic
restart are introduced. See SIGNAL_AND_STOP.md for the supported-arm check.

Validation: build/type-check and all 356 unit tests pass. The full 76-scenario
Chrome regression passes with mocked USB, followed by the five targeted release
and layout checks after the final guard/text refinement. Coverage includes
ordered hold/steady-feedback/All Off, delayed writers, weak/stale/moving readings,
Stop/focus/disconnect cancellation, durable storage failure, unavailable Release
writer, interrupted release/reload, and explicit Restore without auto-resume.
Root index.html is unchanged. The operator's hardware observation is still
required for the combined stopping and release response; no robot was connected
or commanded during these automated checks.

## Operator-approved priority fast-stop test

Stop now sends its measured-position hold at speed 600 / acceleration 100;
ordinary motion settings are unchanged. Stop still cancels worker/event/program
execution immediately and never requests torque-off or holding restoration.
If a stream write is active, one coalesced pending stop owns priority after that
write resolves. Route generations prevent the original completion callback from
dispatching another target. The hold samples current readings when it is sent,
not when Stop was first pressed, and bypasses ordinary command pacing.

Pending Stop blocks Run/manual/holding actions. The request cannot outlive the
original write's existing two-second deadline, and a failed write, expired wait,
stale feedback at send time, connection teardown or manual holding interlock
prevents a later hold replay. A failed/late stop write gates movement through the
delivery-uncertain interlock even after another Stop invalidates route callbacks.
No hold is sent after an interrupted Release/Restore. Connection closure cancels
an unsent pending hold; it does not promise to deliver it after disconnect.

The shared classroom/sliders controller reports up to 20 stop attempts with
request/submission/completion times, fresh target readings and feedback age, and
at most 40 post-stop feedback observations over two seconds. Readings and stream
completion do not prove physical stopping, holding force or pinch protection.
The classroom run-status area displays the live Stop result rather than masking
it with the prior program's generic Stopped message. See SIGNAL_AND_STOP.md for
the hardware test and diagnostic export procedure.

Validation: build/type-check and 343 unit tests pass. All 53 classroom/setup
browser scenarios pass across the regression and targeted assertion update;
three additional offline/layout/read-only diagnostic checks pass. New coverage
exercises immediate 600/100 holds, pending-writer ordering, newest readings,
duplicate Stop, stale/expired/rejected writes, disconnect and Release races,
repeated-Stop failure reporting, timing/feedback export, and no resumed blocks.
Root index.html is unchanged. All USB/servo tests are mocked; physical stopping
time and the sharper hold response require the operator's hardware observation.

## Signal tower and dedicated Space stop

The coding page shows a local SVG signal tower with slow green pulsing for active
programs/Home/Wait or manual pose movement, amber for key listening/preparation
or holding attention, red for Stop requested/fault, and gray otherwise. Text
labels distinguish activity states; reduced-motion preference disables pulsing.
It indicates software state, never torque, clearance or confirmed standstill.

A trusted capturing Space keydown precedes editor and programmable-key dispatch.
It cancels the worker/session and key handlers and invokes the unchanged
TeacherRobotControl.stop position-hold path. It works while busy or listening,
including fields/menus and modifiers, and on non-text controls while connected.
Idle text entry retains spaces. Held Space suppresses repeats and new Run/manual
UI actions; its consumed keyup cannot activate a focused button or restart code.
No torque-off, restore, new movement profile or firmware operation was added.
The existing Stop limitation remains: an in-flight/unavailable writer or stale
feedback can prevent its measured-position hold; physical cutoff is independent.

Space is excluded from executable event keys and Blockly options. Import alone
permits legacy Space/unassigned hats as non-executable `unassigned` placeholders,
preserving their bodies and pose snapshots. Compile/Check/Run/Save reject them
with a correction; reassignment is explicit. Newly added hats use A. File formats
remain 1/2/3, and loading never enables control. See SIGNAL_AND_STOP.md for checks.

Validation: build/type-check and 332 unit tests pass; the full 71-scenario Chrome
regression passes using mocked USB. Space coverage includes Home, waits, moving
sequences, fields, held/released keys, a focused Run button, and cancellation
before a delayed worker can start motion. File reassignment, signal transitions,
reduced-motion styling and five screen sizes pass. Root index.html is unchanged;
the controller implementation and its built bundle are unchanged. No physical
robot, firmware operation or hardware stopping-time measurement was used.

## Keyboard event stacks

Events supplies a separate When key pressed hat for arrows, letters and
digits. compileProject allows one startup and up to 16 distinct key stacks;
quick-add targets a selected hat. All handler expressions and targets are checked
before any startup movement or event activation. Startup can be empty. Each
accepted key reuses the original handler instructions with the unchanged
Home-first controller; cached preparation results provide UI feedback, and the
controller independently evaluates/validates on every invocation.

KeyboardEvents accepts one trusted physical keydown per release, only after Run.
It rejects modifiers, composition, typing/editing contexts and untrusted synthetic
keys; busy/unready presses are dropped. There is no queue or concurrent runner.
Stop, edits, pose-library changes, loading/replacing code, manual positioning,
faults, disconnect and focus loss end listening. Editing is caught synchronously
before mutation as well as through Blockly change events, avoiding its deferred
event window. Focus loss cancels pending keyboard preparation or stops a running
session. Session/generation checks prevent late worker results rearming events.

Handlers have independent fresh variable environments. Startup values and prior
keypress results are not shared. This preserves bounded full preflight and makes
the trigger reusable for future function-call instructions. No functions, live
sensors, persistent event state, motion settings or new firmware commands are
included. Event activation is ordinary Run, with no teacher-approval/Enable step.

ProgramProject validates/copies all stacks, limits keys/variables/source size,
and rejects duplicate keys or source IDs. Files with hats use format 3; hat-free
programs retain format 2; formats 1/2/3 load atomically. Key choices and poses
persist, but active/held-key state never does. The legacy instruction-only loader
rejects format 3 rather than silently dropping events. No global keyboard hook,
keyboard logging, network service, or physical robot was used in verification.

Validation: build/type-check and 328 unit tests pass. All 65 scenarios in the full
browser regression pass with mocked USB, plus the added targeted release/restore
keyboard-cancellation scenario. Coverage includes visible hat creation/quick-add,
startup preflight, trusted presses, held/busy/typing/modifier filtering, Stop,
fault/focus recovery and format-3 pose snapshot round-trips. Root index.html is
unchanged; no physical robot or firmware operation was used.

## Phase 1: variables, math and conditionals

The toolbox uses Blockly's standard numeric/logic/variable/if blocks, with a
whitelisted compiler into data-only expressions and instructions. Motion fields
are numeric value connections with default number shadows, so legacy numeric
programs retain their values and keyboard editing. Five categories replace the
short flyout; palettes close for new/loaded programs to keep code unobscured.
Quick-add includes if/else and Set/Change, and serialization append explicitly
records Undo as one grouped create/connect action.

ProgramLanguage validates every branch's structure and copies only allowed
fields. A fresh case-insensitive numeric variable environment evaluates bounded
loops and selected branches into the existing movement plan. It allows 32 used
variables, 12 nesting levels, 1,000 structural visits, 10,000 evaluation visits,
and the existing 100 expanded movement/wait steps and 60-second duration budget.
Unsupported operations/XYZ are rejected even in unused branches. Undefined values,
division by zero, invalid computed counts/targets and nonfinite results fail
before movement. Decimal-duration normalization is limited to 1e-6 ms floating
noise around tenth-second values; real offsets are rejected, not clamped.

Check program is worker-backed and never touches USB. It may evaluate a
calculation-only program; Run still requires an action on its selected path and
does not move Home for calculation-only input. Prepared final variable values
are labeled as non-live and cleared on editing. The UI validates all prepared
joint/pose targets against the current operating ranges before asking the
existing controller to run; the controller independently prepares and validates
again. Preparation errors carry source block IDs through the worker for highlight.

Files now write schemaVersion 2, preserving the expression/conditional tree and
used variable names; versions 1 and 2 load through the same atomic validation.
The byte/size limits, data-only policy, local snapshots, no-auto-connect/run
behavior and invalid-file preservation remain. Unused variable names are omitted;
partially invalid programs still need fixing before Save. No functions, sensor
conditions, custom firmware, speeds, joint limits, Home/holding or protocol changes
are introduced. See VARIABLES_AND_LOGIC.md for the first no-hardware exercise.

Validation: production build/type-check and all 315 unit tests pass. The complete
57-scenario browser regression passed with mocked USB, followed by the added
visible-interface variable creation/Set/Change/if test and focused reruns after
the final toolbox/menu/result-clearing adjustments. No physical robot was
connected for validation. The root Connection Lab file still matches its committed
hash. Keyboard-only construction/reordering, in-progress autosave and broader
student usability studies remain future work.

## Workspace usability pass

The programming page now opens directly into Blockly. A persistent header groups
File, Undo/Redo, connection and Run/Stop, with one primary activity message and
a Home-first cue. The Robot/Positions inspector scrolls independently on desktop;
narrow layouts stack it below code while keeping the header visible. Workspace
styles are scoped in `workspace.css`; setup/diagnostic styles are unchanged.

Positions groups release/restore, six current values/ranges, naming and recording.
Holding buttons remain accessible while its panel scrolls, and interrupted/released
state stays visible in the footer when switching tabs. Saved rows have Add to code;
joint values and the separate explicit Move to position/Delete actions are in
details. Add to code only edits Blockly and is disabled during movement. File
contains local Save/Load, New and examples; Help & tools contains diagnostic links.

New sessions start with one When Run clicked block. The flyout groups Motion and
Control; append actions group their create/connect events into one Undo step.
Replacing the whole program clears edit history so Undo cannot cross project-file
position namespaces. Menu keyboard focus, Escape, inspector arrow keys, and
disabled-action explanations retain ordinary browser semantics. A focusout bug
that closed menus before the next control received focus and Blockly flyout
stacking over the Add block menu were corrected during browser verification.

This pass changes presentation and editing only. The motion controller, speeds,
acceleration, ranges, target checks, Home-first startup, release/restore protocol,
and program-file schema are unchanged from dev.47. The root Connection Lab file
matches its committed hash. Factory firmware only; simulator/XYZ remain hidden
or retired. No hardware was used in automated verification. Project naming,
autosave, position rename/update and destructive-edit recovery are still deferred.

Validation: production build/type-check and 298 unit tests pass. Browser coverage
includes five viewport sizes, persistent Stop, menu/tab keyboard handling, atomic
Undo/Redo, Add to code without USB writes, file compatibility, timed pose playback,
Home-first startup, Stop/recovery and teaching. See CLASSROOM_PROGRAMMING.md for
the current UI locations and testing steps.

## Current direction: joints and saved joint positions; factory firmware only

The operator has retired XYZ programming and ruled out custom ESP32/AT32 firmware.
Blockly now offers joint moves, saved six-joint positions, Wait and Repeat. The
XYZ add button, coordinate fields and programming-page coordinate readout are
removed. Interpreter, program-file loading/saving and the live executor reject
legacy XYZ instructions with an explanation, including XYZ nested inside loops,
before any Home, calculation or movement write. Invalid imports leave the
existing workspace intact. No coordinate block is silently dropped or converted.
The live writer also rejects both calculation (7) and native movement (8) packets.

Joint/pose execution, Home-first startup, holding controls, operating ranges and
local saved-position files retain their existing behavior. Passive coordinate
telemetry remains available only in setup/diagnostic data; historical codecs and
research notes are retained. Firmware observer artifacts are historical and must
not be installed again. No hardware command or firmware operation is part of
this change. The root Connection Lab index.html remains unchanged.

Validation: production build/type-check and all 298 unit tests pass. Fifty browser
scenarios pass with mocked hardware (49 in the full run, plus the new legacy-XYZ
import case rerun after correcting its selector to exclude Blockly's trash flyout).
Coverage retains Home-first Run, six-joint saved-position playback, joint programs,
Wait/Repeat, local save/load, Stop/recovery and rejection of old XYZ files without
replacing the current editor. No physical robot was connected for these checks.

## Completed observer experiment; original firmware restored

The operator approved the supported-arm observer installation/captures/restore
on COM17 and confirmed stationarity before the J1 read. Passive and J1 captures
contain only valid AT32 ID0x5A/function11 position broadcasts: 240/300 bytes,
eight/ten frames, no individual-servo replies or observed UART/omission errors.
This confirms the installed ESP32 response filter is not the only barrier; it
does not identify the downstream cause or establish load/pinch protection.

The original full application slot was restored and independently digest-checked.
The first 64 KiB, including bootloader/partition/NVS/OTA, matched its pre-test copy
before factory restart. Original 1.0.2/1.0.2 and 25 position reports were confirmed
at the existing factory USB rate of 1,000,000 baud; COM17 is closed. No motion or
servo-setting command was sent. SERVO_OBSERVER_RESULTS.md records scope, artifacts
and limitations. The observer is no longer installed and the app remains dev.46.

## Prepared observer experiment: offline build and recovery review

SERVO_OBSERVER_REVIEW.md describes the frozen, not-installed diagnostic and the
application-only recovery procedure. The source records incoming UART bytes and
permits only explicitly requested position reads. It has no motion/torque/settings
encoder and sends no downstream packet at startup. It replaces standard Arduino
startup, which can erase NVS, and links refusing guards for nine flash-write/erase
APIs, including the SDK crash-dump path. Offline build/symbol audit and six
recovery-file validation tests pass. Runtime behavior and restoration are not yet
hardware-tested; installing/restarting still requires separate operator approval
and independent arm support. No robot connection/reset/write occurred this phase.
The classroom app and its version remain unchanged.

## Approved backup: reply filter confirmed in installed firmware

With explicit operator approval and COM17 freed, two complete 4 MiB ESP32 flash
copies were read and matched byte-for-byte. The first failed port-open attempt
created no backup; its native-stderr logging issue is corrected in the helper.
The bootloader matches the public download, but the installed application differs.
Offline disassembly of the actual backup confirms that individual-servo requests
are forwarded and replies with servo IDs1–6 are discarded by its receive path.
This confirms a return-path barrier, not whether the downstream servos replied.

Backups/logs remain in ignored .analysis; private settings/contents were not
printed or uploaded. No firmware was written, no torque/motion command was sent,
and the ESP32 remains in bootloader mode as approved. Restoration has not been
tested. Full provenance, hashes, installed addresses and next diagnostic scope
are in INDEPENDENT_SAFETY_INVESTIGATION.md. No app change/version bump this phase.

## Offline follow-up: public firmware reply filter and backup preparation

The dev.46 raw capture contains no hidden servo replies. Offline disassembly of
the public factory image now confirms forwarding of ID1–6 requests and a receive
path that discards replies under those IDs. Installed-image equivalence and
downstream AT32 response behavior remain unverified. The public recovery image
does not contain a full device backup, and the recovery guide includes an erase.
See INDEPENDENT_SAFETY_INVESTIGATION.md for addresses, hashes and confidence.

Prepared scripts/backup-nexarm-controller.ps1 defaults to a no-port/no-file plan.
Actual execution requires a separately approved, supported-arm bootloader reset;
it reads ESP32 flash twice and compares hashes, with no flash writes or erase.
Only the plan and host-tool help were exercised. No robot connection/reset,
application change or version bump was made in this follow-up.

## Current update: independent USB-only investigation and bounded raw capture

The operator wants independent progress and has only the robot/USB cable. Static
review of newly located manufacturer source examples found a response callback
that accepts only AT32 system ID0x5A, plus register definitions materially different
from the generic servo SDK. These are architectural clues, not proof of the
installed factory image's exact implementation. Public factory firmware was
downloaded for static inspection only; no program was run, compiled or flashed.
Provenance, source hashes, confidence and next decisions are recorded in
INDEPENDENT_SAFETY_INVESTIGATION.md. A vendor response is not a work dependency.

Dev.46 keeps exactly the dev.45 read whitelist and timings, adding raw serial
RX capture before the parser while the explicit scan is active. This can reveal
unrecognized framing/text/checksum data absent from parsed-only exports. Buffers
are bounded to 64 KiB and 1,024 chunks with omission counters. Capture is in-memory,
exported explicitly, begins only at Start and ends at cancellation/completion.
The parser is reset at Start so old partial frames cannot complete a diagnostic
reply. No raw byte stream can authorize movement or decoded results. Snapshot
counters do not copy the entire raw buffer during each UI refresh.

The export includes timestamp/context/hex chunks and notes that pending-read
context is not response identity. Raw serial content might include controller
debug text; the page explicitly discloses this and asks for review before sharing.
It does not request USB identifiers, store data persistently or upload anything.
There are no additional robot packets, settings, modes, reset or movement changes.

Validation: build/type-check and all 308 unit tests pass. New regressions cover
unparsed data without inferred readings, pre-start partial-frame isolation,
capture cancellation, both memory bounds and detached exports. Targeted browser
checks exercise export, privacy boundaries and the unchanged read-only workflow.

## Previous update: adapt read-only diagnostics to the actual USB interface (dev.45)

The operator's completed 2026-10-27 dev.44 export contains 19 issued requests,
19 timeouts and 12 deliberately skipped repeat samples. Live fully checked
passive positions continued; no direct-servo identity, configuration or status
response was captured. No load/current/fault values can be inferred from that.
The one relevant rejected frame is a valid ID255/function1 reply with six bytes
`01 00 02 01 00 02`. Our initial one/three-byte version decoder incorrectly
excluded it. Static factory CommManager.handle_packet explicitly decodes the
first triplet as ESP32 version and the next triplet as AT32, both 1.0.2 here.
This proves version-query communication works; it does not identify servo firmware.

Dev.45 accepts and displays that captured controller layout. It adds only the
factory's fixed read-only overload (71) and maximum-torque (75) queries, each
with one servo-ID byte. Static read_overload/read_max_torque and corresponding
reply handlers verify the packet forms. Neither adjacent write opcode 72/76 is
whitelisted. Replies require full checksum, expected function and payload servo
ID; overload layouts are exactly three/four bytes and max torque exactly three.
Omitted overload threshold remains null; a zero torque reading remains raw with
unverified meaning. No settings or motion behavior are changed.

The scan now prioritizes the factory API, then tests short direct position reads
at 0x38/count2 before attempting broad raw blocks. No short-position reply skips
the broader reads for that joint, without reclassifying the timeout as zero or
claiming unsupported hardware. Maximum plan is 49 requests; with no direct
position replies it sends only 19 and skips 30 broad reads. Relevant raw frames
and canceled/late-response protections are retained. One misleading timeout note
is corrected: unrelated pose traffic crossing a deadline is not a late register
reply. No automatic retries or alternative communication/torque modes are added.

Read-only scope remains explicitly authorized. The new hardware scan still
requires the operator's click/port selection; the assistant did not issue robot
commands. If factory reads work, that establishes configuration access only.
Live fault/load/current access remains unresolved; do not build pinch protection
on position feedback or timeout counts alone.

Validation: build/type-check and all 304 unit tests pass, including the captured
six-byte version, three-/four-byte overload parsing, missing-threshold and zero
semantics, wrong-servo/function/weak replies and the factory-only transport case.

## Previous update: isolated read-only servo diagnostic page (dev.44)

The operator authorized the read-only diagnostic milestone. A separate
`/servo-diagnostics.html` entry, linked in the classroom footer, connects under
the existing exclusive USB lease but sends nothing until Read diagnostics.
ServoDiagnosticSession has no motion/torque/configuration encoder or access to
the classroom motion controller. An independent transport whitelist permits
only the fixed firmware query and servo READ packets defined in
ServoDiagnosticProtocol. There is no arbitrary-register UI or automatic fallback
to a settings write, alternate mode, servo enable or firmware change.

The scan has a maximum of 31 one-at-a-time requests: controller version, six
identity blocks, six raw configuration blocks and three status snapshots per
joint. It enforces reply/write deadlines and gaps, cancels on Stop/disconnect/
hidden page/write faults, and cannot resume from late callbacks. After a read
timeout it skips subsequent samples with the same servo/layout correlation key.
It permits one scan per connection to avoid mixing delayed replies across scans;
reconnect starts no new scan and requires no review or confirmation checkbox.

The page distinguishes missing data, device error bytes, weak/mismatched frames,
all-zero data and received observations. No timeout becomes a numeric zero.
Identity model codes are unmapped. Current/load/protection fields are provisional
raw interpretations, not verified units, enabled-state assertions or a safe-use
rating. The existing documentation conflicts remain open. Passive position
feedback is separate from requested diagnostic data. All data stays in memory
until explicit JSON export; no hardware identifiers, settings storage or uploads.

The exported format is nexarm-read-only-servo-diagnostics / schema1. It retains
request bytes, response payloads, outcome/error byte, timestamps, provisional
decoded fields and bounded relevant rejected replies. The full guide and
operator test steps are in READ_ONLY_SERVO_DIAGNOSTICS.md. No actual hardware
scan was performed by the assistant. Existing motion behavior is unchanged.

Validation: build/type-check and all 302 unit tests pass, including whitelist
injection, bounded scans, device errors, weak/mismatched replies, timeouts,
late-response quarantine, export isolation, USB contention and cancellation.
All 51 Chrome browser checks pass with mocked serial ports, including four new
diagnostic-page checks. Unexpected bridge envelopes are preserved separately
for failed-read investigation; known continuous pose chatter is excluded from
that bounded reply history. An added unit regression verifies this distinction.

## Previous update: captured all-zero controller result (dev.43)

The current session export confirms four command-7 requests and no movement
writes. Replies 1–3 have full checksums, matching coordinate fields and valid
targets within OperatingRanges:

| Block | Calculated J1–J6 |
| --- | --- |
| 1 | 2000, 2188, 2089, 2229, 2059, 1058 |
| 2 | 1918, 1103, 2807, 2808, 2037, 1070 |
| 3 | 1917, 1102, 2806, 2815, 2037, 1536 |

Block 4 is correctly encoded as P=-752 (tenths), X294/Y59/Z243, R-1/C-45,
time 2000. Its fully checked ID255/command7 response arrives about 22 ms after
sending with ALL 24 data bytes zero: no usable tool pose or joint solution.
This is not missing USB support, an input-bound rejection, an ordinary rounding
mismatch or an application joint-limit rejection. The reason the controller
returns zeros remains unresolved; this does not prove physical impossibility.

Dev.43 recognizes that exact all-zero response after validating frame ID,
command, checksum and length, and immediately cancels preparation with a clear
no-usable-solution message. It does not wait two seconds, retry, skip or alter
the destination, change limits, move Home or use native 8. Other mismatched
frames retain existing rejection logic. No physical movement behavior is added.

The existing alternative is a recorded joint-pose block, which can be mixed
with XYZ blocks. Investigating the coordinate mismatch needs measured J1–J6
from the same stationary recorded pose alongside its LCD values. The program
file contains coordinates only; those measurements cannot be reconstructed.
Do not invent targets or copy zero values into a position.

Validation: build/type-check and all 290 unit tests pass. Regressions use the
three captured successful payloads, the exact fourth request and empty reply,
and immediate cancellation without Home/program movement or retries.

## Previous update: identify missing versus rejected coordinate calculations (dev.42)

The operator's ten-destination program uses valid input fields and reaches
calculation block 4 before timing out. Its fourth target is X294/Y59/Z243,
P-75.2/R-1/C-45, duration 2000 ms. Progress through earlier blocks establishes
that calculation-only replies can work on this setup; the old blanket suggestion
that firmware may not support calculation is not a diagnosis of this failure.

Dev.42 reports the failing expanded block number and all requested coordinates,
distinguishes no parsed command-7 reply from rejected replies, and names rejection
reasons: ID, checksum strength, payload length, exact coordinate mismatches or
invalid raw target encoding. Mismatched values are shown as requested/replied
numbers with pitch in degrees. Diagnostics retain lastCoordinateCalculation with
the target, block, send time, received reply count and last rejection, in addition
to the bounded raw calculation-reply history and accepted calculations.

No checksum, pose matching, joint limits, timeout, Home-first logic or movement
behavior is relaxed. Exact pose matching is still an implementation requirement;
we need actual rejected reply data before deciding whether firmware rounding or
another interpretation calls for a protocol change. Lack of a reply does not prove
unreachability. Export the existing session before refresh; no hazardous repeat is
needed. The old October 23 diagnostic files do not describe this new session.

Validation: build/type-check and all 288 unit tests pass. A regression models the
first four supplied targets, accepts the first three, and checks that block 4's
missing result produces an exact diagnostic without Home or program movement.
An example 0.1-degree pitch mismatch is explained but remains rejected. Physical
cause of this timeout is unresolved pending the session diagnostic export.

## Current update: Home-first Run

The operator explicitly approved validating destinations, returning to the
established Home, then executing the blocks. Every Run uses this sequence by
default, including joint-only and wait programs. All target validation and
calculation-only XYZ preflight finish before any Home movement. Invalid targets
cause no movement. An out-of-range starting pose no longer blocks coordinate
preparation: an accepted plan first returns to Home through TimedPoseMotion.
Home is `[2050,2150,2100,2200,2000,1080]`; XYZ destination limits remain exact.

Home uses a one-second requested frame, extended for the tested 600 speed cap /
acceleration 10, all six targets and existing write spacing. Already within 40
raw units of Home on every joint skips the redundant return. Otherwise, after
the return frame elapses, the controller waits up to two seconds for fresh
readings within that tolerance. A Home shortfall faults without starting blocks
or retrying. Ordinary saved-position frames still use elapsed-time completion.
This is not hardware homing, calibration or proof of clearance from an arbitrary
initial pose. Returning Home cannot make an invalid XYZ destination valid.

Home is a startup stage, not a saved/editable block: no loop iteration, program
file or step-count changes. Run status identifies the return. Stop, disconnect,
hidden page, stale feedback, write faults and the time budget cancel both startup
and blocks. No automatic resume. Connect, Load, reload and Restore do not initiate
Home movement. Setup sliders and the separate Home control are unchanged.
No new confirmation workflow or student-editable setting is introduced.

Regression checks cover Home-before-block ordering, invalid-target rejection
before Home, out-of-range entry, already-Home skip, Home shortfall, cancellation
and the default browser workflow. Physical testing remains operator-run.

Validation: TypeScript/Vite build and all 286 unit checks pass. All 25 classroom
browser checks pass, including the new startup scenarios. The other 22 browser
checks passed in the full run; its one outdated classroom small-J3 assertion was
updated to begin at Home and passed with the classroom rerun. Browser hardware
is mocked; no physical robot was moved by these checks.

## Previous update: checked coordinate targets, station layout and program files (dev.40)

User authorization: enforce the established joint limits for XYZ moves; keep the
station robot as the default, hide simulator/virtual frame, put Connect / Release
/ Restore above Run, and save/reload test programs. No teacher approval workflow
or editable student limits is added. Root index.html v0.6.1 remains unchanged.

Coordinate execution now requests calculation-only command 7 for every expanded
coordinate block BEFORE any program movement. Manufacturer Robot_Arm.cpp's
active move(..., calc_only=true) confirms the 14-byte P×10/X/Y/Z/R/C/time request;
system_task_handle.cpp confirms a 24-byte XYZ/P/R/C + six servo-target reply.
Source links and first hardware-check steps are in COORDINATE_PROGRAMMING.md.
Installed factory USB forwarding remains unverified; no firmware is flashed.

The gateway accepts only full-checksum command-7 replies from ID 255 or 0x5A,
with exact echoed coordinates and six encodable raw targets. It rejects solutions
outside OperatingRanges without clamping, preserving the measured feedback cache.
After all calculations pass, coordinate steps become internal pose snapshots and
run through TimedPoseMotion (600 speed cap / acceleration 10). Coordinate programs
check their measured starting pose at initial preflight and before each movement.
Command 8 is still blocked at the shared transport boundary and has no live route.
No matching reply in two seconds, invalid targets, stale feedback or failed writes
cancel preparation; no program movement has been sent at that stage. Stop,
disconnect and hidden-page cancellation discard pending calculations. Replies
cannot restart a canceled program. Echo matching is not a transaction nonce—the
protocol has no request ID. No automatic native fallback or correction loop.

Diagnostics include checked target snapshots and the last 20 parsed command-7
replies (including mismatched/weak replies), separate from measured positions.
Mathematical interpolation between bounded joint targets remains in joint bounds;
actual overshoot, valid-angle collisions, branch continuity and obstruction
protection are not established. This is commanded-target enforcement, not proof
that the previously reported pinch route is safe. No hazardous route was repeated.

Station robot is the only visible mode. Simulation code remains available for
later work, but its panel, virtual-arm frame and main-page simulation tests are
removed. Readings/diagnostics are in an expandable panel. Release/Restore retain
the established durable release record and automatic fresh-feedback readiness.

Save program downloads data-only JSON (format nexarm-classroom-program, schema 1,
max 256 KB). It preserves instruction structure and embeds named-pose snapshots.
Load validates the entire file and bounded interpreter first, builds blocks in a
temporary workspace, then replaces the visible workspace; failures preserve old
blocks. Imported pose snapshots remain in memory for file blocks; they do not
overwrite the saved-position library. Loading never connects, restores holding
or runs. It accepts no code, station policy or device settings. There is no
autosave; explicitly save before reload. No identities or uploads are added.

Validation: TypeScript/Vite build, full unit suite and all 45 Chrome browser
checks pass with mocked serial ports. New regressions cover both ends of every
joint range, weak/mismatched/missing IK results, starting-range rejection,
all-program preflight, cancellation/late replies, six-target dispatch without
command 8, responsive station layout, local file round trips, malformed files,
and imported pose independence after reload. Hardware behavior is unverified.

## Previous update: suspend native coordinate execution after arm/shoulder pinch report (dev.39)

Operator clarification: this was the arm and shoulder moving too close together,
not loss of servo support. The operator asks that coordinate movement obey the
existing joint limits. Those remain the shared OperatingRanges values, including
J3 2000–2900. Native command 8 cannot provide our gateway the joint targets before
moving. The intended replacement must calculate/obtain all joint targets first,
reject out-of-range solutions without clamping, and validate the intermediate
route before dispatch through the joint executor. No replacement motion has been
enabled. Even in-range individual joints do not establish arm/shoulder clearance;
coupled-posture restrictions still require physical validation. Software cannot
guarantee zero physical overshoot from target bounds alone.

The operator reports that native coordinate playback folds/collapses J3, creating
a pinch point and a lurch. This is a physical hazard report, not a small target
error. The root cause is unverified. Dev.39 blocks any program containing a
coordinate block in whole-program preflight, including later/nested blocks, and
rejects command 8 at the shared writer boundary even inside a combined packet.
The UI disables Run for these programs and explains the reason. No UI or storage
override is provided. Coordinate blocks remain editable; passive XYZ/P/R/C
readings, existing joint controls, and saved-joint pose playback remain available.
Loading a joint-only lesson/new program refreshes the lockout state immediately.

No alternative physical trajectory, speed increase, new stop opcode, firmware
write, or repeated test was introduced. This source change cannot recall a
command already executing in an older page. Stop/physical cutoff remain the
operator's intervention for current movement. Refresh and confirm dev.39 to load
the lockout. Do not use earlier dev.37/38 native testing steps to reproduce it.

The native packet specifies an endpoint/orientation/time but does not give our
gateway joint targets or an elbow-posture constraint. Potential causes include
solver configuration choice, an infeasible goal, reference/scaling mismatch or
the firmware profile. None is diagnosed merely from the observation. Increasing
duration cannot establish a pinch-free path. Request the existing report and
starting/requested coordinates without repeating the movement.

Next investigation: confirm whether this firmware/interface can return an IK
solution without motion, then examine all joint targets, J3 continuity and a
bounded route before considering a replacement live executor. Manufacturer
documentation describes a calculation-only path in its development examples;
support and exact semantics on this installed factory firmware are unverified.
This can preserve the XYZ interface without a student preview/simulation stage.
No calculation-only query was sent. Geometry/clearance and native Stop remain
unverified; any replacement movement behavior needs the operator's approval.

## Previous update: accept the robot's negative Z readings (dev.38)

The operator reported LCD Z=-71 being rejected by the new coordinate block.
The inherited factory UI minimum +100 was an unverified input restriction, not
a measured robot limit. Dev.38 permits Z -570–570 in the shared field definition,
so Blockly, keyboard fields, live-value copying, interpreter and packet encoding
all accept -71 without clamping. Signed packet Z bytes are B9 FF. Other fields,
profiles, durations, joint-target ranges, and Stop behavior remain unchanged.
This is a development input-bound correction, not verified coordinate calibration
or mechanical clearance. Refresh and confirm dev.38 before retrying the block.

Validation: all 252 unit tests, TypeScript/Vite build, and two targeted browser
checks pass. The browser regression copies LCD Z=-71, edits the coordinate block,
checks the keyboard minimum and verifies native outgoing Z bytes B9 FF. The full
45-check browser suite passed on the preceding dev.37 build.

## Previous update: reported coordinates and native XYZ/P/R/C blocks (dev.37)

The user deferred coordinate preview/simulation, reported the physical LCD's
XYZ/P/R/C readout, and explicitly requested a live block to enter those values
and test endpoint movement. Dev.37 adds the readout to the classroom and slider
pages and a `move to X/Y/Z/P/R/C over seconds` block. The robot's native command
8 performs the coordinate/joint calculation, rather than a browser geometry model.
See [the test guide](./COORDINATE_PROGRAMMING.md) and optional comparison CSV.

The passive decoder accepts the existing trusted 24-byte 0x0B layout only:
six signed words XYZ/P/R/C, then six valid raw joints. Pitch alone is divided by
ten, matching factory code. Readouts distinguish live, stale and disconnected
data; reconnect clears old values. Reports identify the unverified coordinate
reference and factory units. No new coordinate query is sent. Values are not
substituted for joint readings or promoted from weak checksums/alternate packets.

Add XYZ/P/R/C block copies fresh live values when available, defaults otherwise;
all fields and 0.1–10 second duration are keyboard-editable. Compile/worker/main
revalidation preserves finite numeric bounds, instruction expansion and runtime
budgets. Native blocks connect with poses, Wait and Repeat; they reject Simulation
explicitly. No coordinate preview, fake coordinate animation, or new dependency
is added. The earlier joint simulator remains available for its existing blocks.

The native encoder follows recovered factory `<hhhhhhH>` order P×10, X,Y,Z,R,C,
duration ms, system ID 255/command 8/full checksum. It sends once through the
existing writer and completes on elapsed duration after the write resolves.
Stop cancels future blocks and attempts existing holds for all six joints using
fresh positions; late callbacks cannot resume a stopped sequence. Native firmware
trajectory cancellation by these holds is unverified and requires physical
testing. No unverified stop opcode, automatic torque or persistent write is added.

Native commands use firmware joint targets/profiles, so browser per-joint target
limits and the normal 600/10 profile cannot pre-check/cap them. This limitation
is displayed before Run and in native operation diagnostics. Development input
bounds are not verified workspace/clearance limits. All raw-joint and saved-pose
paths retain their existing checks. Native reachability, arrival, obstruction
protection and physical coordinate reference remain unverified. Student release
must address the native path in protected policy. Root Connection Lab is unchanged.

Validation: all 251 unit tests, all 45 browser checks, and TypeScript/Vite build
pass. Tests cover signed coordinate decoding/scaling from the supplied raw log,
weak/incorrect-frame rejection, stale/disconnected/reconnect labels, no writes
from readouts/block creation, exact native packet bytes, parameter validation,
coordinate time budgets, keyboard edits/live-value copying, Wait sequencing,
Stop holds for all joints, pending-write cancellation and subsequent feedback
loss. Browser robot behavior is mocked; native physical movement, arrival and
firmware trajectory stopping still require the operator's test. The existing
Blockly bundle-size warning remains.

## Previous update: endpoint-path comparisons are diagnostic for timed poses (dev.36)

The user reported repeated `Pose J# moved outside its commanded path` errors
after the factory-style timing change. Dev.35 still faulted if a reading left
the current frame's measured start/target interval by more than 100 raw units.
That interval does not model continued movement toward a previous frame's goal,
overshoot, reversal, or a joint awaiting its next write. Timed completion permits
these transitions without proving the previous movement has settled. A regression
reproduces the false fault when J6 continues moving before its reversal target
is sent. This establishes a software failure case, not a physical diagnosis of
every reported error.

For timed Home and saved-position playback, that comparison now records
diagnostics instead of canceling the run. Reports identify
`pathCheckPolicy: diagnostic-only`, a total `pathDeviationCount`, and up to 64
recent `pathDeviations` with time, joint, measured value, comparison bounds and
whether its current target had been submitted. The existing 64-sample feedback
trace and actual/target separation remain. The comparison is not a physical
collision or motion-path detector. It does not gate the UI or cause retries.

Target ranges, capture validation, whole-program preflight, fresh feedback,
write deadlines, USB ownership, cancellation, Stop, and program budgets remain
active. Timing/profile caps remain 600/10 with no new physical command, target
or persistent device setting. Individual-joint/sliding controls keep their
existing supervision; the change applies to TimedPoseMotion only.

Testing: refresh and confirm dev.36, then retry the same pose sequence. These
endpoint-path errors should no longer interrupt timed poses. Readings stay live
and movement diagnostics retain the observations. Test Stop during the sequence.
Physical hardware verification remains with the operator.

Validation: all 239 unit tests, all 41 browser checks, and TypeScript/Vite build
pass. New coverage includes every joint leaving its endpoint interval without a
timed-pose fault, bounded/copied diagnostic observations, J6 continuing during
partial reversal dispatch, cancellation on subsequent feedback loss, elapsed
sequence completion, and Stop holding all submitted joints without replay.
Browser hardware behavior is mocked; no USB command or device-setting change was
performed by these checks. The existing Blockly bundle-size warning remains.

## Previous update: factory-style frame completion (dev.35)

At the user's request, saved-position buttons, Blockly pose blocks and Home now
advance on elapsed effective frame time. All six targets are sent, including
small and zero-distance targets, in ID order with at least 2 ms between resolved
writes. The frame clock starts after the final write completes. There is no
pose-arrival tolerance, stable-sample gate, settling timeout, correction loop or
automatic retry. A stationary 32-unit J3 shortfall no longer cancels the program.
Completion says frame time elapsed; it does not claim exact physical arrival.
Measured readings, targets and remaining errors stay separate in UI/diagnostics;
reports identify `completionPolicy: elapsed-time`.

The existing per-joint distance/time profile remains capped at speed 600 and
acceleration 10. Effective duration extends when needed. Unlike factory caches,
each frame still starts from fresh measured positions; targets never replace
measurements. Target-range preflight, feedback freshness, path-deviation checks,
write deadlines, exclusive USB ownership, cancellation, and 100-step/60-second
program budgets remain. Explicit joint blocks, jogs and sliders retain their
existing behavior. No persistent servo settings or new torque command changed.
Consecutive pose frames do not inherit the individual-joint half-second command
interval; the effective duration and resolved-write spacing govern progression.

Stop retains the IDs of all submitted timed targets even after elapsed completion
or a later individual-joint route, because time alone does not prove rest. During
partial dispatch it holds only submitted IDs, including IDs from an earlier
elapsed frame. Explicit completed release/restore clears that hold set so Stop
cannot send old pose holds while hand positioning. No canceled program resumes.

Testing: replay the previous sequence in dev.35. It should pass the former
J3 32-unit timeout and continue at the planned frame time. Compare the live
readings and physical result. Add a Wait block for an extra pause. Test Stop both
during movement and after frame completion; test release/restore before recording.
Historical entries below describe earlier versions, not the current arrival policy.

Validation: 231 unit tests, all 40 browser checks, and TypeScript/Vite build pass.
Regressions include stationary residuals of 14/30/32/86/100 units on every joint,
unstable readings without an arrival gate, small-target dispatch, minimum frame
time, 100 ms frames with no extra half-second pause, Stop during partial dispatch
and after elapsed completion, release clearing old holds, and retained feedback/
path/range/write guards. Browser robot tests use mocked serial feedback; physical
validation on the arm remains with the operator. The existing Blockly bundle-size
warning remains. Root Connection Lab v0.6.1 is unchanged.

## Previous update: shared ±30 pose accuracy (dev.34)

At the user's request, all six timed-pose joints now use the same ±30 allowance,
replacing J3 ±30 / others ±12. This covers the reported S6 target 1512, actual
1498 (14 short). The shared policy governs skip planning, active settling and
final pose checks for saved poses and Home. All still require elapsed frame time
and three stable samples over at least 150 ms with spread ≤9. Target ranges,
recording range checks, profiles, deadlines and explicit small-joint/jog behavior
are unchanged. This is a development accuracy tradeoff, especially for gripper
opening; it is not proof of exact positioning or a physical fault diagnosis.

Validation: 228 unit tests pass, including every joint at stable ±14/±30, skip
planning within tolerance, and faults outside ±30. Timed frames still do not
automatically retry or correct targets.

## Timed pose implementation: dev.33

The user approved the action-group investigation's next-step proposal. Current
direct sessions now use TimedPoseMotion for Blockly saved poses, direct pose
buttons and Home. Explicit joint moves/jogs/sliders keep their existing executor.
The earlier ConcurrentHomeMotion remains for legacy controller callers/tests.

Each pose block exposes duration 0.1–10 seconds (default 1). Pure planning uses
the factory's distance/time ×1.2 calculation, minimum speed 10, capped at the
previously tested 600. Requested duration is extended when needed to honor that
cap, with acceleration retained at 10 rather than silently adopting factory 100.
Home and direct saved-position buttons request 1 second. Requested/effective
durations, per-joint profiles and measured feedback appear in diagnostics; status
shows any extension. Targets are checked against operating ranges before sending.

Pose accuracy is consistently J3 ±30 and other joints ±12 for skip planning,
active settling and final validation, independent of prior travel. Thus J3
2811 → 2838 needs no correction write, but the frame still waits for fresh stable
readings and duration. Every joint, including skipped joints, remains supervised.
Direct small/joint commands retain their earlier distinct accuracy semantics.

Needed joints are sent separately in ID order through the shared exclusive
writer, with at least 2 ms between resolved writes. An unresolved write cannot
advance dispatch. Callback generation/route checks prevent late dispatch after
Stop, disconnect, fault or mode change. Stop holds only submitted joints, using
fresh measured positions. No factory board-download, query, calibration, PID or
new torque command is introduced. Position measurements never become targets in
the measurement cache.

Completion requires both effective frame time and measured pose accuracy with
three samples spanning at least 150 ms and spread ≤9 for every joint. The clock
starts after the last target write; an all-skipped frame starts at its Run action.
It does not use the factory's timer-only continuation. Freshness/path checks and
a four-second settling allowance remain; larger residuals or instability still
cancel the sequence. No retry/correction loop runs. Programs retain 100-step/
60-second budgets; requested pose durations plus waits are also checked up front.
Duration extensions and actual settling consume the existing live runtime budget.

Simulation validates and honors pose duration as a minimum animation time; its
illustration timing is still educational rather than measured robot dynamics.
No accounts, network data, new dependency, device setting, or automatic program
start was added. Root Connection Lab and archived mapping suite are preserved.

Validation: 222 unit tests, all 40 browser tests, and TypeScript/Vite build pass. Regressions cover exact
2811 → 2838 no-write completion, per-joint profiles, duration extension, ±30
accuracy, stale/unstable/deviating feedback, Stop during partial dispatch,
program advancement, invalid durations and bounded runtime. The exact J3 near-pose
browser regression honors an edited two-second duration with zero writes. All
classroom, setup, simulator and archived-suite browser regressions pass. Automated USB is synthetic;
physical smoothness and stopping still require the operator's arm test.

## Factory action-group investigation (no application behavior change)

The user requested deeper inspection after J3 2811 → 2838 remained at 2811.
Static inspection of the supplied binary found a timed online frame runner,
per-joint speed derived from frame duration, stored per-frame acceleration, six
existing servo writes spaced 2 ms apart, and no measured-arrival gate between
frames. Our fixed 600/10, grouped-write, feedback-gated execution differs in all
of these respects. The dev.32 >=100-travel tolerance condition also makes this
27-unit request strict again, exposing inconsistent pose-arrival handling.

See [the full action-group analysis](./FACTORY_ACTION_GROUP_ANALYSIS.md) for
source-method/bytecode references, factory widget ranges versus operator ranges,
online/preview/download distinctions, cache caveats, and a staged implementation
proposal. The added static wordcode helper passed Node syntax checking and was
used against the existing extracted modules; executable SHA-256 was rechecked.
No application version bump, new movement policy, USB operation, factory program
execution, device-setting change or physical test occurred during this pass.

## Current update: J3 settling allowance for larger moves

Repeated in-range J3 moves stopped 27–28 raw units short. J3 now allows ±30 for
program joint moves and concurrent saved-pose/Home moves requesting at least
100 raw units of J3 travel. Other joints and smaller J3 moves retain ±12.
Direct sliders, numeric manual moves, ±20 jogs and the factory comparison retain
their prior tolerance. This avoids accepting an unperformed small jog as arrival.

The selected per-move tolerance is included in command diagnostics and is used
by both per-joint settling and final whole-pose checks. Skipped J3 joints retain
the strict final check. Three samples over at least 150 ms with spread at most
nine are still required. Targets, range checks, packet contents, motion profiles,
deadlines and lack of retries/correction loops are unchanged. Larger residuals
still cancel subsequent blocks. This is approximate pose replay, not calibration
or a diagnosis of why the joint stops short. No confirmation/Enable controls return.

Validation: 213 unit tests and build pass, including 27/28/30-unit residuals in
both directions, errors beyond 30, unstable data, small/skipped J3 movement,
unchanged J4 accuracy, and advancement after both Blockly joint and pose steps.
All four targeted browser checks pass: reproduced 28-unit J3 offset through a
Blockly pose/wait/return sequence with exactly two writes and no retries,
concurrent Home, all six live sliders and all twelve jog controls. A final build
also checks the on-page tolerance wording. Hardware verification remains with
the operator; the new allowance is a development setting for this observed arm.

## Previous update: direct testing without confirmation checkboxes or Enable (dev.31)


At the user's request, the current classroom and setup pages now use direct
sessions: Connect, wait for fresh stable readings, then Run or use joint controls.
The movement-clearance, support and restored-holding checkboxes, confirmation
buttons and Enable buttons were removed. Physical support/sweep instructions
remain visible. Release and Restore remain deliberate actions; neither is sent
on Connect/reload. No automatic program execution or continuation was added.

Direct readiness needs three fresh six-joint samples over at least 150 ms with
at most nine units of spread per joint, idle motion/writer and a valid connection.
Stop and movement faults cancel queued work; stable fresh feedback permits a
new explicit action without Enable. Fault details remain visible until the next
action. A rejected or timed-out USB write requires reconnecting because delivery
is uncertain. A stale/hidden/disconnected session cannot send a new command.

Restore completes its local interlock after its write resolves and new stable
feedback arrives, with no physical-confirmation button. The event explicitly
states that physical torque is not measured. An interrupted release still
persists across reload and requires an explicit Restore; merely returning
feedback cannot clear that state. Position ranges and recording validation remain.
The older controller confirmation API remains available for legacy callers;
the current pages explicitly select direct-session behavior. Archived mapping
tests retain their original workflows.

The new report shows S3 2016 → 2838 stopping at 2810 after approximately 2.07 s
and staying there through 6.66 s; timeout was at approximately 6.79 s. Other
joints reached within tolerance. The factory test separately shows J3 3080 →
3060 and J4 3197 → 3083, with other joints within 2–3 units. Its J3/J4 targets
exceed current operating bounds. See [accuracy observations](./POSITION_ACCURACY_OBSERVATIONS.md).
These observations do not establish the cause of shortfall. No target tolerance,
speed, acceleration, correction loop or operating range was changed here.

Validation: 204 unit tests, all 38 browser tests, and TypeScript/Vite build pass.
Coverage includes direct Connect readiness without writes, no confirmation/Enable
DOM controls, fresh stable Restore completion, stale/unstable restore blocking,
interrupted-release recovery across reload, Stop/new Run without re-enabling,
timeout recovery without replaying later blocks, and uncertain USB delivery.
The browser regression was updated for automatic readiness after reconnect.
All automated USB streams are synthetic; physical holding is not verified by
these checks. The existing Blockly bundle-size warning remains.

## Previous update: J2 lower endpoint 525 (dev.30)


At the operator's request, J2's operating range is now 525–2600 (previously
1200–2600). The shared range updates live recording boxes, recording validation,
setup sliders and every current-controller movement target check. Exact 525 is
accepted; 524 is rejected. No other joint endpoints or movement profiles changed.

## Previous update: live recording feedback and range gating (dev.29)


The name/record section now includes six read-only live value boxes directly
beside the naming field, each showing the exact operating range (J6 marks 1024
open). Invalid joint boxes and the recording panel border turn red; Out of range
labels and the adjacent recording status identify the offending joint(s).
Layout stacks on small screens. Readings remain visible while disconnected or
stale and are explicitly labeled as last readings rather than live values.

Recording now requires all six values inside range, fresh feedback, idle motion/
writer state and a name. The controller's capture method independently validates
the current snapshot, and snapshot.canCapture/captureReason expose range failures.
All exact endpoints are accepted. This supersedes dev.28's ability to capture an
invalid vector and flag it afterward. Existing saved data remains untouched.
No movement, torque or session-enable behavior changed.

Validation: 199 unit tests and TypeScript/Vite build pass. Unit tests cover both
out-of-range sides and exact endpoints on every joint, with no USB writes.
Browser coverage checks live updates, displayed ranges, red styling and text,
disabled recording for each joint, stale-feedback recovery, no rejected saves,
valid snapshot persistence, proximity to the name field and narrow-screen fit.

## Previous update: operator-provided operating ranges (dev.28)


The operator supplied low/high ranges based on the factory UI and adjustments
during testing: J1 900–3000; J2 1200–2600; J3 2000–2900; J4 1250–3000;
J5 1024–3072; J6 1024–2731 (1024 open). These are fixed development goal bounds,
not protected student policy or independently verified mechanical limits.
No stricter student margins were added. See [operating ranges](./OPERATING_RANGES.md).

The shared current motion controller validates whole Blockly programs before
the first write, including later saved poses. Invalid targets identify their
joint/range without disarming the session or silently changing targets. Pose
lists flag existing invalid data and disable direct replay while preserving
records/export. Sliders use the joint ranges; jogs, Home, absolute moves, live
targets and the factory comparison validate through the same controller.
Out-of-range readings remain observable and a request to a valid target remains
possible. Recording preserves actual measurements; resulting invalid poses are
flagged. Fresh Stop holds deliberately retain measured targets outside these
ranges rather than commanding an unrequested move to a boundary.

The diagnostic report showed repeatable shortfalls on both S3 and S4 during t2,
not a command flood or a feedback gap. Its requested targets exceed the new
ranges. Existing t1 also has J3 outside range and needs replacement. Hardware
limits, power/torque state and underlying cause remain unverified. No servo
settings or movement profiles were changed.

Validation: 193 unit tests, all 37 browser tests, and TypeScript/Vite build pass.
Tests cover exact endpoints and invalid targets on all six joints, rejecting a
later invalid pose before any program write, retaining Enable after rejection,
preserving stored data, bounded sliders, returning from an out-of-range reading,
and fresh Stop holds outside range. All automated USB streams are synthetic;
the existing Blockly bundle-size warning remains. No physical moves were sent.

## Previous update: consistent settling tolerance (dev.27)


The reported Servo 4 move from 3084 to 2720 timed out at 2730, a 10-unit
residual. The per-joint settle check required ±9 while the existing final pose
check allowed ±12. Both checks now share a 12-unit target tolerance. Stability
still requires three feedback samples spanning at least 150 ms, with no more
than nine units of spread. This accepts the reported residual only when stable;
a single screenshot does not establish stability or the cause of the offset.
Planning still skips only targets within nine units. No target, speed,
acceleration, path-deviation margin, deadline, retry or correction loop changed.

Validation: 183 unit tests and build pass. Regression tests reproduce Servo 4's
3084 → 2720 request settling at 2730, verify the next Blockly step waits for
settling and the command interval, accept stable ±12 boundaries, and retain
timeouts for ±13 residuals and rejection of unstable feedback.
Four targeted browser regressions also pass: saved-pose buttons, Blockly pose/
wait sequences with repeated runs under one Enable, concurrent Home and reusable
jog controls. Successful completion already retains the connected session's
Enable; editing and rerunning do not require another confirmation. The reported
timeout takes the fault path, which disables motion. Accepting a stable 10-unit
residual avoids that fault; actual faults, Stop, connection/visibility changes
and release/restore still require deliberate recovery before further movement.

## Previous update: saved-position motion and Blockly sequences (dev.26)


Saved positions now have a Move to position button. This reuses the concurrent
Home executor at speed 600 / acceleration 10: one batch of individual servo
targets, independent settling supervision, no automatic retries or correction
loop. Needed joints start together; their arrival times are not synchronized.
Holding confirmation, session Enable, fresh readings and exclusive motion/writer
ownership remain required. Already reached positions send no command. Stop
attempts fresh holds for all commanded joints and cancels subsequent blocks.

Blockly now supports Move to saved position and Wait (0–10 seconds), alongside
joint moves and Repeat. New empty program and accessible append buttons support
building a sequence without retaining the starter's movements. Position dropdowns
use stable local IDs; compilation rejects missing/deleted references before any
write. Each Run freezes the selected six-target vectors. Deleting a saved pose
during a run does not alter an already prepared movement. Names are text only.
Simulation animates pose joints together and honors waits without requesting USB.

The bounded interpreter and worker-response validation accept pose/wait steps;
the live executor waits for every commanded joint to settle before a subsequent
block, with the existing 500 ms write interval. Waits send no commands and cancel
on Stop, mode/visibility/connection changes or stale feedback. Limits remain
100 expanded steps (including waits), repeat count 20 and 60 seconds per run.

This is endpoint replay, not recorded hand-guided trajectory playback, Cartesian
interpolation or collision checking. The operator must check the combined sweep.
Protected station policy and student physical procedures remain roadmap gates;
no student-editable limits, extra approvals, accounts or network storage were added.
Programs still do not persist across reload; positions remain in local storage
with the existing export/delete and memory-only fallback behavior.

See [teaching and replay testing](./TEACHING_POSITIONS.md). Automated USB checks
use simulated streams; physical motion requires testing on the actual arm.
Validation: 177 unit tests, the full 35-test browser regression, and TypeScript/
Vite build pass. After refreshing dynamic dropdown caches and tightening the
simulation wait budget, all 17 classroom/simulation browser tests pass again.
Coverage includes grouped pose packets, independent settling, frozen targets,
timed waits, Stop, stale feedback, missing-position rejection and repair, and
running the same pose sequence in simulation and with simulated USB. Vite retains
the existing warning about the Blockly bundle exceeding 500 kB.

## Previous update: hand-positioned named pose recording (dev.25)


The user requested release, physical positioning, then recording and naming the
pose. The main robot page now provides Teach a position, using the same verified
factory All Off/All On controls and shared writer as the setup page. Support and
pinch-clearance confirmation is required before releasing/restoring; holding
remains unverified until physically confirmed. Release disarms motion, and the
durable recovery interlock still survives Stop, disconnect and reload. There is
no automatic release, restore, program start or saved-pose replay.

Record reads a fresh six-joint snapshot through the controller without writing
to USB. It rejects stale data, pending writes and active motion. It can capture
while released or while holding normally. Current readings are visible beside
the record controls. The teaching section stays collapsed during ordinary use
and opens automatically when holding needs recovery.

Up to 32 positions, each with a 1–40 character unique name, measured raw vector,
local ID and capture time, are saved under a separate local-storage key. Export,
individual deletion and clear affect only these positions. Names are rendered as
text. Storage failure retains a clearly labeled memory-only list and export;
invalid saved data is preserved until explicit clear. Clearing saved positions
does not clear holding verification. No identity fields, accounts, uploads,
dependencies, or student-editable station limits were added.

The user clarified the earlier movement was targeting J3 and confirmed Blockly
is working. That is recorded as a successful user test, not proof that selecting
J3 could cause an actual power failure. Diagnostics remain available.

Validation: 169 unit tests, the 32-test browser regression, fourteen final
teaching/simulator browser checks, and TypeScript/Vite build pass. Checks
cover release/capture/restore, exact observed values, no capture write, reload,
stale capture, export/deletion, malformed storage, memory-only fallback, and
preservation of the holding interlock. All automated USB tests are synthetic.

See [teaching a position](./TEACHING_POSITIONS.md). Saved-pose playback and Blockly
pose blocks remain future work, with student-release handling/policy validation
in the roadmap.

The following sections record earlier versions.

## Current update: investigate reported Blockly power/holding loss

The teacher reports J1 moving briefly followed by lost power and holding. Cause
is unresolved. Audit and synthetic tests confirm normal program steps wait for
settled feedback and at least 500 ms between completed writes; Run/completion/
fault/disconnect do not request release. Automatic movement should remain stopped
while physical power/reset observations are collected. No motion timing, speed,
torque, or firmware changes were made as a speculative fix.

The main page adds a read-only local diagnostic export with bounded command-byte
and timing records plus connection/fault/Stop events, available after a fault or
disconnect. Power/torque are unmeasured, and stream completion is not an ACK.
Logging is not retroactive and does not authorize another physical run.
See [the investigation](./BLOCKLY_POWER_LOSS_INVESTIGATION.md).

Validation: 163 unit tests, 22 targeted browser tests, and TypeScript/Vite build pass. New checks verify
settling-dependent pacing, the minimum interval, absence of torque frames in a
program, connection loss without extra commands, and independent report copies.

The following sections record earlier versions.

## Current update: defer station limits to the student-release roadmap

The product owner explicitly requested that station limits not block development
Run, and that the eventual student release not expose editable safety limits.
The programming page no longer reads, saves, clears, or edits station profiles.
Run requires the existing connected/enabled/fresh/idle state, not station setup.
Old browser profiles are ignored without clearing the separate holding interlock.

The program gateway no longer accepts station settings. Programs use the current
development profile of speed 600 / acceleration 10, with 100 movements and a
60-second budget. The bounded interpreter still rejects invalid servo IDs,
non-integer/non-finite values, and raw targets outside the encoding range.
Feedback path/deviation/settling checks, Stop and cancellation remain active.
Reports explicitly record that station limits are not enforced. No automatic
movement, reconnection, Home, or holding change was added.

[ROADMAP.md](./ROADMAP.md) makes measured limits and protected teacher/admin
configuration a required student-release workstream, with enforcement in the
shared gateway, no student editing or project override, robot matching, migration
of untrusted legacy profiles, and failure/adversarial tests. The development
exception must not become a bypass in the student release.

Validation: 160 unit tests, 30 browser tests, and TypeScript/Vite build pass. Tests exercise Run with
no setup or obsolete settings, input rejection, retained feedback faults, Stop,
run budgets, and late-write cancellation. Hardware tests remain manual.

The following sections record earlier versions.

## Current update: explain and unblock session Enable

Missing station limits unnecessarily disabled Enable, despite Enable sending no
movement. Enable now requires the clear-area checkbox and the existing connected,
fresh-feedback and holding checks. Station limits remain mandatory for Run, and
the motion gateway still checks every program target and starting position.
No motion bounds, speed, holding procedure, or automatic movement was changed.

An inline message beside Enable identifies unchecked clearance, missing/current
feedback, connection state, and unverified holding. The latter points to the
existing Robot setup controls. When station limits are missing, selecting robot
mode opens station setup, and an enabled robot explicitly explains why Run is
unavailable until those ranges are saved. This adds no per-program approval.

Validation: 161 unit tests, twelve targeted classroom/simulator browser checks,
and TypeScript/Vite build pass. Tests cover missing setup with non-moving Enable,
required setup for Run, unchecked clearance, stale/fresh feedback, and the
retained holding interlock.

The following sections record earlier versions.

## Current update: independent student Blockly runs

The product owner clarified that a teacher approval workflow for each program
is infeasible for 10–20 groups. Students must edit, run, observe, and iterate
independently. The application now provides Simulation (default) and Station
robot destinations in the same Blockly workspace. There is no per-program
teacher review, approval marker, required prior simulation, or fixed pilot gate.
The earlier approval requirements do not imply classroom approval of every run.

Station setup supplies six explicitly tested joint ranges and program speed
(1–600; acceleration 10), saved locally once per browser station. No guessed
ranges or inherited Home windows are supplied. These are operator-configured
constraints, not collision detection or certified mechanical limits. They must
match the robot assigned to the station. Missing/invalid settings leave
simulation usable and block live program runs. Storage failure permits a clearly
labeled memory-only setup. Clear removes only station settings, preserving the
independent holding/recovery interlock.

Students select Station robot, Connect, confirm the clear area/assigned robot,
Enable once per session, and Run. A successful run leaves controls enabled for
the next edit/run. The bounded interpreter supports sequence and repeat, with
at most 100 expanded movements and a 60-second live-run budget. Each step sends
the existing position/speed/acceleration frame through TeacherRobotControl,
waits for settled feedback, and then advances. All planned targets and initial
positions are checked against a copied station profile before the first write;
positions are checked during execution and before every step. Manual controls
and overlapping programs cannot interrupt the sequence without Stop.

Stop cancels future steps and attempts the existing measured-position hold.
Faults, missing feedback, hidden pages, disconnection, and mode changes cancel
the sequence and disarm; students can inspect and re-enable without a teacher
approval action. No sequence resumes automatically or automatically returns Home.
Editing/loading a lesson after normal completion does not disarm. Worker
preparation is canceled on Stop/mode changes. Simulation does not request USB.

The robot setup page retains the tested sliders, concurrent Home at 600 / 10,
and release/restore controls. New student runs use the same writer, USB lease,
holding interlock, and feedback supervisor. This is a development test build;
managed student-account compatibility, physical classroom profiles, and full
classroom acceptance remain to be demonstrated. Student programs are not saved
yet. No accounts, network data transfers, or dependencies were added.

See [classroom testing steps](./CLASSROOM_PROGRAMMING.md).

Validation: 161 unit tests, 27 browser checks across the regression and targeted
classroom runs, and the TypeScript/Vite build pass. Browser checks cover editing
and rerunning after one Enable, out-of-range rejection before writes, Stop and
student recovery, saved setup without arming, mode-switch cancellation, and Stop
remaining available after a fault. Existing simulation, manual control, Home,
reference, and commissioning regressions pass. No real USB movement was executed
by the assistant.

The following sections record earlier versions.

## Current update: concurrent Home at doubled speed

The teacher explicitly requested starting all Home joints together and doubling
Home speed. Home now sends the needed targets back-to-back in one guarded USB
write at speed 600 / acceleration 10, using up to six existing checksum-valid
unicast position commands. This changes the physical sweep from the earlier
sequential route. It is not a new firmware broadcast instruction, an atomic
delivery guarantee, coordinated Cartesian planning, or synchronized arrival.
Joints traveling shorter distances can finish first. Near-Home joints are skipped.

ConcurrentHomeMotion supervises each moving joint's path, settling, and deadline
through the existing motion supervisor. Other commanded joints are expected to
move; all joints, including skipped and already-settled ones, retain group path
checks. Completion requires all moving joints to settle and the final whole-pose
check. One joint's fault fails the group without automatic retry. Stop attempts
fresh-position holds for every commanded joint in one write, retaining existing
handling of stale feedback, pending writes, and uncertain delivery. A partial USB
delivery is possible and never treated as successful completion.

The page now says Return together to Home, shows individual joint feedback, and
estimates duration from the longest move rather than the sum of all distances.
Manual slider speed/acceleration, live reversal behavior, Home values, and student
simulation are unchanged. The teacher reports dev.19 now resembles the factory
app, including a slight J2 tremor that then settles; this concurrent return still
needs its own physical test.

Validation: 154 unit tests, ten synthetic-USB Chrome browser tests, and the
TypeScript/Vite build pass. Tests cover grouped
dispatch, frame checksums, independent settling, skipped and already-settled
joints, path faults, timeout, feedback loss, and fresh-position holds for all
commanded joints. All automated motion checks use synthetic USB.

The following sections record earlier versions.

## Current update: fast slider reversals and small input changes

The reported fault (S1 at 2463, newest path 2078 to 2038) exposed a problem with
checking each live update as an isolated move. A still-moving slider now retains
the range of targets actually dispatched for its joint. Later readings can travel
toward an earlier target during a reversal, within the existing 100-unit margin.
Overwritten pending targets do not widen this range. Settling, switching joints,
Stop, disconnect, and fault end the operation; a later operation starts a new
range. Arrival still concerns the newest target only. Reversal settling waits
and deadlines allow for travel from the earlier dispatched targets. Export
includes the commanded path range. Home and jog supervision retain their paths.

Live input changes smaller than 10 raw units from the last dispatched target
are suppressed to reduce small mouse-driven target changes. The release/change
event sends the exact final target once, including a change below that threshold.
Updates remain limited to ten per second, with one newest-target pending slot.
Speeds, acceleration, holding commands, and Home values are unchanged.

The teacher also reports J2 vibration during dragging and with the mouse still;
the factory app vibrates less during movement and briefly before settling.
Input filtering
addresses a possible command source, not a verified physical cause. The browser
does not issue feedback-driven corrections or automatic retries. Persistent
vibration after input stops remains unresolved; it is not treated as successful settling or fixed by raising
arrival tolerance. No firmware tuning or automatic torque release is introduced.

Export retains up to 64 feedback samples per operation (within the existing
100-operation history), in memory until local export, to investigate J2's
position oscillation alongside the command profile. No data is uploaded.

Validation: 146 unit tests, ten synthetic-USB Chrome browser tests, and the
TypeScript/Vite build pass. Regression checks
reproduce the reported fast reversal, reject travel beyond dispatched targets,
reset the range after settling/Stop, budget reversal deadlines, suppress small
J2 input changes, preserve the final release target, and verify that oscillating
feedback alone sends no corrective command. Physical testing remains necessary.

The following sections record earlier versions.

## Current update: wider motion tolerance and slider handoff

Teacher motion now permits 100 raw units of selected-joint overshoot beyond the
commanded path and 100 raw units of companion-joint variation, replacing 20.
These are feedback fault thresholds, not calibrated mechanical limits. Manual
slider completion permits that companion variation rather than applying the old
12-unit whole-pose check. The selected joint still needs settled target feedback;
Home retains its existing arrival and final-pose accuracy checks. Speeds, Home
targets, Stop, USB failure handling, and feedback deadlines are unchanged.

A completed slider operation also retained ownership of its joint and rejected
input on another slider. Ownership now permits handoff after completion while
still blocking another joint during movement, a pending target, or a USB write.
This addresses the report that only S1 responded; physical confirmation remains
necessary. Synthetic checks exercise all six live sliders with one Enable.

Validation: 141 unit tests and eight synthetic-USB Chrome browser tests pass,
including all six live sliders after one Enable. Unit checks cover both sides of the 100-unit boundary,
slider completion with companion drift, strict Home accuracy, and all-joint
handoff. TypeScript/Vite build passes. Hardware has not been operated by Codex.

The following sections record earlier versions.

## Current update: live teacher sliders

Dragging a slider now sends targets during input, at most once every 100 ms,
through the existing shared USB writer. A single pending slot retains only the
newest target; intermediate positions are replaced rather than replayed. The
active slider stays enabled through writes and settling. Releasing it keeps the
final target, with duplicate input/change events suppressed. Numeric entry still
requires Move and retains the half-second interval.

Stop immediately clears the pending target. Disconnection, page hiding, faults,
and feedback older than 500 ms also discard unsent targets. Late write completion
cannot restart canceled motion. Other joints and Home wait for the current joint.
Slider defaults remain speed 2000 / acceleration 100; Home remains 300 / 10.
No student live execution, dependency, or external request is added.

Validation: 129 unit tests, seven targeted Chrome browser tests with synthetic
USB, and TypeScript/Vite build pass. Checks cover input before release, duplicate
events, newest-target replacement, early settling, Stop, stale feedback, hanging
writes, and cancellation. Actual feel and smoothness require teacher testing.

The following sections record earlier versions.

## Current focus: factory-style sliders and faster Home

Our goal remains a privacy-first Blockly classroom: program, simulate, observe,
then run teacher-approved hardware. We have established USB communication,
holding release/restore, individual movement, and Home under tested conditions.
The teacher requested a simpler hardware test milestone instead of continuing
small-jog commissioning: operate all joints through sliders and return Home.

Each joint now has a live reading, target slider, numeric target, speed,
acceleration, and Move button. Slider changes preview locally and send on release;
numeric entry sends on Move. Sliders initialize from actual readings, and retain
selected targets while feedback updates separately. Defaults match the factory
fields: speed 2000 and acceleration 100. Encoding range 0-4095 is not a verified
mechanical range. This is supervised teacher testing, not student live control.

Home retains the requested pose and order, with speed 300 (three times its former
100) and acceleration 10. Its estimate and deadlines use that profile. Actual
travel time is not guaranteed to scale exactly threefold. Small +/-20 jogs remain
inside collapsed details in each card as secondary controls.

Only one joint moves at a time. A running slider joint can be retargeted after
500 ms with fresh feedback and an idle writer; that explicit command replaces
its old target. Other joints and Home wait. There is no queued future click.
Invalid targets do not cancel the existing move. Stop cancels future Home joints
and attempts the existing fresh-position hold.

Manual moves that settle short are labeled Settled short with the remaining
error, without claiming arrival, repeated correction, or a lockout. The teacher
can request a new target. Home retains arrival checks and does not silently skip
a joint. Unexpected deviation, missing feedback, and USB failures still fault.

Acceptance: operate each slider both ways, verify release/restore, Stop a move,
and complete Home at speed 300. Then use the observations to define the hardware
profile and resume Blockly work. The root prototype and simulator are preserved;
no new dependency, login, upload, deployment, or simulator USB access was added.

Earlier updates below are historical.

Validation for dev.16: 126 unit tests, 20 Chrome browser tests, and the
TypeScript/Vite build pass. Targeted browser checks were repeated after collapsing
the earlier comparison and requiring numeric fields; blank fields send nothing.
The slider layout was visually inspected. All motion tests used synthetic USB;
actual smoothness and the faster Home return remain teacher hardware checks.

## Current update: approved Servo 3 comparison

The teacher approved enabling **Servo 3 +20 at factory settings**. This separate
button below the joint controls sends one target from the current reading +20,
with speed 2000 / acceleration 100. Existing Enable, holding confirmation,
freshness, encoder boundaries, serialized writes, feedback, and Stop checks apply.
Extra clicks during movement are not queued. No return or retry runs automatically.

Each motion plan carries its explicit profile through packet dispatch, deadlines,
visible diagnostics, and export. Normal jog and Home retain 100/10 and send those
values on every command. Stop retains its normal-profile current-position hold.

Refresh `/mapping.html`, confirm dev.15, close the factory app, Connect and Enable.
Click the separate comparison once. Report whether Servo 3 physically moved,
the displayed start/target/actual readings, and any fault. Export movement
diagnostics if needed. Hardware success is not assumed.

Validation: 123 unit tests, six synthetic-USB Chrome tests, and TypeScript/Vite
build pass. Tests cover the comparison packet, blocked overlapping clicks, visible
profile, and a following jog returning to the normal profile.

The following sections record previous updates.

## Current update: Servo 3 diagnostics

Follow-up: the teacher confirms actual bidirectional factory movement at displayed
2000 / 100 and no physical movement on browser +20. A concrete
[factory-settings comparison](./SERVO3_FACTORY_COMPARISON.md) is prepared and its
packet is unit-tested. Enabling that comparison awaits approval of the parameter
change. No current speed, acceleration, Home route, or other movement is changed.

The teacher reports Home stopping at Servo 3 and +20 becoming grey after a press,
while negative presses work. Controls intentionally disable during an outstanding
move; this does not establish whether the positive move stalls or triggers another
fault. The code has no Servo-3-specific positive-direction restriction except the
generic 4095 encoder ceiling. Synthetic tests accept both signs. The physical
cause is not established.

Dev.14 displays the commanded joint, initial reading, target, actual reading, and
remaining distance directly under the jog controls. Fault messages identify a
timeout/no reported progress, the specific companion joint drifting, or a reading
outside the commanded path. Local export preserves the failure-time readings and
command even when later feedback changes. Export movement diagnostics is now
visible beside the controls. No motion limits, Home values, speed, acceleration,
retries, or force settings are changed in this diagnostic update.

The teacher's factory screenshot displays speed 2000 / acceleration 100 for all
six joints, compared with our explicit 100 / 10. This is a potential lead, not
proof of a firmware or mechanical cause. The factory UI has previously shown
cached values, so distinguish displayed fields from confirmed applied settings.
Do not silently increase app speed twentyfold based on the screenshot. Await
observations of actual Servo 3 movement and the new fault details before choosing
a parameter-change test.

Validation: 121 unit tests and build pass, including Servo 3 positive-stall and
negative-success diagnostic cases. Browser checks exercise synthetic motion.

## Current rebuild: continuous speed-controlled movement

The teacher requested a rebuild for smooth joint control and smooth Home. This
authorizes the combined speed/acceleration/position packet researched in the
previous update. Every new jog and Home command explicitly sets speed 100 raw
units/second and acceleration 10. Home sends at most one destination per joint,
in order 2,3,4,5,1,6, rather than a chain of small waypoints. The requested Home
values remain unchanged. These are initial physical-test settings, not measured
velocity or acceleration guarantees.

The old narrow sample-window gates and repeated capture waits are removed from
direct controls. Valid readings within 500 ms permit commands; shorter feedback
gaps pause buttons without disarming. Idle gaps do not revoke Enable. During
movement, a 1.5-second feedback loss cancels future commands and disarms. Weak
frames are ignored while waiting for valid feedback. Actual failure reasons stay
visible. USB writes have a two-second deadline and retain ownership if unresolved.

Home completion is supervised per joint, with distance-based deadlines and
deviation checks. Stop cancels future targets and attempts a speed-controlled
hold at the latest measured position on the moving servo, when fresh readings
and an idle writer permit it. A pending write or stale reading can prevent this;
the page reports that condition. A hold request is not a certified physical stop.
Disconnect and page hiding also cancel and attempt that hold before cleanup.

Tests now model gradual servo movement for the browser workflow. The simulated
robot demonstrates the packet sequence and responsiveness, not real-arm smoothness.
Validation: 119 unit tests, 18 Chrome browser tests, and the TypeScript/Vite build
pass. The running local page reports 0.7.0-dev.13. No physical robot was connected
by the assistant; verify the feel of speed 100 / acceleration 10 on a single jog
before trying the complete Home return.
Earlier sections below describe superseded implementations.

## Current update: half-second jog recovery and speed-control research

Jog controls can accept the next click 500 ms after the preceding write completes,
provided the preceding move has settled and the last three fresh readings span
at least 200 ms with spread no greater than three. They no longer wait for a new
full one-second capture after each jog. Initial arming, manual setup, and fault
recovery retain their full observation window; Home retains its existing pacing.
No clicks queue while movement or a write is unresolved.

The factory app and manufacturer documentation agree on an atomic command carrying
acceleration, target position, and speed. An offline-only encoder and a concrete
[one-joint test proposal](./SPEED_CONTROL_REVIEW.md) are ready for approval. There
is no live caller for the new command. Speed-controlled Home is pending that
physical test and review of cancellation during a longer in-flight move.

Verification: 125 unit tests and the TypeScript/Vite build pass. Chrome directly
exercises all twelve jog buttons at 500 ms intervals with synthetic USB data.

This preview starts architecture packages A/B/C. It is not a complete safety
controller, full programming curriculum, or student live-robot release.

The simulator, passive inspection, and joint mapping pages now display the loaded
version in their headers. Vite fills these labels and the simulator footer from
`package.json` in development and production builds, so future version changes
need only one application version source.
The development server reads that source for each HTML response; a running server
does not retain an older label after the package version changes.

## This update: direct +/-20 controls and the requested Home

The teacher requested more direct control: reusable -20/+20 buttons on all six
servos, Home `[2050,2150,2100,2200,2000,1080]`, and a slow return. The main
`/mapping.html` now provides those controls. Connect, one per-session setup
confirmation, and Enable are followed by direct reusable jog buttons and Home.
No test-start review or consumed-attempt renewal is required for these actions.
The historical base approval and all old attempt markers remain unchanged.

Home uses a finite frozen route, one joint at a time in order 2,3,4,5,1,6.
Nominal increments are at most 10 raw units, completed writes are at least 1200 ms
apart, actual command delta is at most 20, and each step needs settled feedback.
No new firmware speed command is used; this paces the return rather than setting
the physical velocity of each step. Final feedback within nine raw units is
accepted. Stop cancels remaining steps and leaves USB connected; inspect and
Enable to jog or start a newly calculated return. There is no automatic restart.

Fresh stable full-checksum readings, single-writer ownership, command spacing,
step supervision, timeouts, and the durable manual holding interlock remain.
Healthy connections can recover from a fault with inspection, stable readings,
and deliberate Enable; outstanding writes still block new commands. The optional
release/restore section uses the existing factory commands and physical holding
confirmation. Reports export locally. No student hardware execution was enabled.

The earlier workflow is preserved at `/mapping-tests.html`; its Reference A stays
separate from the newly requested Home. Its page and regression tests retain the
prior one-shot approvals. The root prototype remains unchanged.

See [direct-control testing steps and exact behavior](./TEACHER_CONTROLS.md).
Verification: **122 unit tests, 18 Chrome browser tests, and the TypeScript/Vite
build pass**. Browser tests use synthetic USB data; the long gripper return is
tested with an accelerated clock. The final layout was visually inspected and
the running local server reports version 0.7.0-dev.11 with all six requested Home
values. Real hardware speed and clearance remain teacher validation.
The following sections describe the earlier commissioning workflow and history.

## Earlier update: teacher-reviewed starts and a usable page order

The teacher reported that Review current test start stayed unavailable and the
page order made testing difficult. The reported servo-2 value was first 2018,
then corrected to possibly 2108. The latter is outside the old 2004-2076 return
region. The underlying defect was applying a historical Home-route envelope to
the teacher's review of a small single-joint test. Those bounds were never
established as mechanical travel limits. Following the teacher's request, that
inherited restriction now applies only to the automatic staged-return route.

The page follows this workflow:

1. **Connect and inspect readings.** Connect is independent of the joint-test
   clearance checkbox and sends no application command. Stop stays visible when
   scrolling. Stable feedback still takes about one second after an action.
2. **Position the arm if needed.** Skip release/restore if already holding a
   suitable pose. If used, finish physical holding confirmation first.
3. **Review current test start.** Inspect holding, the physical pose, clearance
   for small positive tests, and cutoff access; check the box and click Review.
4. **Test one joint.** Select a joint, confirm clearance, Enable, then Send.
   Record its physical joint/direction and export observations just below.
5. **Teacher recovery** permits one more selected-joint attempt after inspection
   if a previous test is consumed. Review the current start first if needed.
   **Optional staged return** is at the bottom and is not a prerequisite.

The on-site teacher's review records the current stable six readings without
redefining Reference A. Single tests use relative start windows within 12 raw
units of the review; at Enable, target freezes at the latest selected reading
+20. Send still allows only 15-25 raw units of positive command from feedback.
Targets must be encodable (0-4095); that is a protocol validity check, not a
claim that the whole range is mechanically safe. The teacher reviews actual
clearance for this supervised test. There is no arbitrary target input,
automatic reverse direction, student hardware access, or expanded Home route.
The historical base test remains consumed and cannot be repeated here.

Joint retry review no longer inherits the Home-route envelope either. Return
retry still requires its original route bounds. Reviewing a pose never renews
a consumed test; the separate retry action preserves prior records. Selected
start drift, uncommanded-joint drift, full-checksum fresh stable telemetry,
command spacing, exclusive writer, feedback deadline, and manual-setup interlock
remain enforced. Unchecking joint clearance while idle no longer disconnects;
it still stops an enabled or running joint test.

Active pose reviews remain connection-only and expire on Stop, fault, manual
setup, return enable, disconnect, and reload. Local audit evidence persists in
the bounded review history and reports, including faulted attempt snapshots.
No new accounts, dependencies, uploads, or runtime network requests were added.

A prior browser regression also exposed a staged-return timing race. Scheduling
now waits for the shared 900 ms interval before dispatch, measured from write
completion. The interval remains enforced; it was not shortened.

## This build: joint suite and staged return

The teacher requested a build testing all remaining joints, then a staged return
covering all servos so the robot can reach Reference A before those tests.
`/mapping.html` now provides five separate deliberate tests (servos 2–6), teacher
observation fields, and one combined local report. Servo 1's confirmed clockwise
base test remains recorded and consumed; it is not offered for a repeat.

The staged return covers all six servos, skips joints already within +/-9 of
Reference A, previews its complete route, and requires separate Enable and Start.
From the teacher's reported `[2046,2009,1943,2048,2044,2052]`, it plans three shoulder
waypoints and seven elbow waypoints. It uses at most 16 raw units per nominal step,
checks actual readback before sending (maximum 25), waits for settled feedback,
and preserves at least 900 ms between writes. Tests and return share one guarded
writer and cannot overlap. Stop/fault cancels future commands without automatic retry.

This is a bounded teacher commissioning tool, not general calibrated Home or
student live control. Each attempt is consumed before its first write; reload
does not restore it. Teacher recovery now records an explicit review permitting
one more return or selected-joint attempt, with renewed clearance, fresh evidence,
and separate Enable/Send or Start. Original records remain. A pending write, fault
without reconnect, or stale feedback cannot be bypassed. Only the automatic
return remains confined to its historical start region.
Joint targets now freeze at current reading +20 at Enable, with <=5 drift before
Send, and starting windows accept Reference A +/-9. This fixes the mismatch
between the return's arrival readings and historical test starting values. The
9-unit settling tolerance matches the handoff's observed residual error; 16-unit
return steps retain the 25-unit maximum measured command without correction loops.
Numerical bounds are
local commissioning guards, not verified mechanical/collision limits. Physical
clearance, speed, force, and stopping behavior still require teacher validation.
See [exact bounds, targets, failure rules, and operating steps](./JOINT_SUITE_AND_HOME.md).

Verification: 101 unit tests, production TypeScript/Vite build, and 13 mocked
Chrome tests pass for manual positioning, current-pose review, recovery, joint tests, staged return,
simulation, and passive inspection. The assistant has not accessed real hardware. The
existing Blockly bundle-size warning remains; Chromebook performance is unverified.

The teacher confirmed factory All Off releases the arm, All On held a manually
changed pose in that test, Read Pos updates the factory number fields, and our
passive inspector matches the refreshed readings. The earlier readback concern
is resolved for this observation; it is not a general calibration guarantee.

The browser now implements **Enable manual positioning → Release all servos →
Restore servo holding → Confirm holding restored** on the teacher mapping page.
Separate support/clearance and physical-holding confirmations are required.
It uses the factory system command61 All Off/All On through the shared guarded
writer. No position target, reset, torque action on connect/Stop, or automatic
holding restoration is added. Tests/returns/retries remain blocked until manual
setup ends with physical confirmation and new fresh evidence. An interlock saved
before torque writes survives reload and is refreshed at each connection, including
pages opened before a different tab released the arm. Interruption leaves holding
unverified; late writes cannot resume setup. Physical support, cutoff access,
clear pinch areas, and adult supervision remain necessary. The teacher passed the
browser manual-positioning steps through holding confirmation; the assistant has
tested only synthetic USB streams. The revised current-pose flow needs teacher testing.

Local storage adds `nexarm.commissioning.manual-positioning.v1`: a durable holding-
verification interlock and the last50 command/confirmation events with times and
readings. Export includes `manualPositioning`, explicitly labeling torque state
as not measured. No new runtime network requests or dependencies were added.

## What works

- A separate TypeScript/Vite app, leaving root Connection Lab v0.6.1 untouched.
- Six simulated raw joint positions with separate target readings.
- An editable Blockly lesson with When Run clicked, Move virtual joint, and
  Repeat blocks; simulated +/-20 jogging and active-block highlighting.
- An SVG arm illustration with base turn, three bending joints, wrist roll, and
  gripper opening. Scaling is exaggerated for visibility and never used to plan
  physical movement. Reduced-motion preference freezes the drawing until settling
  or Stop while readings continue updating. An explicit Animate arm illustration
  checkbox shows whether animation is enabled and allows a session-only override.
  Reduced-motion users see why a round-trip program can otherwise look motionless.
- A restricted interpreter worker expands validated instructions to at most 100
  movement steps, with nesting/visit limits and a main-thread preparation timeout.
  Main-thread validation and the simulator's duration budget check the resulting
  plan again. Stop terminates preparation and cancels simulation; stale responses
  cannot start a replacement run. No generated JavaScript or eval is used.
- A frozen plan is used for each run; editor interaction is disabled while busy.
  Keyboard number fields edit the same Blockly program; full keyboard structural
  editing and screen-reader Blockly access still need dedicated validation.
- Single-operation ownership, Stop, Reset Simulation, and cancellation of old
  scheduled work. Hiding the page stops the simulated run.
- Input validation, a 100-step ceiling, and a 60-second virtual movement budget.
  Simulation timing and ranges are educational choices, never hardware settings.
- Pure factory-register packet encoding and bounded-buffer streaming decoding,
  exercised by synthetic fixtures. Full versus abbreviated-only checksum results
  are distinguished; only full-checksum exact-structure frames become positions.
- Local bundled assets, no remote runtime dependencies, and a production Content
  Security Policy that disables data connections. No project data is persisted.

The simulation entry does not access USB. A separate teacher inspection page now
supports explicitly requested, read-only serial connection and draft reference
capture/export. It does not access a writer, change modes, send packets, or move
the arm to a reference. See [the calibration plan](./CALIBRATION_PLAN.md) for setup,
limitations, evidence needed, and the approval process before any physical test.

## Teacher review

1. Follow the README's local startup instructions.
2. Predict which joints change during Run program; observe the highlighted blocks
   and illustrated base/arm. Open Program steps and keyboard editing to inspect
   the expanded sequence or edit numeric values without a pointer.
3. Change Repeat from 2 to 3. Run again: the elbow movement should repeat three
   times. Then press Stop partway through another run; values and drawing stop.
4. Reset Simulation. All values return to the virtual starting value 2048.
5. Try a joint's +/-20 controls. Other joints should remain unchanged.
6. Start the example, switch to another tab, and return. It should be stopped.
7. Reload. This preview discards state; there is no save feature yet.

The schematic readings do not model actual geometry, clearance, force, inertia,
or real robot dynamics. Simulation success does not approve a physical route.

## Tooling and privacy inventory

Pinned direct development dependencies: Vite 8.3.5, TypeScript 7.0.2,
Vitest 5.0.5, and Playwright Test 1.64.1. Vite and Vitest declare MIT licenses;
TypeScript and Playwright declare Apache-2.0 licenses. Their upstream license
files remain in installed packages. The committed npm
lockfile fixes transitive versions and integrity values. Review the complete
dependency/license inventory before a student release or adding runtime packages.
Blockly 13.4.0 is now a pinned Apache-2.0 runtime dependency. Its media is copied
from the installed package before dev/build and served locally; sound is disabled.
No CDN is used. Vite may emit its own build helper code. The build currently warns
about the Blockly bundle size (about 200 kB gzip); real Chromebook performance
remains a release check. The production CSP allows inline styles for Blockly's
injected CSS and field positioning, but continues to disallow inline scripts,
eval, and runtime data connections. The worker loads from the same origin.

The production app loads its HTML, CSS, and JavaScript from the same origin.
The mapping page retains the original servo-1 localStorage approval marker
(`nexarm.approval.reference-a-servo1-plus20.2026-10-22`), adds five independent
`nexarm.approval.joint-suite.servoN.positive.2026-10-22` markers, and uses
`nexarm.approval.staged-reference-a.2026-10-22` for the first return. Only attempted
scopes are stored. They contain scope/target/route and attempt time, no student or
USB identifiers, and are never uploaded. New recovery reviews, prior command/result
evidence, and raw readings persist under `nexarm.commissioning.retry-reviews.v1`;
consumed retries use separate original-scope `.retry.UUID` keys. Unused retry
permission is session-only and is revoked by Stop, disconnect, hiding, selection,
or reload. Teacher notes and current full results remain in memory until export,
except result snapshots retained at review; reload loses unsaved observations.
The schema-version-2 export includes history and review records. Do not
clear those markers to repeat movement; a new attempt requires review.
There are no accounts, cookies, analytics, telemetry upload,
project uploads, or external fonts. Hosting still receives normal asset-request
metadata. The local development server uses Vite's local update connection; use
the production build to inspect the shipped network policy.

Unit tests cover encoding, malformed and fragmented packets, weak-checksum
classification, simulated ownership, immutable snapshots, input rejection, and
cancellation. Chrome browser tests cover Run/Stop/Reset, demo completion, the
absence of USB access/runtime data requests in those flows, and viewport fit.
These checks do not replace actual Chromebook, student-account, assistive
technology, or hardware validation.

## Next work

[Factory software findings](./FACTORY_SOFTWARE_FINDINGS.md) provide a candidate
model: the supplied controller contains a URDF, arm meshes, and the 3D viewer's
joint-specific offsets/scales. Use the requested joint-suite observations to
check that hypothesis before representing its display as an accurate live model.
[The earlier servo-2 proposal](./SERVO_2_TEST_PROPOSAL.md) is superseded by the
teacher-requested suite and staged return documented above.

The first supplied reference and two photographs are summarized in
[Reference A review](./REFERENCE_A_REVIEW.md), including the exact proposed
single-axis command, preconditions, and observation/failure plan. The teacher has
approved and completed this first test. Its fixed command, feedback deadline,
and persisted no-repeat guard are retained; the current UI offers only remaining
tests. Follow the review document for the historical scope and recorded result. The teacher
completed the one attempt: servo 1 reported 2051 → 2066 toward target 2068, other
exported channels were unchanged, and a small clockwise movement was observed.
The teacher confirmed servo 1 is the base-turn joint and increasing raw values
rotate it clockwise when viewed directly from above. This establishes a local
mapping/direction, not degrees per raw unit, zero angle, travel limits, or reverse
behavior. The agent has not accessed a real robot. The later staged-return request
covers the bounded return described above, not a repeat of the base mapping test.

Following teacher testing, the approved servo-1 starting window is now 2043–2053
inclusive. The fixed target remains 2068 (a 15–25-unit positive command). Every
sample in the retained observation window must satisfy that range; freshness,
other-joint checks, and consumed-approval persistence remain unchanged.

Expand the small language with capped waits, conditionals, typed variables, functions,
project storage, and keyboard accessibility in reviewable packages. The complete
live arming/fault state machine, feedback supervisor, parser processing deadlines,
robot profiles, commissioning, and physical Stop procedure remain future work.

Prompt for a reasoning-level change before beginning live safety/serial failure
design or movement review. New physical movement remains subject to the teacher's
explicit command and test-plan approval.
