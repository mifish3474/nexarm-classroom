# Temporary servo observer

**Historical only. The operator has ruled out custom ESP32/AT32 firmware. Do not
build or install this observer for further project development.** Factory firmware
was restored after the completed experiment.

Engineering diagnostic only; no classroom use. One approved passive/J1-read
experiment completed and the original application was restored. Read the
[results](../../docs/SERVO_OBSERVER_RESULTS.md) and
[review/recovery plan](../../docs/SERVO_OBSERVER_REVIEW.md) before any proposed
reuse. The completed experiment does not authorize another installation.

The observer records the ESP32-facing UART before any factory response filter.
Startup sends no servo packets. `CAPTURE` is passive. An explicit `POS 1`–`POS 6`
line permits only a fixed position-register read. No motion/configuration command
encoder or binary passthrough is present. Holding is not guaranteed while the
normal application is absent.

Build only with `scripts/build-servo-observer.ps1` and its pinned isolated tools.
It supplies the flash-write guards, checks that normal Arduino/NVS startup is
absent, and emits an audit. Do not use Arduino Upload: only a separately reviewed
application-only write is proposed. The stock application/partition backups
remain local and are not distributed with this source.
