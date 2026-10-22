# Factory software inspection: a better path to model calibration

Date: 2026-10-22  
Scope: static inspection of the teacher-supplied NexArm.exe; no program launch,
USB access, firmware operation, or physical movement

## Main finding

The supplied controller contains a robot description, arm meshes, and the
servo-to-angle conversion used by its 3D viewer. These address much of what the
illustrative simulator was missing. Use these as a manufacturer-software-derived
candidate model, then validate against the actual arm; do not rediscover every
offset by physical probing or confuse this model with a commissioned safety profile.

The servo-2 movement proposal is deferred while this non-motion route is pursued.
Its approval was never given. The completed servo-1 approval remains consumed.

## Reproducible inspection and provenance

- Input: teacher-supplied `NexArm.exe`, 66,846,476 bytes.
- SHA-256: `85405602fc2ca6f67dbfb9bb6bb9c0cd38f187f00d4fe7b9a55f33e833ea9fa1`.
- Packaging: x64 PE with a PyInstaller archive, Python 3.8, PyQt5 application.
- Archive index: 293 entries, including `ui/nexarm.urdf`, eleven STL files,
  and the Python module archive `PYZ.pyz`.
- Relevant modules include `nexarm_qt.ui.arm_3d_widget`, `urdf_parser`,
  `servo_tab`, `coord_tab`, `teach_tab`, `comm_manager`, and `constants`.

Local helper commands, which inspect data and never launch/import the binary:

```powershell
node scripts/inspect-factory.mjs C:\path\to\NexArm.exe
node scripts/read-python38-data.mjs
```

