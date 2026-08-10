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
via Claude iOS (which has HealthKit access granted) and pasted into a chat
session with Supabase access - **not** an automated Skill yet, just manual
request/response for now. Two reusable ingestion scripts live in
`scripts/health/`, both idempotent upserts keyed by date so they compose:

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

**Computed scores**: `recovery_pct` (HRV/resting-HR z-scored against the
mean/stdev of whatever days exist so far - genuinely noisy until ~2+ weeks
of data accumulate; needs a proper rolling-window baseline eventually, not
all-time) and `sleep_score` (duration vs. 8h target 50% + sleep efficiency
30% + deep/REM proportion 20%).

**Strain is intentionally NOT computed right now** (`strain_score` column
exists but is left null). A first attempt used a step-count-only proxy and
it was bad - saturated near the top of the 0-21 scale even on light days,
unable to distinguish a rest day from a hard session. A real WHOOP-style
strain calculation needs continuous/intraday heart rate (time-in-HR-zone
across the whole day) plus a known max HR, neither of which is reliably
available yet. Revisit if continuous all-day HR becomes queryable.

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
