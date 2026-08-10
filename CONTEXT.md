# Context: Workout Logger Project

This document exists so a fresh Claude Code session (with no memory of the chat
that built this) can pick up the project without re-deriving decisions already made.

## Background / the person

- 20 years of lifting experience. 4 lifting days/week, legs once/week, separate
  3-mile run day.
- Uses the Bevel app (AI health coach, reads Apple Watch Strain/Recovery via
  HealthKit) for tracking — but Bevel has **no public API**, so data can't be
  pushed to or pulled from it programmatically. Its AI coaching layer is
  considered weak/not useful by the user; the sensor data underneath is fine.
- Apple Watch (no capable browser — watchOS Safari can't run this app; don't
  suggest watch-based logging as a near-term option).
- Wants Claude (in claude.ai chat, separately from this app) to be able to
  review logged data and give coaching-style analysis — stalled lifts,
  volume/intensity trends, recovery-rule adherence, etc. This is the main
  reason a real backend (Supabase) matters more than just "does the app work."

## The training program

Full program lives in `progressive-overload-program.md`. Summary:

- 12-week progressive overload, Push/Pull/Legs/Mixed-upper split.
- Legs trained once/week only (squat + hinge + accessories all in one day).
- Phase 1 — Accumulation (wks 1-4): 65-75% 1RM, 8-12 reps, RIR 2-3, 60-90s rest,
  25-30 sets/day.
- Phase 2 — Intensification (wks 5-8): 75-85%, 4-8 reps, RIR 1-2, 2-3min rest,
  top set + backoff.
- Phase 3 — Realization (wks 9-11): 85-93%, 1-5 reps, RIR 0-1, 3+min rest, low
  volume.
- Week 12 — Deload/Test.
- Progression rule: +2.5-5 lbs upper / +5-10 lbs lower when hitting top of rep
  range at target RIR; hold if reps missed 2 sessions running.

**Important divergence**: the user is also on a second, informally-tracked plan
(exported from what looks like Bevel or a similar app — files named
"Strength Peak") that has different structure: 4-day split with Push broken
into separate Chest/Shoulders days, 6-10 rep range, 3-day push / 5-day leg
minimum rest rules. The two plans coexist — treat the PROGRAM object in the
HTML app as the source of truth for what the app displays, but be aware the
person may reference either plan's terminology.

## Prior analysis findings (useful if picking analysis back up)

From reviewing uploaded Phase 1/Phase 2 logs earlier in this project:

- **Military Press was stalled** at 135 lb from 6/29 through at least 7/16,
  hitting failure reps on the later date. Root cause identified by the user
  themselves: **balance/stability limitation in the standing position**, not a
  strength ceiling (confirmed because Close Grip Bench — same day, same
  fatigue — had room to progress the user just didn't take). Plan: test
  dropping to 130 lb; if reps come out clean, it's a stability fix (seated
  press / half-kneeling DB press as future options); if still shaky, the
  problem runs deeper.
- **Close Grip Bench** was flat across two sessions but the user confirmed this
  was a conservative choice, not a real ceiling — cleared to progress to 190.
- Everything else (Bench, Incline Bench, pulling lifts, Single Leg Deadlift)
  was progressing normally through both phases.
- Recovery-rule minimums (3-day push, 5-day leg) were being respected.

## The app: what's built and why

`index.html` — single-file HTML/CSS/JS, no build step, no external
dependencies except what's loaded at runtime.

### Data model
- `PROGRAM` object: `{ "Phase Name": { "Day Name": [ [exerciseName, numSets,
  targetRepText], ... ] } }`. This is the *prescribed* program.
- `SET_PRESETS` object: keyed by `"Phase::Day"` → exercise name → array of
  `{weight, reps, tag}` per set index. When present, these pre-fill the log
  form's weight/reps inputs and set the warmup/working tag automatically.
  Currently only populated for `"Phase 3 — Realization::Day 3: Legs (Peaking
  8/7)"`, built from an uploaded Bevel-style workout export
  (`Phase_3_Legs_Workout.md` — not included in this bundle, but the data is
  baked into `SET_PRESETS`). Follow this pattern for any future
  specifically-prescribed day.
- Actual logged workouts are stored as an array of entries: `{id, dateISO,
  phase, day, durationMin, exercises: [{name, sets: [{set, weight, reps,
  tag}]}]}`.

