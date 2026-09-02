// Weight suggestion, shared by the Log Workout prefill and the per-exercise
// "try X" line so the two can never disagree.
//
// The naive version — "did you hit the target reps? then add the increment" —
// breaks the moment the rep target changes between phases or programs. Moving
// from a 5-8 block to a 10-15 one, it kept suggesting the 6-rep weight for a
// 10-rep set: 90 lb incline press became "hold at 90" when the real answer
// was 80.
//
// So convert through estimated 1RM instead. Epley (w * (1 + reps/30)) is the
// usual one; it's fitted to roughly 1-10 reps and drifts optimistic above
// that, but it's being used here to compare two points on the SAME curve, so
// the bias largely cancels.

/** Round to the nearest loadable step (2.5 or 5 lb). */
function roundTo(value, step){
  return Math.round(value / step) * step;
}

/**
 * @param {number} lastWeight  weight from the most recent working set
 * @param {number} lastReps    reps achieved at that weight
 * @param {number} goalReps    low end of the new target range
 * @param {number} increment   smallest sensible jump (5 on legs, else 2.5)
 * @returns {number|null} suggested weight, or null if there's nothing to go on
 */
export function suggestWeight(lastWeight, lastReps, goalReps, increment){
  if(!isFinite(lastWeight) || !isFinite(lastReps) || lastReps <= 0) return null;
  if(lastWeight <= 0) return lastWeight;          // bodyweight - nothing to scale
  if(!goalReps) return lastWeight;                 // no target parsed; hold

  const e1rm = lastWeight * (1 + lastReps / 30);
  let suggested = roundTo(e1rm / (1 + goalReps / 30), increment);

  // Same rep range as last time and the target was met: the conversion lands
  // back on the same weight, so nudge it up. This is the ordinary
  // week-to-week progression case.
  if(lastReps >= goalReps && suggested <= lastWeight){
    suggested = lastWeight + increment;
  }
  return suggested;
}
