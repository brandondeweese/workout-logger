---
name: workout-metrics
description: Log a single workout's HealthKit metrics (activity type, duration, distance, energy, heart rate + samples) into the workout-logger Supabase workout_logs table. Use when the user asks to push, sync, or save a workout to the database, or right after finishing a workout they want recorded.
---

# Workout Metrics

Writes **one workout** into the `workout_logs` table in the `workouts`
Supabase project (project_id `rrqljyhfjoyancgfefcb`), which also holds the
Iron Log tables (`programs`, `exercises`, `health_metrics`, etc).

This table holds both hand-logged strength sessions (entered in the Iron Log
app, carrying an `exercises` set list) and HealthKit-imported cardio (no set
list, but metrics columns populated). This skill writes the latter.

## Required columns

`workout_logs` has NOT NULL constraints that apply even to a pure cardio
import. Every insert must supply:

- `program_id` (bigint) - the currently active program. Get it with
  `SELECT id, name FROM programs WHERE is_active = true`.
- `program_name` (text) - that program's name, denormalised.
- `date_iso` (timestamptz) - the workout's start instant. Same value as
  `started_at` for HealthKit imports.
- `phase` (text) - the program phase this falls in.
- `day` (text) - the workout label, e.g. `"Running"`. For cardio, use the
  activity type.
- `exercises` (jsonb) - **`'[]'::jsonb`** for cardio. Never null; the app
  iterates it directly and a null would break History.

An empty `exercises` array plus a non-null `metrics_source` is exactly how
the app detects "this is a cardio session, render distance/HR instead of a
set list". Both halves matter.

## Metrics columns on workout_logs

`activity_type`, `started_at`, `ended_at`, `duration_min`, `distance_m`,
`active_energy_kcal`, `resting_energy_kcal`, `hr_avg_bpm`, `hr_min_bpm`,
`hr_max_bpm`, `hr_samples` (jsonb, populated by default - see below),
`metrics_source`

Set `metrics_source` to `'healthkit'` for HealthKit pulls, or a descriptive
string for other origins (e.g. a Bevel export).

If a needed column is missing, add it with `Supabase:apply_migration` using
`ADD COLUMN IF NOT EXISTS` rather than recreating the table.

## `hr_samples` format

An array of per-sample readings covering the workout:

```json
[{"t": "2026-08-11T04:09:54Z", "bpm": 149}]
```

Notes:

- **This uses `bpm`, not `value`.** The `health_metrics` overnight sample
  arrays use `{"t", "value"}`; this column deliberately differs. Consumers
  accept both, so **do not migrate it** for the sake of consistency.
- HealthKit returns these newest-first. That's fine - consumers sort by
  timestamp before plotting. Don't spend effort reordering.
- Populate this by default. It drives the in-workout heart rate chart in
  the app's History tab, and it's the fallback input for Strain (below).
  A ~30 minute workout is a few hundred samples - well within one call, and
  nothing like the 2,000-4,000 samples a full day would be.
- `hr_avg_bpm` may legitimately differ slightly from the plain mean of the
  samples (Apple's average is time-weighted over irregular intervals).
  Don't "correct" one to match the other.

## This write triggers Strain recalculation

`workout_logs` has an `AFTER INSERT/UPDATE/DELETE` trigger
(`trg_sync_strain_for_workout`). When a row carries `hr_samples`, it finds
the `health_metrics` row for that workout's **recovery cycle** and forces a
recompute, so Strain reflects the workout immediately.

Two consequences worth understanding:

### Cycles, not calendar days

`health_metrics` rows are **wake-to-wake** cycles: row `D` spans wake(`D-1`)
→ wake(`D`). So an 8:39pm run on Aug 10 belongs to the row dated **Aug 11**,
not Aug 10.

The mapping is done by the `health_cycle_date_for()` SQL function, which
reads `health_metrics.sleep_end`. You don't need to compute it - just make
sure `started_at` is accurate, since that's the input.

If the relevant night's `sleep_end` hasn't been synced yet, the function
falls back to a calendar-date guess. That resolves itself once the
`health-metrics-sync` skill fills in `sleep_end`.

### It may create a `health_metrics` row

If no `health_metrics` row exists for that cycle, the trigger **inserts
one** with only `date` populated, so Strain has somewhere to live when you
push a workout before that day's vitals have synced.

`health_metrics.date` is `UNIQUE`. Therefore **any later insert into
`health_metrics` must upsert**:

```sql
INSERT INTO health_metrics (date, ...) VALUES (...)
ON CONFLICT (date) DO UPDATE SET ...;
```

A plain `INSERT` will fail on any cycle where a workout landed first. This
applies to the `health-metrics-sync` skill and to any manual write.

Strain computed this way is a **lower bound** - it sees the workout and none
of the cycle's other activity. The trigger records that in
`health_metrics.strain_basis = 'workouts'`, and the app labels the ring
`Strain*`. It upgrades automatically to a full-cycle score once
`daily_hr_hourly` is synced for that date.

Never write `strain_score` or `strain_basis` yourself - they are computed.

## Workflow

1. Pull the workout from HealthKit (`workoutType` sample type): activity
   type, start/end, duration, distance, energy burned.
2. Pull the heart rate samples for that exact start→end window and build
   `hr_samples`, along with `hr_avg_bpm` / `hr_min_bpm` / `hr_max_bpm`.
3. Look up the active program (`SELECT id, name FROM programs WHERE
   is_active = true`) and decide `phase` / `day`. Ask the user if the phase
   isn't obvious rather than guessing.
4. **Check for an existing row before inserting** - see below.
5. Insert the row, with `exercises` set to `'[]'::jsonb`.
6. The Strain trigger fires automatically; no further action needed. If the
   workout was imported from somewhere other than HealthKit, set
   `metrics_source` accordingly - e.g. a row populated by a Bevel export.
7. After writing, `SELECT` the row back and show the user what landed,
   including the resulting `health_metrics.strain_score` and `strain_basis`
   for that cycle.

## Duplicate safety

There is **no unique constraint** on `workout_logs` - nothing stops you
inserting the same workout twice, and a duplicate would double-count in
Strain and clutter History.

Before inserting, check for an overlapping row:

```sql
SELECT id, activity_type, started_at, ended_at, metrics_source
FROM workout_logs
WHERE started_at IS NOT NULL
  AND started_at < <new_ended_at>
  AND ended_at   > <new_started_at>;
```

If one exists, `UPDATE` it rather than inserting - and tell the user you
found an existing row instead of silently overwriting.

## Notes

- Every Supabase call requires the user's approval via a permission prompt.
  "No approval received" is not an error - tell the user to approve the
  pending prompt, then retry once.
- Multiple workouts in one day are possible; each gets its own row.
- This table is also written to by the Iron Log app itself (hand-logged
  strength sessions), by Claude Code, and by manual Bevel imports. Always
  check for an existing row before inserting.
- Hand-logged strength rows have a populated `exercises` array and null
  metrics columns. Don't backfill metrics onto them unless the user asks -
  the app decides how to render a row from exactly that distinction.
- Timezone for any local-date reasoning is `America/Los_Angeles`, hardcoded
  to match the database functions.
