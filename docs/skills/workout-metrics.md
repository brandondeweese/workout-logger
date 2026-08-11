---
name: workout-metrics
description: Log ONE workout session (a run, ride, lift, or other activity) from HealthKit into the Supabase workout_logs table, with its duration, distance, energy and heart rate samples. Trigger on "push my workout", "log this run", "save my workout", "sync my run", "I just finished a workout". Use this for an individual activity - for a day's sleep, HRV, resting HR, SpO2 or step totals, use the health-metrics-sync skill instead.
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
  the app's History tab, and it is the sole input to Strain (below).
  A ~30 minute workout is a few hundred samples - well within one call, and
  nothing like the 2,000-4,000 samples a full day would be.
- `hr_avg_bpm` may legitimately differ slightly from the plain mean of the
  samples (Apple's average is time-weighted over irregular intervals).
  Don't "correct" one to match the other.

## This write triggers Strain recalculation

`workout_logs` has an `AFTER INSERT/UPDATE/DELETE` trigger
(`trg_sync_strain_for_workout`). When a row carries `hr_samples`, it finds
the `health_metrics` row for that workout's **local calendar date** and
forces a recompute, so Strain reflects the workout immediately.

Two consequences worth understanding:

### Strain lands on the day you trained

Strain is attributed to the workout's **local calendar date** - a run at
8:39pm Monday is Monday's strain.

Note this differs from Recovery and Sleep on the same row, which describe the
wake-to-wake cycle that ended that morning. That is intentional: training
load belongs to the day you trained, while recovery describes the night that
just ended. Both live on the row for that date.

All this needs from you is an accurate `started_at`.

### It may create a `health_metrics` row

If no `health_metrics` row exists for that date, the trigger **inserts
one** with only `date` populated, so Strain has somewhere to live when you
push a workout before that day's vitals have synced.

`health_metrics.date` is `UNIQUE`. Therefore **any later insert into
`health_metrics` must upsert**:

```sql
INSERT INTO health_metrics (date, ...) VALUES (...)
ON CONFLICT (date) DO UPDATE SET ...;
```

A plain `INSERT` will fail on any date where a workout landed first. This
applies to the `health-metrics-sync` skill and to any manual write.

**Strain is defined as training load, and this skill is its only source.**
A day with no workout carrying HR samples scores null - that is correct,
not a gap to fill. Walking, errands and ambient activity deliberately do
not count; `daily_hr_hourly` is no longer read for Strain at all.

The practical consequence: **if a workout isn't pushed with heart rate, it
doesn't exist as far as Strain is concerned.** That applies to strength
sessions too, not just runs - a lift logged by hand in the app, with no
HealthKit HR, produces no Strain. Push every trained session through this
skill if the score is meant to be complete.

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
   including the resulting `health_metrics.strain_score` for that date.

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