### Set tagging (mirrors Bevel's own data format)
Each set can be tagged `warmup`, `dropset`, `failure`, or untagged (=
"working"). This was added specifically because Bevel's exports use these same
distinctions, and because progression suggestions need to ignore warmup sets
(see `findLastSet()` — it explicitly skips warmup sets when finding the last
logged set to base a progression suggestion on).

UI: each set row's leftmost control is a single tappable circle that shows 🔥
for warmup or the set number otherwise (tapping opens a small menu: Set /
Warmup / Drop / Failure). This was iterated on a lot — earlier versions used a
separate ellipsis icon plus number, that was rejected as confusing; the
fire-icon approach mirrors a reference screenshot from Bevel's own UI that the
user shared.

### Set add/remove (mid-workout editing)
Sets can be added (`+ Add Set` button per exercise) or removed (`−` button per
row) both before and during a workout — this was an explicit requirement, not
gated behind the "workout active" lock (see below). After add/remove, rows
renumber contiguously via `renumberExercise()`. Tally counts, the "complete"
green-tint state, and the save logic all count actual DOM rows rather than the
original prescribed set count, since the count can now change at runtime.

### Workout-active gating
Checking off a set (and the auto-start of the rest timer) is **locked** until
the user taps "Start Workout." This was an explicit fix — earlier versions let
you check off pre-filled sets before ever starting, which corrupted the
completion tally. `isWorkoutActive()` = `workoutStartMs` set AND `workoutEndMs`
not set. The UI dims (`#exercises.locked`) when inactive. Tag-changing and
add/remove-set are **not** gated — those are allowed anytime per explicit user
request.

### Rest timer
Bottom bar, phase-based defaults (75s/150s/210s for Phase 1/2/3), auto-starts
when a set's checkmark is tapped (also on weight+reps blur, as a fallback,
also gated by `isWorkoutActive()`). +15/-15 adjust, pause/resume/dismiss,
vibrate + WebAudio beep at zero.

### Draft autosave / crash recovery
**This was a real production bug that got hit**: the user started a workout,
came back later, and all progress was gone — because nothing about an
in-progress session was persisted until the final "Save Workout" tap. Fixed by
adding a debounced (~400ms) autosave of full in-progress state (every input
change, checkmark, tag change, add/remove set, and clock start/end triggers
`queueDraftSave()`). On page load, `restoreDraftIfAny()` checks for an unsaved
draft and — if the workout clock had actually been started — prompts "Resume
unsaved workout (Phase — Day) from X min ago?" via `confirm()`. Restoring
rebuilds the exact DOM state (checked sets, weights, reps, tags, running
clock). Draft clears on successful save. **Do not remove or weaken this** —
it's the fix for a real data-loss incident.

### Storage: currently localStorage, needs to become Supabase
The app currently persists via a small adapter (`storeGet`/`storeSet`/
`storeDelete` near the bottom of the script) that tries `window.storage`
(Claude-artifact-specific) first and falls back to `localStorage`. This was a
deliberate fix after Anthropic's native "Publish artifact" / "Share Link" flow
in the mobile app **failed to generate a link at all** (repeatedly, across
multiple attempts) — that's a platform bug outside of what's fixable from
chat, and it was blocking the user from getting any working persistent app.
localStorage was the pragmatic unblock: works immediately, no publishing
required, no Claude dependency.

**The actual goal, though, is Supabase** — the user wants both (a) an app that
works standalone with no Claude/publish dependency, and (b) for Claude (in a
separate claude.ai chat) to be able to query the logged data for coaching
analysis, the way earlier analysis in this project worked from manually
uploaded log files. Supabase is the only path that gets both: the app talks to
Supabase directly via its public JS client (works from any host, no backend
needed beyond Supabase itself), and Claude can access the same database via
the Supabase MCP connector.

**Planned schema** (not yet created — do this first):
```sql
create table workout_logs (
  id bigint generated always as identity primary key,
  date_iso timestamptz not null,
  phase text not null,
  day text not null,
  duration_min integer,
  exercises jsonb not null,
  created_at timestamptz default now()
);
alter table workout_logs enable row level security;
create policy "allow anon all" on workout_logs for all using (true) with check (true);
```
Note the RLS policy is wide-open (anon role, no auth) — acceptable for a
single-user personal tracker where the anon key isn't posted publicly, but
worth flagging explicitly rather than silently shipping.

