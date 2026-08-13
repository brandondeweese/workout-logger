---
name: workout-metrics
description: Log ONE workout session (a run, ride, lift, or other activity) from HealthKit into the Supabase workout_logs table, with its duration, distance, energy and heart rate samples. Trigger on "push my workout", "log this run", "save my workout", "sync my run", "I just finished a workout". Use this for an individual activity - for a day's sleep, HRV, resting HR, SpO2 or step totals, use the health-metrics-sync skill instead.
---

# Workout Metrics

Copy ONE workout from HealthKit into `workout_logs` in Supabase project
`rrqljyhfjoyancgfefcb`.

**Your only job is copying raw numbers into the columns listed below.**
You do not calculate anything. You do not add columns. You do not compute
Strain — the database does that from what you write.

---

## THE MAP

Everything you may write. Nothing else exists for you.

### From the `workoutType` sample

| # | HealthKit source | aggregation | unit conversion | → column |
|---|---|---|---|---|
| 1 | `workoutType` activity name | as-is | e.g. `"Running"`, `"Weight Training"` | `activity_type` |
| 2 | `workoutType` start | as-is | ISO8601 timestamptz | `started_at` |
| 3 | `workoutType` end | as-is | ISO8601 timestamptz | `ended_at` |
| 4 | row 2, repeated | as-is | ISO8601 timestamptz | `date_iso` |
| 5 | `workoutType` duration | as-is | **seconds ÷ 60 = min**, rounded | `duration_min` |
| 6 | `workoutType` totalDistance | as-is | **meters — do NOT convert to miles** | `distance_m` |
| 7 | `workoutType` totalEnergyBurned | as-is | kcal | `active_energy_kcal` |
| 8 | `HKQuantityTypeIdentifierBasalEnergyBurned` | sum within rows 2–3 | kcal | `resting_energy_kcal` |

### Heart rate — samples BETWEEN `started_at` AND `ended_at` only

| # | HealthKit source | aggregation | unit conversion | → column |
|---|---|---|---|---|
| 9 | `HKQuantityTypeIdentifierHeartRate` | mean | none (bpm) | `hr_avg_bpm` |
| 10 | `HKQuantityTypeIdentifierHeartRate` | min | none | `hr_min_bpm` |
| 11 | `HKQuantityTypeIdentifierHeartRate` | max | none | `hr_max_bpm` |
| 12 | `HKQuantityTypeIdentifierHeartRate` | every sample | `[{"t":"<ISO8601>","bpm":<num>}]` — **`bpm`, not `value`** | `hr_samples` |

Row 12 is required, not optional. It drives the heart-rate chart in the
app and is the sole input to Strain for cardio. A ~30 minute workout is a
few hundred samples — one call, no pagination.

Ordering does not matter; consumers sort by timestamp.

### Not from HealthKit — look these up

| # | value | → column |
|---|---|---|
| 13 | `SELECT id FROM programs WHERE is_active = true` | `program_id` |
| 14 | that program's `name` | `program_name` |
| 15 | the program phase this falls in — **ask if unclear, do not guess** | `phase` |
| 16 | for cardio: same as row 1. For a lift: the split name, e.g. `"Pull"` | `day` |
| 17 | literal `'[]'::jsonb` for cardio — never null | `exercises` |
| 18 | literal `'healthkit'` (or the export's name) | `metrics_source` |

Rows 13–17 are `NOT NULL`. An insert without them fails.

---

## FIVE RULES

**1. Copy, never calculate.** If a number isn't in the map, you don't
produce it. `hr_avg_bpm` may differ slightly from the mean of row 12 —
Apple time-weights it. Leave both alone.

**2. Never add a column. Never run `ALTER TABLE` or `apply_migration`.**
The database rejects every write while an unlisted column exists, so doing
this breaks all logging until someone drops it.

**3. Missing means `null`** — except rows 13–17, which are required.

**4. Never write Strain or any derived value.** Strain lives on
`health_metrics` and is computed by `compute_health_scores()`. Writing
your own is impossible here and pointless there.

**5. `exercises` is `'[]'` for cardio, never null.** Empty array + a
non-null `metrics_source` is exactly how the app recognises a cardio
session and renders distance and heart rate instead of a set list.

---

## WRITING

### Check for a duplicate first

`workout_logs` has **no unique constraint**. Nothing stops you inserting
the same workout twice, and a duplicate double-counts in Strain.

```sql
SELECT id, activity_type, started_at, ended_at, metrics_source
FROM workout_logs
WHERE started_at < '<row 3>' AND ended_at > '<row 2>';
```

Any result → `UPDATE` that row instead of inserting, and tell the user you
found one.

### Then insert

```sql
INSERT INTO workout_logs (
  program_id, program_name, date_iso, phase, day, exercises,
  activity_type, started_at, ended_at, duration_min, distance_m,
  active_energy_kcal, resting_energy_kcal,
  hr_avg_bpm, hr_min_bpm, hr_max_bpm, hr_samples, metrics_source
) VALUES (...);
```

Each Supabase call needs approval. "No approval received" is not an
error — ask the user to approve, then retry once.

---

## WHAT HAPPENS NEXT (you do not do any of this)

**A lift you logged in the app merges with this row automatically.** The
app's row has sets and no metrics; yours has metrics and no sets. A
`BEFORE INSERT` trigger merges strictly complementary rows whose time
windows overlap, from whichever side arrives second. Accurate `started_at`
and `ended_at` are all it needs — that is why rows 2 and 3 matter.

**Strain recalculates.** A trigger finds the `health_metrics` row for this
workout's **local calendar date** and recomputes. If no row exists it
creates one with only `date` filled.

**Strain is training load only.** Cardio scores from row 12; lifting
scores from set volume on the merged row. A day with no logged workout
scores null — correct, not a gap to fill.

---

## AFTER WRITING

`SELECT` the row back and report, per column, one of: **written**, **null
(HealthKit had no value)**, or **merged into existing row #N**.

Then show that date's `health_metrics.strain_score`. If it is null, say
which input was missing. Never fill it in yourself.

---

## NOTES

- Timezone is `America/Los_Angeles`, matching the database functions.
- `hr_samples` uses `{"t","bpm"}`. `health_metrics` sample arrays use
  `{"t","value"}`. This difference is deliberate. Do not change either.
- This skill never writes to `health_metrics`. That is `health-metrics-sync`.
- The app, Claude Code, and manual imports also write to `workout_logs`.
  Always check for an existing row first.
