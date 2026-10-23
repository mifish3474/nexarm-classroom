# Position accuracy observations, 2026-10-23

The user supplied a new browser diagnostic report and a factory-app comparison.
These are observations on this arm, not a measured policy for all classroom arms.

## Browser report: `nexarm-robot-diagnostics (1).json`

One six-joint batch was submitted at speed 600 / acceleration 10. S3 requested
2838 from 2016. Its reported position reached 2810 after about 2.07 seconds and
remained exactly 2810 in every subsequent recorded sample through 6.66 seconds.
The move timed out at approximately 6.79 seconds, 28 units short. The other five
joints were within 0–4 units of target in the fault snapshot. No intervening goal
write explains the plateau; the next write was a later operator Stop hold.
Extending this attempt's timeout would not address the observed stationary offset.

## User's factory-app comparison

| Joint | Requested | Reported | Reported minus requested |
| --- | ---: | ---: | ---: |
| J1 | 2004 | 2006 | +2 |
| J2 | 1226 | 1224 | -2 |
| J3 | 3080 | 3060 | -20 |
| J4 | 3197 | 3083 | -114 |
| J5 | 2084 | 2081 | -3 |
| J6 | 1894 | 1897 | +3 |

The screenshot displays speed 2000 / acceleration 100 in the joint panels and
an action-group row with frame time 1000 ms. Its note states action-group speed
is calculated from frame time, so this is not proof of a matched 2000/100 move.
The J3/J4 targets exceed the currently requested ranges of 2000–2900 and
1250–3000. J4's actual 3083 closely matches the earlier browser plateau of 3084;
J3's 3060 is also close to the earlier 3058. This strengthens the evidence that
those earlier endpoints were not solely a browser-specific issue, but does not
identify a controller limit, mechanical resistance, available force or other cause.

The factory example does not establish that a 114-unit error is normal inside
the chosen operating ranges. The separate browser example does establish a
stable 28-unit in-range shortfall on J3 in that pose. Both range validation and
settling accuracy remain relevant; neither can substitute for the other.

Dev.31 simplifies readiness/restore controls at the user's request. It retains
the current ±12 target tolerance and cancels subsequent blocks on a larger
shortfall. It does not automatically retry, correct or advance past this failure.
