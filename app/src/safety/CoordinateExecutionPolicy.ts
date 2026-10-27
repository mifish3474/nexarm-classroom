// Operator reported arm/shoulder proximity creating a pinch point and lurching
// coordinate playback. Keep direct command 8 blocked even now that command 7
// can supply targets to the separately checked joint-space executor.
export const COORDINATE_EXECUTION_BLOCKED_REASON='Direct XYZ/P/R/C movement is disabled. Coordinates must first be calculated and checked against all six joint operating ranges, then executed as joint targets.';