**To do**: replace `storeGet`/`storeSet`/`storeDelete` (and the `workout-logs`
/ `workout-draft` key usage in `loadLogs`/`saveLogs`/`loadDraft`/`saveDraft`/
`clearDraft`) with calls to the Supabase JS client. The draft/in-progress
autosave should probably stay local-only (localStorage) even after the
Supabase migration — no need to round-trip every keystroke to a remote DB —
while only *completed, saved* workouts go to Supabase. Use your judgment here;
this wasn't nailed down explicitly with the user.

## UI/visual design decisions (a lot of iteration went into this — preserve it)

- Dark theme: `--bg:#121212 --text:#E9E7E2 --muted:#8B8880 --accent:#7DA39C
  --accent-dim:#4F6B66`. Flat surfaces, minimal chrome.
- **No hairline dividers** between exercises or under the phase/day dropdowns —
  explicitly removed after user feedback ("lose the lines"). Don't reintroduce
  border-bottom rules on `.exercise` or `select`.
- **No alternating row shading, no numbered circle badges** on exercise
  names — both were tried and explicitly rejected ("looks messy" / "still
  indenting"). Exercise name font is `font-weight:300; font-size:20px` — light
  weight, not bold.
- Phase and Day dropdowns: same typography as exercise names (300 weight),
  small labels ("PHASE" / "DAY") above each in muted uppercase, Phase text
  colored with `--accent` to mark it as primary. No visible underline/border on
  the `<select>` elements themselves — fully suppressed
  (`outline:none;box-shadow:none;-moz-appearance:none` etc. — mobile Safari
  can be stubborn about this).
- Exercise cards have **no left/right padding** — this matters because the
  page container (`.wrap`) already provides 20px side padding; adding more on
  `.exercise` created a visible "indent" that took several rounds of feedback
  to track down. If you add new UI elements, check they don't reintroduce
  this.
- Set rows: weight/reps are large pill-shaped fields (`border-radius:999px`,
  32px font, centered), explicitly requested to be **large tap targets** even
  after being told to shrink other things — don't shrink these without
  explicit instruction. Reps field has a small muted "reps" unit label
  positioned inside the pill via `.unit` (absolute positioned span).
- "Complete" state: when every set in an exercise is checked, the whole
  exercise card gets a faint sage-green tint (`rgba(125,163,156,0.10)`) —
  purely visual, no confetti/animation, kept subtle by design request.
- Exercise vertical spacing was reduced late in the session
  (`.exercise{padding:10px 0}`) after "too much space between exercises"
  feedback — don't regress this back to the earlier 20px without reason.

## Health metrics (Apple Health / HealthKit integration)

A `health_metrics` table (one row per calendar day, keyed by `date`, RLS
matching the rest of the schema) was added to hold Apple Health data pulled
via Claude iOS (which has HealthKit access granted). This started as manual
request/response (paste JSON into a chat with Supabase access), but as of
2026-08-10 a real Skill ("sleep-vitals-export") is running independently in
a separate chat session and pushing overnight-vitals rows on its own -
`raw_payload.source` on a row tells you which path it came from. That
skill's own document shape isn't fully known here (only the resulting rows
are visible), so when its shape and this repo's ingestion scripts drift,
trust the skill/DB as ground truth and update the scripts to match, not the
other way around. Two reusable ingestion scripts also live in
`scripts/health/` for manual pulls, both idempotent upserts keyed by date so
they compose with whatever the skill already wrote:

- `ingest_daily_summary.py` - the multi-day shape: day-average HRV/resting
  HR, daily step-count sums, and raw sleep-stage interval samples across a
  date range. Groups sleep samples into per-night sessions (gap detection,
  >3h gap = new session) and dates each session by its **wake date**, not
  the evening it started.
- `ingest_sleep_session_detail.py` - the single-night richer shape: HRV
  samples/summary, respiratory rate, continuous overnight heart rate,
  Apple's single nightly wrist-temperature reading, and (optionally) raw
  sleep stage samples. Only touches the overnight-vitals columns it's given,
  so it layers on top of whatever `ingest_daily_summary.py` already set.

Both require a fresh Supabase auth access_token saved at `/tmp/sp_token.txt`
(tokens expire ~hourly - re-auth via the `/auth/v1/token?grant_type=password`
endpoint with the anon key + user credentials).

**Computed scores are server-side now, not in the ingestion scripts.** A
Postgres trigger (`compute_health_scores`, `before insert or update`,
migration `add_score_computation_trigger`) recomputes `recovery_pct` and
`sleep_score` on every write to `health_metrics`, regardless of which path
wrote the row - this matters because the ingestion scripts here aren't the
only writer anymore (see the sleep-vitals-export skill note above), and a
Python-side-only computation meant rows from other writers silently got no
score at all, which is exactly what happened the first time the skill wrote
a row. The scripts no longer compute either score themselves.

- `recovery_pct` (migrations `add_respiratory_and_dip_to_scores`,
  `fix_dip_uses_prior_day_resting_hr`, `baselines_use_rolling_30_day_window`,
  `fix_baseline_metric_type_mismatch`, `null_recovery_when_baseline_insufficient`,
  `recovery_uses_sigmoid_not_hard_clamp`, `recovery_asymmetric_sigmoid`):
  four inputs, each z-scored against a **leave-one-out baseline over a
  rolling 30-day window** (mean/stdev of every *other* row within the last
  30 days that has a value, recomputed fresh each time - still genuinely
  noisy until ~2+ weeks of data accumulate, but no longer lets old data
  permanently anchor the baseline as the table grows):
  `raw = 20*z_hrv - 15*z_rhr - 10*z_rr + 10*z_dip`, then mapped through an
  **asymmetric logistic sigmoid** rather than linear+hard-clamp:
  `100 / (1 + exp(-raw/k))` where `k=25` when `raw>=0` and `k=55` when
  `raw<0`. Both halves agree at `raw=0` (exactly 50%, no discontinuity).
  Earlier linear+clamp version made any sufficiently bad day and a
  genuinely catastrophic day both flatten to the same 0% (no way to tell
  them apart, and it felt needlessly harsh for a moderately bad night) -
  the sigmoid compresses extreme values smoothly instead. The gentler k=55
  on the bad-day side softens harsh outcomes specifically *without*
  compressing good days (which still use the steeper k=25) - a uniform
  softer curve was rejected because it would've pulled good days down
  toward the middle too, which wasn't the actual complaint.
  - HRV/RHR: prefers the day-average column, falls back to the
    overnight-vitals column. **Critical**: the baseline it's compared
    against must come from the SAME source (day-level vs. overnight-only) -
    early versions coalesced both into one baseline population, which badly
    inflated z-scores, because day-level `resting_hr_bpm` (Apple's specially
    filtered "true resting" value) and `overnight_hr_avg_bpm` (a plain
    average across the whole sleep period) are different metrics with
    different natural variance. A ~4bpm gap turned into a z-score of 3.46
    purely because the resting_hr_bpm baseline is naturally razor-tight
    (sd≈1.2) - blending in an overnight-average data point broke that. Fixed
    by tracking which source each value came from and querying the baseline
    from that same source only. Consequence: a day using the overnight-only
    source needs 2+ *other* overnight-only days in the window to get a
    score - thin at first, but honest (recovery_pct is explicitly set to
    null when this happens, not left at a stale prior value or a
    misleadingly-computed one - see the null-defaulting migration).
  - `z_rr`: respiratory rate vs. baseline - elevated is a bad sign.
  - `z_dip`: **HR dip** = `(prior day's resting_hr_bpm - overnight_hr_min_bpm)
    / prior day's resting_hr_bpm * 100` - how much lower your heart rate runs
    overnight vs. your daytime resting rate, a real recovery signal in sleep
    science. Deliberately uses the **prior calendar day's** `resting_hr_bpm`,
    not this row's own: sleep sessions are dated by wake date (this row is
    "last night's sleep, experienced this morning"), so the correct daytime
    reference is the day you were actually awake before that sleep, not this
    date's own value (which may not exist yet if today isn't over). Needs
    BOTH the prior day's `resting_hr_bpm` AND an overnight reading on this
    row: a row with only overnight-vitals data (like the skill's typical
    push) can't compute this, and the term drops out (z_dip stays 0) rather
    than breaking the calc.
