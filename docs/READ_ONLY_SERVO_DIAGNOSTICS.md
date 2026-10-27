# Read-only servo diagnostics — dev.45

The first dev.44 hardware scan received live pose feedback but no usable direct
register replies. Its valid six-byte controller-version response is supported
in dev.45: factory decoding identifies ESP32 1.0.2 and AT32 1.0.2. Dev.45 tries
the factory configuration-read API first, then short direct-position probes.
Broader reads are skipped for a joint if its short probe times out. This avoids
blindly repeating failed blocks and keeps controller API results separate from
direct-servo access. No protection or movement behavior is changed.

This is a hardware-observation step, not obstruction testing or a validated
pinch-protection system. The operator authorized read-only diagnostics on
2026-10-27. No protection settings, torque, motion behavior or calibration are
changed by the page. Actual USB readings require the operator's explicit port
selection and scan click; automated tests use mocked ports.

## Operator steps

1. Disconnect the classroom/setup page from the robot and close the factory app
   or any other serial application. Leave the robot stationary in its established
   supported setup, with hands clear and physical cutoff access. Do not introduce
   an obstruction, restrain a powered joint or move it for this scan.
2. Open `http://127.0.0.1:5173/servo-diagnostics.html`, or use **Read-only servo
   diagnostics** in the main page footer. Refresh and confirm **0.7.0-dev.45**.
3. Choose **Connect for diagnostics**, then select the robot port. Connection
   sends no application requests. Opening USB can affect controller startup;
   the page does not assert that hardware reset behavior is absent.
4. Choose **Read diagnostics**. The bounded scan normally takes several seconds;
   unavailable reads can make it take up to roughly a minute. Wait for Complete,
   or use **Stop reads** / **Disconnect** to cancel future requests. Stop reads
   sends no arm stop, holding or torque command; it is not an emergency stop.
5. Choose **Export read-only diagnostics** and share
   `nexarm-read-only-servo-diagnostics.json` for interpretation. Missing replies,
   device errors, zeros and partial results are useful evidence. No motion test
   is needed to produce the export. Export before reconnecting or closing.

There is one independent scan per connection. Disconnect and reconnect to take
another. A reconnect resets results but does not start scanning automatically.
There are no review approvals, confirmation checkboxes or persistent attempt locks.

## What is requested

Maximum 49 fixed packets, one outstanding request at a time, in this order:

| Read | Packet scope | Count |
| --- | --- | ---: |
| Controller version | System ID255 / function1 | 1 |
| Factory overload configuration | System ID255 / function71 / servo ID parameter | 6 |
| Factory maximum torque | System ID255 / function75 / servo ID parameter | 6 |
| Short direct-position probe | IDs1–6 / READ2 / address0x38 / 2 bytes | 6 |
| Servo identity | IDs1–6 / READ2 / address0x00 / 5 bytes | 6 |
| Raw protection configuration | IDs1–6 / READ2 / address0x0D / 27 bytes | 6 |
| Raw status snapshot, three rounds | IDs1–6 / READ2 / address0x38 / 15 bytes | 18 |

When all six short position reads time out, all 30 broader direct reads are
skipped: only 19 requests are sent. Factory queries are fixed read commands
used by the supplied PC software, not adjacent write commands 72/76. Full-checksum
system replies must echo the expected command and servo ID. The two query paths
are independent; factory configuration access does not establish live load or
fault access.

Only exact packets from this whitelist can reach the diagnostic writer. No
WRITE, ACTION, torque, Home, coordinate, calibration, firmware-update, mode,
NVS-unlock or arbitrary-register packet is available. The dedicated controller
imports no movement or setting encoder, and does not instantiate the motion
controller. The existing exclusive `nexarm-classroom-usb` lock prevents this page
from owning the robot alongside another application tab.

## Interpreting the results

- Controller versions accept one legacy raw byte, a three-byte ESP32 version,
  or the six-byte ESP32/AT32 format explicitly handled by the factory viewer.
- Factory overload results preserve cap, delay and threshold bytes. A legacy
  three-byte response omits the threshold; it is reported as missing, not zero.
  Factory maximum-torque values are unsigned little-endian readings. A returned
  zero is not automatically interpreted as disabled torque, zero force or a
  healthy condition. These are configuration values, not live overload alarms.

- Identity reports firmware bytes and an **unmapped raw model code**. There is
  no verified code-to-model lookup yet; zero/unknown codes are not identified
  as a servo model or firmware compatibility claim.
- Protection data is retained as a raw block, with provisional field offsets
  for the protection byte, overload cap/delay and threshold bytes. Maximum-torque
  bytes are preserved in the export. The page does not assign confirmed units,
  claim protection is enabled or resolve conflicting register definitions.
- Status candidates include position, speed, load, current, status/fault byte,
  voltage byte and temperature byte. They remain explicitly **raw and unverified**.
  Current/load units, signedness/scaling and fault semantics need confirmation
  against the installed model and firmware. All-zero data is not a healthy verdict.
- Full checksums and exact expected payload lengths are required for decoded
  observations. The servo reply's third field is an ERROR byte, not an echoed
  command. Nonzero values are preserved as device-error results, not converted
  into healthy status or zero current. Their payloads remain available.
- A timeout means no matching usable reply—not zero load/current, no overload,
  a missing servo or proof that a field is unsupported. Abbreviated-checksum,
  wrong-ID and wrong-layout frames cannot fill values. Relevant rejected frames
  are retained separately, with bounded history.
- Ordinary passive command-11 feedback is labeled separately. It cannot satisfy
  a diagnostic read or become load/current/fault data.

Read addresses come from the manufacturer material linked in
[SAFETY_RESEARCH.md](./SAFETY_RESEARCH.md). The observed documentation conflicts
are why this page collects raw data rather than automatically configuring servo
protection or asserting engineering units.

## Bounds, cancellation and privacy

The reply deadline is one second, the USB-write deadline two seconds, and there
is a 100 ms gap after resolving a read before another request. No retries or
unbounded background polling occur. If a servo/layout read times out, later
samples with that same reply shape are skipped so a delayed old response is not
misidentified as a new sample. For direct reads no wire transaction ID or echoed
address exists; correlation uses one outstanding read, ID and layout. Factory
configuration replies also match their function and payload servo ID. This is diagnostic matching,
not proof of safety response time or a hardware freshness guarantee.

Stop, disconnect, hidden page, stream loss or a write fault cancels future reads.
Late callbacks cannot restart a scan. Port cleanup waits for any in-flight writer;
if USB never resolves, the page remains closing rather than authorizing another
connection over it. Results/partial results remain exportable until a new connection.

At most 31 result records and 40 relevant rejected-reply records are kept, plus
the latest passive pose. Data stays in memory until an explicit local download.
No USB serial number or port identity is collected, no browser storage is used,
and no data is uploaded. Exported snapshots are detached from internal state.

## Next decision

Use the export to establish which identities, settings and status blocks the
installed USB bridge returns, whether payloads look plausible, which error bytes
are present, and whether repeated samples are consistent. Do not change torque
or thresholds from this report alone. The scan is deliberately too limited to
measure pinch forces or qualify protection latency. Any later protection test
needs a separately reviewed hardware plan, not a hand-held obstruction.
