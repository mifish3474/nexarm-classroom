# Signal tower and Stop: dev.54

The operator confirmed the dev.53 fast-hold-then-release test works. Dev.54 makes
that sequence the normal **Stop button** and **Spacebar** action on the coding
page. **Stop motion** on the sliders/setup page uses it too. The separate test
button is removed.

## What Stop now does

1. Cancel preparation, the program/Home return, pending slider targets and key
   listening. No later program action resumes automatically.
2. Submit the proven six-joint hold at **speed 600 / acceleration 100**, taking
   priority after an already-active USB write.
3. As soon as the hold stream write completes, send factory **All Off** once,
   provided the connection is still valid and position feedback is fresh.

There is **no added delay or three-reading settling wait** between the hold
write and release. The normal half-second command interval does not apply to
this sequence. A completed USB write is not proof that the arm has physically
stopped before release. The shortened response needs an operator hardware check.
Support the arm, which can sag when holding releases.

Repeated Stop presses are combined while the sequence runs. If holding is already
released, another Stop does not issue another command or restore holding. Use
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

1. Refresh and confirm **0.7.0-dev.54**. Connect with the arm stationary, supported,
   and the gripper empty.
2. Click **Stop**. Expect a fast hold followed promptly by Release command sent /
   Released. Observe actual release while maintaining support.
3. Click **Restore holding**, wait for fresh readiness, and check that it holds
   before removing support. Nothing should resume on its own.
4. Repeat with **Space** during an already-tested movement, with support and the
   sweep clear. Observe whether the shorter interval changes the stop/release
   response. End the check if motion is unexpected; do not restrain a joint.
5. Export robot diagnostics before closing the page if anything differs from
   expectations. Report the delay and any sag, twitch, or backward correction.

In the export, diagnostics.stopping retains hold-request/write timing and bounded
post-stop readings. diagnostics.stopThenRelease reports holdWriteFinishedAtMs,
releaseSubmittedAtMs, releaseFinishedAtMs, the phase and the policy
immediately-after-hold-write. These help separate host delay from physical
behavior; they do not certify stopping time or confirm torque state.

## Existing keyboard programs

Space stays reserved for Stop. Arrows, letters and digits remain programmable.
Old Space hats load as Choose key (Space is Stop), preserving code and used pose
snapshots. Assign a replacement before Check, Run or Save. No automatic binding,
key logging, upload, custom firmware, motion-profile change or automatic holding
restoration is introduced by this update.
