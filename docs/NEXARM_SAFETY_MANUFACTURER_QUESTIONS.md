# Draft manufacturer questions — 2026-10-27

Draft only. Nothing has been sent to Hiwonder. No device settings or firmware
have been changed. Prepared from the operator's read-only USB capture to avoid
further speculative setting changes or obstruction tests.

We are evaluating a NexArm for supervised middle-school programming. We need to
understand fault monitoring and overload response before any student deployment.

Observed on the installed factory controller:

- Firmware reply: ESP32 1.0.2 / AT32 1.0.2, decoded by the supplied PC software's
  six-byte layout.
- Passive XYZ/P/R/C and six joint positions are received normally.
- System read commands 71 and 75 return fully checksummed configuration results
  for all six joints, matching the factory software.
- Direct servo READ2 requests for two bytes at 0x38 receive no usable replies
  for IDs1–6. Larger direct register reads in the earlier scan also received none.
- Overload bytes (cap / delay / threshold): J1–J4 20/200/80, J5 20/200/40,
  J6 20/50/20. Maximum-torque read returns 1000 except J2, which returns zero.
  We have not interpreted that zero as disabled torque or zero force.

Please clarify:

1. **Installed servo identification:** How can we identify each joint's servo
   model and firmware through the factory USB interface, without modifying modes
   or firmware? Please provide the matching authoritative register/protocol map.
2. **Live telemetry:** Does this controller firmware expose per-joint motor
   current, load, moving state, overload/overcurrent status and protection-enable
   bits? Which USB request/reply layouts and polling limits apply? Does it forward
   servo READ responses, or is a separate system command required?
3. **Configuration semantics:** For the overload fields returned by system71,
   what are their units, valid ranges and exact meanings on these firmware
   versions? What does the J2 maximum-torque reply of zero mean? Can it indicate
   an internal read failure or a value with special semantics?
4. **Trigger and recovery:** Does overload reduce output torque, stop movement,
   release torque or latch a fault? What is guaranteed about delay, residual
   force, reset/recovery and whether the next position command can resume motion?
5. **Whole-arm behavior:** When one joint faults, do other joints and queued
   action frames continue? Is there a documented coordinated protective stop,
   and what happens on USB/host loss? How does gravity support behave?
6. **Stopping interface:** Which command, if any, specifically stops all arm
   servos? Is command14 limited to peripheral/chassis motors? Please distinguish
   holding, torque removal and action-group cancellation.
7. **Intended safety use:** Are these protections solely motor/equipment
   protection, or is there validated human-contact/pinch protection? If the
   latter, please provide the applicable test conditions, force/pressure and
   stopping specifications, certification and installation requirements.

We are requesting documentation and a read-only diagnostic route first. We do
not want suggested torque increases, firmware flashing or powered hand-restraint
tests as substitutes for understanding the protection behavior.
