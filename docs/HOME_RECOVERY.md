# Restore & Return Home: dev.56

The Positions panel has two deliberate recovery choices:

- **Restore & Return Home** restores holding if needed, waits for fresh steady
  readings, then sends the established six-joint Home movement. It checks new
  steady readings near Home before displaying **Ready at Home**.
- **Hold current position** restores holding at the placed pose. It sends no
  Home target. Use this after teaching a position you want to keep.

Neither choice runs blocks or resumes keyboard listening. Choose Run separately.
If already holding near Home, the primary action verifies new readings without
sending a redundant return. No Enable or confirmation checkbox is added.

Home remains J1–J6: **2050, 2150, 2100, 2200, 2000, 1080**. Its existing
simultaneous targets use per-joint speeds capped at 600 and acceleration 10.
Recovery requires three fresh steady reports before movement and after the Home
frame, with every joint within 40 raw units of Home. This verifies reported
positions, not physical holding force or a clear route.

Support the arm while holding is released and through restoration. Check holding
before removing support; keep the complete return sweep clear. A known Home
destination does not guarantee a collision-free route from every starting pose.
The button is intentionally not labeled “Safe Position.”

## Hardware check

1. Refresh and confirm **0.7.0-dev.56**. Connect with the base secured, gripper
   empty and physical power cutoff accessible. Use a supported pose whose path
   to Home is already clear.
2. After Release holding, click **Restore & Return Home**. Expect Restoring
   holding, Returning Home, Checking Home, then Ready at Home. Maintain support
   through holding restoration and keep hands clear of the moving sweep.
   No loaded blocks or key events should execute.
3. From a supported taught pose, try **Hold current position** separately. The
   placed pose should hold without a Home movement. Verify physical holding
   before removing support.
4. During a previously checked return, try **Stop** or **Space** with support
   prepared. Expect the established fast hold, fresh steady readings, then
   Release sent. Recovery must not resume. Release sent reports a host write;
   observe actual release while supporting the arm.
5. If Home cannot be verified, inspect the status and export robot diagnostics.
   There is no automatic correction or retry. Do not force a resistant joint.

Stop/release timing remains the hardware-tested dev.55 sequence. Focus loss or
disconnect cancels recovery without adding a release request. Stop during an
unverified holding restoration may leave Recovery required rather than assume
holding is established. Reconnect if USB delivery becomes uncertain.

Diagnostics include `diagnostics.homeRecovery`, its phase/message and Home
tolerance. `routeClearanceVerified` and `physicalHoldingVerified` remain false.
Automated tests use mocked USB and position feedback; they cannot establish
physical clearance, stopping distance or holding behavior. No firmware changes
are involved.
