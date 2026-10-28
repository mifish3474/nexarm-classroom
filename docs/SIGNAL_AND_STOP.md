# Signal tower and Stop: dev.55

The operator confirmed the dev.53 fast-hold-then-release test works. Dev.55 retains
that sequence as the normal **Stop button** and **Spacebar** action on the coding
page. **Stop motion** on the sliders/setup page uses it too. The separate test
button is removed.

## What Stop now does

1. Cancel preparation, the program/Home return, pending slider targets and key
   listening. No later program action resumes automatically.
2. Submit the proven six-joint hold at **speed 600 / acceleration 100**, taking
   priority after an already-active USB write.
3. After the hold stream write completes, collect three new strong-checksum
   position reports spanning at least 150 ms with no more than nine raw units
   of spread on any joint. Send factory **All Off** once after those readings.

The zero-gap dev.54 version reported release sent but did not physically release
on the arm. Dev.55 restores the post-hold gate that worked in dev.53, with Stop
integration retained. This normally adds a few tenths of a second. The exact
firmware cause is not confirmed; host write completion does not establish that
the controller has finished processing a command batch. The normal half-second
command interval is bypassed, but the feedback gate is not. Support the arm,
which can sag when holding releases.

Repeated Stop presses are combined while the sequence runs. If release was already
requested, another Stop does not assume physical release or restore holding.
If the arm still holds after Release sent, use **Release holding** to send All Off
again; the button becomes available after the normal command interval. This
explicit retry sends no position goal and never enables torque. Use
**Restore holding** deliberately, with support maintained, before another Run.
There is no new Enable or confirmation step, and Restore never resumes a program.

A failed/expired write, stale feedback, lost connection or lifecycle cancellation
prevents an unsent release from being replayed later. If release is unavailable,
Stop still cancels the program and attempts its existing hold where possible;
read the status rather than assuming holding released. A release already sent
cannot be recalled. The durable holding-recovery record is saved before All Off,
so reload/interrupted USB cannot silently authorize movement.

## Explicit Stop versus leaving the page

Only an explicit Stop/Space or setup Stop motion requests this combined sequence.
Disconnect, page hiding, errors, and existing focus-loss cancellation do not add
release. They can cancel a release that has not been sent. Reconnecting, opening
a file, Check, ordinary program completion, and Restore never start a release
or resume a program. Diagnostic and legacy commissioning pages retain their own
read-only/cancellation controls.

Space works only when the coding page receives the key. While a program or key
session is active, it takes priority over fields, menus and modifiers. Idle text
entry still accepts ordinary spaces. Holding/releasing Space never repeats or
restarts code. It is not a computer-wide shortcut; the physical power cutoff
remains the independent option taught in the classroom safety lesson.

## Signal tower

| Appearance | Software activity |
| --- | --- |
| Pulsing green | Program or saved-position motion running, including Home and Wait |
| Steady amber | Listening for keys, checking, or holding needs attention; read the label |
| Steady red | Stop requested or a fault; read status and holding recovery instructions |
| Gray | Idle, connecting, or disconnected; read the label |

The fixed local SVG has text labels. Its slow 1.5-second pulse becomes steady
green with the system reduced-motion preference. It reports application state,
not holding force, clearance, pinch detection or verified physical standstill.

## Hardware check

1. Refresh and confirm **0.7.0-dev.55**. Connect with the arm stationary, supported,
   and the gripper empty.
2. Click **Stop**. Expect a fast hold, a short Waiting for steady readings phase, then
   Release sent. That label describes a USB write, not measured holding. Observe
   actual release while maintaining support.
3. Click **Restore holding**, wait for fresh readiness, and check that it holds
   before removing support. Nothing should resume on its own.
4. Repeat with **Space** during an already-tested movement, with support and the
   sweep clear. Observe the restored stop/release response. End the check if
   motion is unexpected; do not restrain a joint.
5. Export robot diagnostics before closing the page if anything differs from
   expectations. Report the delay and any sag, twitch, or backward correction.

In the export, diagnostics.stopping retains hold-request/write timing and bounded
post-stop readings. diagnostics.stopThenRelease reports holdWriteFinishedAtMs,
releaseSubmittedAtMs, releaseFinishedAtMs, the phase and the policy
post-hold-steady-feedback, with the selected post-hold samples.
These help separate host delay from physical
behavior; they do not certify stopping time or confirm torque state.

## Existing keyboard programs

Space stays reserved for Stop. Arrows, letters and digits remain programmable.
Old Space hats load as Choose key (Space is Stop), preserving code and used pose
snapshots. Assign a replacement before Check, Run or Save. No automatic binding,
key logging, upload, custom firmware, motion-profile change or automatic holding
restoration is introduced by this update.
