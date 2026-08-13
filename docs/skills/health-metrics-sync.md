---
name: health-metrics-sync
description: Use whenever the user asks to sync, push, upload, or save a day's HealthKit vitals to Supabase/the database, or to update the health_metrics table with sleep/HRV/HR/SpO2/steps. Also use after pulling sleep vitals (see sleep-vitals-export skill) if the user wants it persisted rather than just exported to a file. Trigger on "push to supabase", "sync my health data", "save last night's data", "update the db". Does NOT log individual workouts - if the user means one run, ride or lift session, use the workout-metrics skill instead.
---

# Health Metrics Sync

Writes HealthKit data into the `health_metrics` table in the `workouts`
Supabase project (project_id `rrqljyhfjoyancgfefcb`), which also holds the
Iron Log tables (`programs`, `workout_logs`, `exercises`, etc). One row per
calendar `date`, upserted (never insert a duplicate row for a date that
already exists - check first, then INSERT or UPDATE accordingly).

## STOP. Four rules, no exceptions.

**1. You may ONLY write the columns in the allowlist below.**
Not "mostly". Not "plus one more that seemed useful". If a value you have
does not map to an allowlisted column, **you do not write it** - report it
to the user and stop.

**2. NEVER create a column. NEVER run `ALTER TABLE`, `apply_migration`, or
any other DDL.** This skill is read/write on rows only. If you believe a
column is missing, say so and stop. Do not add it.

*(This has already gone wrong: a session computed HR dip, found nowhere to
put it, created `hr_dip_pct` and `hr_dip_trough_pct`, and wrote them. Those
columns were read by nothing, and the same session skipped the actual input
the database needed. They have been dropped.)*

**3. NEVER compute a derived value.** No scores, no percentages, no
deltas, no dip, no averages-of-averages. Your entire job is landing raw
measurements. The database derives everything else. If a derived number is
missing, an **input** is missing - find which one and report it.

**4. NEVER substitute one measurement for another.** If HealthKit has no
value for a column, write `null` and say so. Do not fill
`resting_hr_bpm` from `overnight_hr_avg_bpm`, do not fill `hrv_ms` from
`overnight_hrv_ms`, do not estimate. A null is correct data. A substituted
value is corrupt data that looks correct.

## The allowlist - the ONLY columns you may write

| column | source |
|---|---|
| `date` | the local calendar date of the cycle |
| `hrv_ms` | `HKQuantityTypeIdentifierHeartRateVariabilitySDNN`, day average |
| `resting_hr_bpm` | `HKQuantityTypeIdentifierRestingHeartRate` |
| `step_count` | `HKQuantityTypeIdentifierStepCount` |
| `body_weight_lb` | `HKQuantityTypeIdentifierBodyMass` |
| `sleep_start`, `sleep_end` | `sleepAnalysis` session bounds |
| `sleep_deep_min`, `sleep_rem_min`, `sleep_core_min`, `sleep_awake_min`, `sleep_total_min` | summed per `sleepAnalysis` category |
| `sleep_efficiency_pct` | asleep ÷ time-in-bed |
| `overnight_hr_avg_bpm`, `overnight_hr_min_bpm`, `overnight_hr_max_bpm` | HR within the sleep window |
| `overnight_hrv_ms`, `overnight_hrv_min_ms`, `overnight_hrv_max_ms`, `overnight_hrv_samples` | HRV within the sleep window |
| `overnight_spo2_avg_pct`, `overnight_spo2_min_pct`, `overnight_spo2_max_pct`, `overnight_spo2_samples` | SpO2 within the sleep window |
| `respiratory_rate_avg`, `respiratory_rate_min`, `respiratory_rate_max` | respiratory rate within the sleep window |
| `wrist_temp_c` | `HKQuantityTypeIdentifierAppleSleepingWristTemperature` |
| `daily_hr_hourly` | hourly HR aggregates - see below |
| `raw_payload` | `{"source": "<where this came from>"}` |

