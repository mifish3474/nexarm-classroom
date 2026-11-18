// Coordinate programming is retired. Keep both calculation and native motion
// requests blocked at the writer, even if a stale caller retains an encoder.
export const COORDINATE_EXECUTION_BLOCKED_REASON='XYZ coordinate programming is no longer supported. Use joint moves or saved joint positions.';
