---
name: health-metrics-sync
description: Use whenever the user asks to sync, push, upload, or save a day's HealthKit vitals to Supabase/the database, or to update the health_metrics table with sleep/HRV/HR/SpO2/steps. Also use after pulling sleep vitals (see sleep-vitals-export skill) if the user wants it persisted rather than just exported to a file. Trigger on "push to supabase", "sync my health data", "save last night's data", "update the db". Does NOT log individual workouts - if the user means one run, ride or lift session, use the workout-metrics skill instead.
---

# Health Metrics Sync

Copy HealthKit values into `health_metrics` in Supabase project
`rrqljyhfjoyancgfefcb`. One row per cycle date.

**Your only job is copying raw numbers into the columns listed below.**
You do not calculate anything. You do not add columns. You do not decide
what a value means.

---

## THE MAP

Everything you may write. Nothing else exists for you.

### Whole-day values — from calendar day `D-1`, complete day only

| # | HealthKit source | aggregation | unit conversion | → column |
|---|---|---|---|---|
| 1 | `HKQuantityTypeIdentifierRestingHeartRate` | Apple's daily value | none (bpm) | `resting_hr_bpm` |
| 2 | `HKQuantityTypeIdentifierHeartRateVariabilitySDNN` | mean of the day's samples | none (ms) | `hrv_ms` |
| 3 | `HKQuantityTypeIdentifierStepCount` | sum | none (count) | `step_count` |
| 4 | `HKQuantityTypeIdentifierBodyMass` | latest weigh-in | **kg × 2.20462 = lb** | `body_weight_lb` |

### Sleep session — the night that ended this morning

| # | HealthKit source | aggregation | unit conversion | → column |
|---|---|---|---|---|
| 5 | `sleepAnalysis` | earliest sample start | ISO8601 timestamptz | `sleep_start` |
| 6 | `sleepAnalysis` | latest sample end | ISO8601 timestamptz | `sleep_end` |
| 7 | `sleepAnalysis` = `asleepDeep` | sum of durations | **seconds ÷ 60 = min** | `sleep_deep_min` |
| 8 | `sleepAnalysis` = `asleepREM` | sum of durations | seconds ÷ 60 | `sleep_rem_min` |
| 9 | `sleepAnalysis` = `asleepCore` | sum of durations | seconds ÷ 60 | `sleep_core_min` |
| 10 | `sleepAnalysis` = `awake` | sum of durations | seconds ÷ 60 | `sleep_awake_min` |
| 11 | rows 7 + 8 + 9 | sum | minutes | `sleep_total_min` |
| 12 | row 11 ÷ (`sleep_end` − `sleep_start`) | ratio | **× 100 = percent** | `sleep_efficiency_pct` |

### Overnight vitals — samples BETWEEN `sleep_start` AND `sleep_end` only

| # | HealthKit source | aggregation | unit conversion | → column |
|---|---|---|---|---|
| 13 | `HKQuantityTypeIdentifierHeartRate` | mean | none (bpm) | `overnight_hr_avg_bpm` |
| 14 | `HKQuantityTypeIdentifierHeartRate` | min | none | `overnight_hr_min_bpm` |
| 15 | `HKQuantityTypeIdentifierHeartRate` | max | none | `overnight_hr_max_bpm` |
| 16 | `HKQuantityTypeIdentifierHeartRateVariabilitySDNN` | mean | none (ms) | `overnight_hrv_ms` |
| 17 | `HKQuantityTypeIdentifierHeartRateVariabilitySDNN` | min | none | `overnight_hrv_min_ms` |
| 18 | `HKQuantityTypeIdentifierHeartRateVariabilitySDNN` | max | none | `overnight_hrv_max_ms` |
| 19 | `HKQuantityTypeIdentifierHeartRateVariabilitySDNN` | every sample | `[{"t":"<ISO8601>","value":<num>}]` | `overnight_hrv_samples` |
| 20 | `HKQuantityTypeIdentifierOxygenSaturation` | mean | **fraction × 100 = percent** | `overnight_spo2_avg_pct` |
| 21 | `HKQuantityTypeIdentifierOxygenSaturation` | min | fraction × 100 | `overnight_spo2_min_pct` |
| 22 | `HKQuantityTypeIdentifierOxygenSaturation` | max | fraction × 100 | `overnight_spo2_max_pct` |
| 23 | `HKQuantityTypeIdentifierOxygenSaturation` | every sample | `[{"t":"<ISO8601>","value":<num>}]` | `overnight_spo2_samples` |
| 24 | `HKQuantityTypeIdentifierRespiratoryRate` | mean | none (breaths/min) | `respiratory_rate_avg` |
| 25 | `HKQuantityTypeIdentifierRespiratoryRate` | min | none | `respiratory_rate_min` |
| 26 | `HKQuantityTypeIdentifierRespiratoryRate` | max | none | `respiratory_rate_max` |
| 27 | `HKQuantityTypeIdentifierAppleSleepingWristTemperature` | the night's value | **Celsius, do NOT convert** | `wrist_temp_c` |