The first helper reads the archive directory and extracts only the URDF, main
marshaled code data, and PYZ module archive. The second parses Python 3.8 marshaled
objects and decompresses selected modules to inspectable JSON. It does not run
the Python bytecode. Function bodies were inspected as static instructions with
the [CPython 3.8 opcode definitions](https://github.com/python/cpython/blob/3.8/Lib/opcode.py).
This is targeted static analysis, not a claim to have reconstructed/tested the
entire controller or its firmware.

Extracted material stays under ignored `.analysis/nexarm-factory/`. No executable,
DLL, original mesh, or proprietary module was added to application assets or
committed source. Review asset provenance and reuse permission before bundling
the manufacturer's full meshes/model into a distributable classroom build.

## Factory 3D viewer conversion

`Arm3DWidget._servo_to_angles` computes, independently for each index:

```text
model_angle_degrees = (raw - center) × degrees_per_raw × servo_direction × urdf_direction
model_angle_radians = radians(model_angle_degrees)
```

The class assigns the following constants:

| Servo | Viewer label | Center | Degrees/raw | Servo direction | URDF direction | Combined sign |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | J1 Base | 2048 | 0.05859375 | +1 | +1 | +1 |
| 2 | J2 Shoulder | 2048 | 0.087890625 | +1 | -1 | -1 |
| 3 | J3 Elbow | 1198 | 0.087890625 | -1 | +1 | -1 |
| 4 | J4 Wrist | 1238 | 0.087890625 | -1 | -1 | +1 |
| 5 | J5 Rotate | 2048 | 0.05859375 | -1 | +1 | -1 |
| 6 | J6 Claw | 2048 | 0.05859375 | -1 | +1 | -1 |

These are model-space angles, not a universal human convention such as positive
means upward. Gripper geometry/coupling needs its own model treatment; do not
represent all six channels as one simple chain of six arm revolute joints.

Applying the formula to teacher Reference A gives approximately:

```text
Raw:    [2048, 2048, 2047, 2048, 2042, 2053]
Model:  [0°,   0°,   -74.62°, 71.19°, 0.35°, -0.29°]
```

This explains why the physical arm is bent even though every raw reading is near
2048: the elbow and wrist model centers are **1198 and 1238**, not 2048. These
centers are conversion offsets; they are not commands to move to those numbers.
Do not reset the device's servo centers to match them.

## Robot geometry and consistency with the physical observation

The bundled URDF is named `NexArm0326new`. It describes links, transforms, axes,
mesh references, and model limits. The main moving chain is `joint1` through
`joint5`; it additionally describes a fixed camera attachment, gripper links,
a gripper-base revolute joint, and prismatic jaws. The camera attachment is not
evidence that the classroom's basic arm has a camera.

Selected main-chain origin translations and axes, exactly as supplied:

| Joint | Parent → child | Origin XYZ | Axis XYZ |
| --- | --- | --- | --- |
| 1 | base_link → link1 | 0.00042383, 0, 0.071003 | 0, 0, -1 |
| 2 | link1 → link2 | -0.00041844, 0.03728, 0.039446 | 0, 1, 0 |
| 3 | link2 → link3 | 0.0348, -0.01893, 0.22535 | 0, 1, 0 |
| 4 | link3 → link4 | 0.027316, 0, -0.14239 | 0, 1, 0 |
| 5 | link4 → link5 | 0.049832, -0.018351, -0.00031098 | 0.99998, 0, -0.0060546 |

All five origins have zero RPY in this file. Preserve complete transforms and
units when implementing forward kinematics; do not substitute only scalar lengths
or guessed screen angles. Tool/jaw attachments add further transforms.

Joint 1's negative-Z axis, combined with a positive model-angle conversion, is
consistent with the teacher-confirmed clockwise base rotation viewed from above.
This supports the model's convention; it is not an independent measurement of
degrees/raw. The other axes still require comparison with the physical pose and
factory viewer, rather than being marked fully verified from software alone.

The main URDF joint limits are repeatedly +/-2.09 radians, with zero velocity
entries and other apparent export placeholders. **Do not adopt those as safe
classroom limits or usable speed settings.** Mesh/collision elements alone are
not a working collision checker or a validated safe path planner.

## Telemetry and factory command clues

`CommManager.handle_packet` treats system command 11 (`0x0B`) as current
coordinates and accepts a payload of at least 24 bytes. Its static decode path:

- Bytes 0–5: three little-endian signed 16-bit values named x, y, z.
- Bytes 6–11: three more signed values named raw pitch, raw roll, raw claw.
  Pitch is divided by ten; this branch does not apply that scaling to roll/claw.
- Bytes 12–23: six little-endian signed 16-bit servo values.

This independently supports the current app's last-12-byte position extraction
for the known 0..4095 range. The leading fields now have candidate meanings;
their units, accuracy, firmware applicability, and coordinate frame still need
validation before displaying them as trustworthy XYZ or orientation.

The constants table includes read-kinematics-parameters (64), read-joint-angles
(65), read-TCP-pose (66), and coordinate-limits queries (80), along with many write
and calibration commands. Their presence is a research lead, not proof that this
classroom firmware implements them, and not permission to send them. No new
diagnostic, reset, mode, torque, or movement command was added during inspection.
In particular, a constant named Stop All Motor must not be assumed to stop the
arm safely merely because its name sounds useful.

## Home, reset, and calibration are different

The factory servo-tab `servo_home` sets six position values to 2048 and calls
the servo-send routine for each ID. It is a physical action, not a display reset.
The 3D-view `_home_all` instead fills coordinate fields with X=200, Y=0, Z=200,
Pitch=0, Roll=0, Claw=0, Time=1000 and invokes its coordinate sender. Units and
actual firmware path must be verified; these values are not approved targets.

The servo-tab `servo_cali_all` asks for confirmation and sends command 88,
Calibrate Center, once per servo. Its confirmation text describes setting the
current positions as the servo midpoints and warns the operation is irreversible.
Do not invoke this to make our illustration line up: changing persistent device
references could invalidate existing geometry, observations, and movement guards.

## Recommended next work

1. Implement an independent, simulation-only candidate model using the recovered
   conversions and main-chain transforms. Test the arithmetic and forward
   kinematics; do not enable live coordinate movement or alter approved motion.
2. Compare the rendered Reference A and post-servo-1 pose with the teacher's
   photographs and, where useful, a view in the already-used factory app. The
   initial browser view can use an original schematic rather than redistributing
   full manufacturer meshes. Keep it labeled factory-derived/unvalidated.
3. Allow read-only live feedback to drive that candidate model only through an
   explicit teacher mode, with clear stale/integrity labels. Simulation remains
   separate and never silently connects. This supplies visual synchronization
   without moving the arm or changing servo calibration.
4. Use the model and existing physical observation to identify the small number
   of remaining validation questions. Resume specifically approved physical
   tests only where needed, instead of treating every numerical relationship as
   unknown and discovering it by movement.
5. Establish commissioned limits, routes, payload/gripper constraints, physical
   stop/failure procedure, and repeatability separately. Only then consider a
   physical move-to-lesson-start workflow or advanced XYZ execution.

This discovery substantially reduces uncertainty in geometry and visual mapping.
It does not establish classroom safety or a delivery-time guarantee, and it does
not authorize automatic Home, center calibration, torque-off, or hand-guiding.