- `sleep_score`: duration vs. 8h target (35%) + sleep efficiency (20%) +
  deep/REM proportion (15%) + respiratory-rate stability (15%, full credit
  unless RR is elevated vs. baseline) + HR dip (15%, fixed target of 15%+
  dip = full credit, not baseline-relative since dip is already a
  within-day relative measure; neutral half-credit when dip isn't
  computable at all). Only computed when stage-level data
  (`sleep_total_min`/`sleep_deep_min`/`sleep_rem_min`) is present - a row
  with only overnight vitals (no stage breakdown) keeps `sleep_score` null.

If you add a new ingestion path or change the formula, edit the trigger
function directly (`compute_health_scores`) rather than re-adding scoring
logic to a script - that's the whole point of moving it server-side.

**Health tab vital cards use personalized status too, not fixed reference
ranges.** `Health.svelte`'s `personalZGauge()` computes the exact same
same-source/leave-one-out/30-day-window z-score the trigger uses for HRV,
RHR, and respiratory rate, and drives each card's Normal/"Low for you"/"High
for you" badge from it. This was a real bug, not cosmetic: the original
version used a fixed population reference range (e.g. 20-120ms = "Normal"
HRV for any adult), which showed "Normal" on a day where HRV had dropped
~2.8 SD below this person's own baseline and Recovery had cratered because
of it - two parts of the same screen contradicting each other. SpO2/Temp/
Sleep-duration cards still use fixed reference ranges since those aren't
part of the score's baseline logic (no contradiction risk currently). If
`compute_health_scores`'s baseline logic changes, update `personalZGauge`
to match, same as the "missing" notes.