### Hourly heart rate — the wake-to-wake window

| # | HealthKit source | aggregation | format | → column |
|---|---|---|---|---|
| 28 | `HKQuantityTypeIdentifierHeartRate` | `aggregationInterval:"hour"`, `queryMode:"statistics"`, `statisticsType:"all"` | array, one object per hour (below) | `daily_hr_hourly` |

Each element, hours labelled on the local clock:
```json
{"hour_start_local":"14:00","avg":72.5,"min":61,"max":98}
```
An hour with no samples:
```json
{"hour_start_local":"03:00","no_data":true}
```
An hour overlapping a `workoutType` event — add both keys:
```json
{"hour_start_local":"10:00","avg":108.34,"min":81,"max":137,
 "likely_workout":true,"workout_overlap_local":"10:00:00-10:51:24"}
```
Only flag hours overlapping a real `workoutType` sample. Elevated HR from
errands or kids is not a workout.

### Bookkeeping

| # | value | → column |
|---|---|---|
| 29 | the cycle's local calendar date | `date` |
| 30 | `{"source":"<where this came from>"}` | `raw_payload` |

---

## THE WINDOW

A row dated `D` covers **wake(D-1) → wake(D)**. Get both wake times from
`sleepAnalysis` before pulling anything else.

- Rows 1–4 come from **complete calendar day D-1**. Apple computes these
  per calendar day and they cannot be re-scoped.
- Rows 5–27 come from **the sleep session that ended this morning**.
- Row 28 covers **wake(D-1) → wake(D)**.
- **Never include anything after this morning's wake time.**
- 25 hourly buckets is normal when wake times differ (06:57 → 07:07). Not
  a duplicate. Do not remove one.

---

## FIVE RULES

**1. Copy, never calculate.** If a number isn't in the map, you don't
produce it.

**2. Never add a column. Never run `ALTER TABLE` or `apply_migration`.**
The database rejects every write while an unlisted column exists, so doing
this breaks all syncing until someone drops it.

**3. Missing means `null`.** Never substitute a different measurement.
Not `overnight_hr_avg_bpm` into `resting_hr_bpm`. Not `overnight_hrv_ms`
into `hrv_ms`. A null is correct; a substitution is corruption that looks
correct.

**4. Never write `recovery_pct`, `sleep_score`, `strain_score`, or
`strain_basis`.** The `compute_health_scores()` trigger writes them on
every insert and update. Yours are overwritten.

**5. Never write a value the database derives.** HR dip in particular is
**not a column** and must never become one. The trigger computes it from
yesterday's `daily_hr_hourly` and today's `overnight_hr_min_bpm`. If dip
is missing, yesterday's row 28 is missing — that is the only cause.

---

## WRITING

`date` is `UNIQUE`. A row may already exist — the `workout_logs` trigger
creates one (with only `date` filled) when a workout is pushed first.

```sql
INSERT INTO health_metrics (date, <cols>) VALUES (...)
ON CONFLICT (date) DO UPDATE SET
  <col> = COALESCE(EXCLUDED.<col>, health_metrics.<col>);
```

- `SELECT` the row first and see what's already populated.
- Never null out a populated column.
- jsonb arrays (rows 19, 23, 28): replace wholesale, never append.
- If existing data disagrees with what you pulled, tell the user. Don't
  silently overwrite.
- Each Supabase call needs approval. "No approval received" is not an
  error — ask the user to approve, then retry once.

## AFTER WRITING

`SELECT` the row back and report, per column, one of: **written**,
**null (HealthKit had no value)**, or **already present, left alone**.

Then show `recovery_pct`, `sleep_score`, `strain_score`, `strain_basis`.
If any is null, name the missing **input** row number from the map. Never
fill one in yourself.

## NOTES

- Timezone is `America/Los_Angeles`, matching the database functions.
- `workout_logs.hr_samples` uses `{"t","bpm"}` not `{"t","value"}`. That is
  deliberate. Do not change it.
- This skill never writes to `workout_logs`. That is `workout-metrics`.