**Anything not in that table is off limits**, including every column below.

## NEVER write these - the database computes them

`recovery_pct`, `sleep_score`, `strain_score`, `strain_basis`

The `compute_health_scores` trigger recalculates all four on every INSERT
and UPDATE. Anything you write is overwritten, so writing them is at best
pointless and at worst misleads whoever reads the row next.

**HR dip is NOT a column and must never become one.** It is a local
variable inside the trigger:

```
dip = (prior row's resting_hr_bpm − this row's overnight_hr_min_bpm)
      ÷ prior row's resting_hr_bpm
```

You cannot help dip by calculating it. You help it by writing
`resting_hr_bpm` on every row, because dip reads it from the **previous**
day. If dip is missing today, yesterday's `resting_hr_bpm` is null - that
is the whole story.

## Column reference (types, for reading rows)

Daily/basic columns:
- `date` (date, NOT NULL, unique key for upsert logic)
- `hrv_ms` (numeric) - Apple's calendar-day HRV average. Stored for
  reference; **nothing scores from it** (see "Which columns feed which
  score" below).
- `resting_hr_bpm` (numeric) - Apple's calendar-day resting HR.
  **Required** - HR dip depends on it. See below.
- `step_count` (integer)
- `body_weight_lb` (numeric) - from `HKQuantityTypeIdentifierBodyMass`.
  Sync it whenever a new weigh-in exists. It scores every bodyweight exercise
  (pull-ups, dips, hanging leg raises, TRX) in Strain's volume load - without
  it those sets count as zero load. Values carry forward, so an occasional
  weigh-in is enough; it does not need to be daily.
- `sleep_start`, `sleep_end` (timestamptz) - **`sleep_end` is load-bearing
  beyond this table; see "sleep_end is a contract" below**
- `sleep_deep_min`, `sleep_rem_min`, `sleep_core_min`, `sleep_awake_min`,
  `sleep_total_min` (integer)
- `sleep_efficiency_pct` (numeric)
- `raw_payload` (jsonb) - free-form, has held `{"source": "<filename>"}`
  previously
- `daily_hr_hourly` (jsonb) - see "Daily (non-sleep) heart rate" below

Overnight-detail columns (populated only for nights with a full sleep-vitals
pull, not every day):
- `overnight_hr_avg_bpm`, `overnight_hr_min_bpm`, `overnight_hr_max_bpm`
- `respiratory_rate_avg`, `respiratory_rate_min`, `respiratory_rate_max`
- `wrist_temp_c`
- `overnight_hrv_ms` (avg), `overnight_hrv_min_ms`, `overnight_hrv_max_ms`,
  `overnight_hrv_samples` (jsonb array of `{t, value}`)
- `overnight_spo2_avg_pct`, `overnight_spo2_min_pct`, `overnight_spo2_max_pct`,
  `overnight_spo2_samples` (jsonb array of `{t, value}`)

Trigger-computed, never written by this skill:
- `recovery_pct`, `sleep_score`, `strain_score`, `strain_basis` (text)

If a score comes back null, the cause is a missing **input**, not a missing
score - work backwards to which input is absent and report it.
(`recovery_pct` was historically computed by hand; that is no longer true
and must not be reintroduced.)

## ⚠️ The reporting window: wake-to-wake, never past this morning

A row dated `D` covers **wake time on D-1 through wake time on D** - the
previous day's waking activity plus the night's sleep that ended on D. It
is a recovery cycle, not a calendar day.

**Hard rule: never log anything after this morning's wake time.** Today's
in-progress activity does not belong in any row. If the user asks to sync
"today", that means the cycle that ended when they woke up this morning -
not the hours since.

Consequences:
- `daily_hr_hourly` for row D covers wake(D-1) → wake(D). Hours after
  wake(D) are out of scope even though they exist in HealthKit.
- A ~24h window that starts and ends at slightly different clock times can
  legitimately touch 25 hourly buckets (e.g. wake 06:57 → wake 07:07 next
  day). That is expected, not a duplicate - do not "fix" it by dropping one.
- Do not write partial-day data for the current in-progress day.
- Determine wake times from `sleepAnalysis` (end of the sleep session), not
  from a fixed clock time - they vary night to night.
- Apple-computed daily values (`restingHeartRate`, daily `stepCount`,
  daily HRV average) are calendar-day by construction and cannot be
  re-scoped to an arbitrary window. Take these from the **complete** day
  D-1, never from today's partial figures. If the user wants them
  window-scoped instead, compute from raw samples and say that's what you
  did.

## `sleep_end` is a contract, not just a data point

`sleep_end` is the canonical wake time for cycle D, and the database uses it
to decide which cycle a **workout** belongs to. A run at 8:39pm on Aug 10
falls after wake(Aug 10), so it belongs to the Aug 11 cycle - the same place
this skill's `daily_hr_hourly` puts it. That mapping is implemented in the
`health_cycle_date_for()` SQL function, which reads `sleep_end`.

Therefore:
- Always populate `sleep_end` when you have sleep data for a row. Without
  it, workout-derived Strain falls back to guessing by calendar date and
  will attribute evening workouts to the wrong cycle.
- Never overwrite a populated `sleep_end` with a null or a rougher estimate.
- If you change how wake time is derived, the SQL function must change too,
  or the two definitions silently diverge.

## Which columns feed which score

**Recovery scores from the sleep-window columns only** -
`overnight_hrv_ms` and `overnight_hr_avg_bpm`. It does **not** use
`hrv_ms` or `resting_hr_bpm`, and there is deliberately no fallback to
them.

The reason is the wake-to-wake model. Row `D` describes the morning you
woke on `D`, after the night of `D-1 → D`. Apple's calendar-day HRV for
day `D-1` is captured mostly during the night of `D-2 → D-1` - a full
cycle earlier. Feeding it into row `D` lagged Recovery by one night,
permanently. The overnight columns are measured inside row `D`'s own sleep
window, which is the night that actually ended at wake(`D`).

Using a single source also retired the old split-baseline machinery. The
trigger used to pick whichever column happened to be populated and then
segregate baselines by source to avoid comparing two different scales
(calendar HRV ran 36-86 in this dataset, sleep-window 31-120). That meant
the same physiological night could score very differently depending on
which export had run. Do not reintroduce a calendar-day fallback - it
brings the fragmentation back.

Practical consequence: **a cycle with no overnight vitals gets no Recovery
score.** That is intended. A score built from the wrong night is worse
than no score.

### Still always write `resting_hr_bpm`

Even though Recovery no longer reads it, `resting_hr_bpm` is required for
**HR dip**:

`dip = (prior day's resting_hr_bpm − this night's overnight low) / prior day's resting_hr_bpm`

Dip compares a **daytime** resting HR against the overnight low, so it
needs the calendar-day measurement by definition, and it needs it on the
*previous* row. If yesterday's `resting_hr_bpm` is null, dip cannot be
computed today. Dip feeds both Recovery and Sleep.

This column has been silently skipped on recent syncs - don't.

Pull `HKQuantityTypeIdentifierRestingHeartRate` for the complete day `D-1`
(per the calendar-day rule above). `hrv_ms` is still worth storing as
reference data, but nothing scores from it.

If HealthKit genuinely has no value, leave it **null** - do **not**
substitute `overnight_hr_avg_bpm` for `resting_hr_bpm`. They are different
measurements, and dip is meaningless if both sides come from the same
overnight window.

## Duplicate and overwrite safety

`health_metrics` has `UNIQUE (date)`, so duplicate rows are impossible -
but re-running this skill can silently destroy good data. Before writing:

1. `SELECT` the existing row for that date and inspect which columns are
   already populated.
2. Only write columns that are currently null, or that you have genuinely
   newer/better data for. Never null out a populated column.
3. Never blind-`INSERT`. Use
   `INSERT ... ON CONFLICT (date) DO UPDATE SET <col> = COALESCE(EXCLUDED.<col>, health_metrics.<col>)`
   or an explicit `UPDATE` after the existence check.
4. For jsonb arrays (`overnight_hrv_samples`, `overnight_spo2_samples`,
   `daily_hr_hourly`): replace wholesale, never append - appending on a
   re-run duplicates every sample.
5. If a populated column disagrees with freshly pulled data, surface the
   discrepancy to the user instead of silently overwriting. Claude Code
   also writes to this table and may have used a different method.

**A row may already exist even if this skill never ran.** `workout_logs`
has a trigger that auto-creates a `health_metrics` row for a workout's
cycle date when none exists, so Strain can be computed right after a
workout is pushed. Such a row has only `date` populated. Treat it as an
empty row to fill in, not as evidence the day was already synced.

## Workflow

1. Establish the window first: find wake(D) and wake(D-1) from
   `sleepAnalysis` before pulling anything else. Everything downstream is
   scoped to that window.
2. Pull the data (use the `sleep-vitals-export` skill's approach for
   sleep-window vitals, or `health_query_v0` directly for daily
   steps/HRV/resting HR). If sleep is in scope, this MUST include computing
   `sleep_deep_min`/`sleep_rem_min`/`sleep_core_min`/`sleep_awake_min`/
   `sleep_total_min`/`sleep_efficiency_pct` from the raw `sleepAnalysis`
   samples (sum duration per category, efficiency = asleep/time-in-bed) -
   don't stop at just `sleep_start`/`sleep_end`. This step has been missed
   before; treat "sync sleep data" as incomplete until these columns are
   populated too.
   Likewise, do not treat the sync as complete until `resting_hr_bpm` is
   populated (or confirmed genuinely unavailable) - it has been silently
   skipped before, and HR dip depends on it being present on the *previous*
   row. If the overnight vitals are in scope, `overnight_hrv_ms` and
   `overnight_hr_avg_bpm` are likewise mandatory: without them the cycle
   gets no Recovery score at all.
3. Check the existing row per the "Duplicate and overwrite safety" section
   above - inspect which columns are already populated before writing.
4. `UPDATE` only the columns you have new data for, or `INSERT ... ON
   CONFLICT (date) DO UPDATE` if no row exists yet.
5. Every Supabase call requires the
   user's explicit approval via a permission prompt each time - this is
   normal, not an error. If a call returns "No approval received", tell the
   user to approve the pending prompt and retry the same call once they do
   - don't loop retrying without telling them.
6. **Verify before claiming success.** Run this and paste the result:

   ```sql
   -- must return zero rows; anything here is a column that should not exist
   SELECT column_name FROM information_schema.columns
   WHERE table_schema='public' AND table_name='health_metrics'
     AND column_name NOT IN (
       'id','date','hrv_ms','resting_hr_bpm','step_count','body_weight_lb',
       'sleep_start','sleep_end','sleep_deep_min','sleep_rem_min',
       'sleep_core_min','sleep_awake_min','sleep_total_min',
       'sleep_efficiency_pct','overnight_hr_avg_bpm','overnight_hr_min_bpm',
       'overnight_hr_max_bpm','overnight_hrv_ms','overnight_hrv_min_ms',
       'overnight_hrv_max_ms','overnight_hrv_samples','overnight_spo2_avg_pct',
       'overnight_spo2_min_pct','overnight_spo2_max_pct','overnight_spo2_samples',
       'respiratory_rate_avg','respiratory_rate_min','respiratory_rate_max',
       'wrist_temp_c','daily_hr_hourly','raw_payload','created_at',
       'recovery_pct','sleep_score','strain_score','strain_basis');
   ```

   If it returns anything, you created a column you should not have. Say so
   plainly and stop - do not carry on as though the sync succeeded.

7. Then `SELECT` the row back and show the user what was written,
   including the trigger-computed `recovery_pct`, `sleep_score`,
   `strain_score` and `strain_basis`, so they can confirm it landed
   correctly rather than taking it on faith. If any score is null, say which
   INPUT was missing - never present a null score as a failure of the
   database, and never try to fill it in yourself.

## Daily (non-sleep) heart rate

Full-day raw HR samples are NOT practical to pull or store - a single day
can run 2,000-4,000+ samples at native resolution, and `health_query_v0`
caps around 320-645 samples per call, meaning a full day takes 5+
paginated calls. Don't attempt this unless the user explicitly asks for a
specific narrow window (e.g. one workout).

Instead: pull native hourly aggregates (`aggregationInterval: "hour"`,
`queryMode: "statistics"`, `statisticsType: "all"`) - clean buckets
(avg/min/max/count) in one call, no pagination needed. Store as a
`daily_hr_hourly` jsonb array (add the column via migration if missing),
one object per hour:
`{"hour_start_local": "HH:MM", "avg": n, "min": n, "max": n}`.

Scope these to the wake-to-wake window (see above), NOT calendar midnight
to midnight. Hours after this morning's wake are out of scope - drop them
rather than storing a partial current day.

Mark hours with no coverage as `{"hour_start_local": "HH:MM",
"no_data": true}` - the scoring trigger skips those explicitly, and
omitting them entirely makes a gap indistinguishable from a quiet hour.

There is no native 20-minute bucketing option - only hour/day/week/month.
20-min or finer bucketing is only worth doing for a specific flagged
window (e.g. a workout), not a whole day.

**This column no longer feeds Strain.** Strain is training load only,
computed exclusively from workout HR samples written by the
`workout-metrics` skill. Ambient activity - walking, errands, stress -
deliberately does not count, and a cycle with no logged workout scores
null.

Keep syncing `daily_hr_hourly` anyway: it is the only record of ambient
cardiovascular load, it is what makes the `likely_workout` annotation
below meaningful, and the resting-HR fallbacks can draw on it. It simply
isn't a scoring input.

## Workouts

Pull the `workoutType` sample type (separate data class from vitals) for
the day - returns discrete workout events with `activity_type`,
`start`/`end`, `duration`, `total_energy_burned`. Use the exact
start/end times to identify which hourly HR buckets overlap a workout.

Flag overlapping hours in `daily_hr_hourly` rather than excluding them
outright (the raw data is still useful) - add both a boolean and the exact
overlap window so downstream resting/baseline calculations can trim
precisely instead of discarding the whole hour:
```json
{"hour_start_local":"10:00","avg":108.34,"min":81,"max":137,
 "likely_workout":true,"workout_overlap_local":"10:00:00-10:51:24"}
```
Elevated HR outside a logged workout (e.g. from active time with kids,
errands) should NOT be flagged - only flag hours that overlap an actual
`workoutType` event. Ask before assuming an elevated hour is a workout if
there's no corresponding workout sample.

Note this skill does **not** write workout rows - `workout_logs` is the
`workout-metrics` skill's job. Here, workout events are only used to
annotate HR buckets.

## Notes

- This table is also written to independently via Claude Code and by the
  `workout_logs` trigger - don't assume this skill is the only writer.
  Always check for an existing row before assuming you need to INSERT.
- jsonb sample arrays should use the format `{"t": "<ISO8601>", "value": <num>}`
  to stay consistent with what's already stored (see `overnight_hrv_samples`,
  `overnight_spo2_samples` for the established pattern).
  **Exception:** `workout_logs.hr_samples` uses `{"t", "bpm"}`. That is
  deliberate and consumers accept both - do not migrate it.
- Timezone is `America/Los_Angeles`, hardcoded to match the database
  functions. If the user travels, both need updating together.