**Strain is now computed** (migration `add_strain_calculation`, part of
`compute_health_scores`) once a real WHOOP-style approach became possible:
a `daily_hr_hourly` jsonb column (migration `add_daily_hr_hourly_column`,
written externally by whatever's producing the sleep-vitals-export skill's
data, not by anything in this repo) holds real continuous/intraday heart
rate - 24 hourly buckets of `{avg, max, min, hour_start_local}`, with
`likely_workout`/`workout_overlap_local` flags on some hours - but only for
days that source provides it (Aug 7, 8, 9 so far, not every day; `null` on
days without it, same "computed only when the inputs exist" pattern as
everything else here). A first attempt used a step-count-only proxy and it
was bad - saturated near the top of the 0-21 scale even on light days,
unable to distinguish a rest day from a hard session; this replaces that
entirely now that continuous HR exists.

Formula, per hour with data (`no_data` hours skipped):
- Blend that hour's avg and max HR 50/50 (avg alone diluted real workout
  hours too much - within-hour rest periods pulled it down; max alone
  overweighted brief spikes). Tested both against Aug 7-9's real data
  before picking the blend.
- Convert to %HRR (heart rate reserve): `(blended_hr - resting_hr) /
  (max_hr - resting_hr)`, clamped to [0,1]. `resting_hr` prefers day-level
  `resting_hr_bpm`, falls back to the calmest hour in the same day's series.
  `max_hr` is a **flat assumed 184bpm** (Tanaka formula, 208-0.7×age, with
  age=35 ASSUMED - not measured or provided by the user, a real placeholder
  that directly shifts every %HRR value; revisit if a real age or measured
  max HR becomes available).
- Weight each hour's %HRR using the Banister TRIMP exponential curve
  (`hrr * e^(1.92*hrr)`) - this is what gives the scale its "hard to move
  once you're near max effort" compression, matching WHOOP's own described
  behavior.
- Sum across all hours, then log-scale onto 0-21: `21 * ln(1+total) /
  ln(21)`, clamped to [0,21].

Calibration note: on the 3 real days available, raw hourly-load totals
landed around 3.2-5.4, mapping to strain scores of 9.9-12.8 - moderate, not
extreme, which tracks with this being resistance-training-focused data
(lifting doesn't sustain high %HRR the way continuous cardio does) rather
than a sign the formula is under-scaling. No genuinely all-day-cardio
reference day exists yet to sanity-check the top end of the curve.

**HRV won't match Bevel's number, and that's expected, not a bug.** Apple
Health's HRV metric is specifically SDNN (the only HRV type HealthKit
exposes publicly); Bevel (and most recovery-focused wearables) likely use
RMSSD or their own proprietary aggregation, which is why the numbers
diverge even when both read the same underlying Apple Watch data - Apple
doesn't expose raw beat-to-beat intervals, only pre-computed SDNN spot
samples (~every 2h), so RMSSD can't be reconstructed from what's available.
Tested median/outlier-exclusion/min-only aggregations of the same samples
against Bevel's reported value and none matched, confirming it's a real
methodology difference, not just an averaging choice. Treat this app's HRV
as its own internally-consistent metric, not something to reconcile against
Bevel.

## Tone/working-style notes for whoever picks this up

This session involved a lot of rapid, frustrated iteration — the user is
detail-oriented about visual polish and will call out even small regressions
(text size, spacing, alignment) precisely, so changes should be applied
literally and exactly as specified rather than reinterpreted. Several rounds
of "nothing changed" turned out to be stale browser tabs/cached links rather
than actual bugs — if a requested change doesn't seem to show up, first verify
the change is actually in the file before assuming something is broken.
