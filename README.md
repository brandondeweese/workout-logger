# Workout Logger — Handoff to Claude Code

## What's here
- `workout-logger.html` — self-contained workout logging app (HTML/CSS/JS, no build step).
  Currently uses `localStorage` for persistence (works standalone, no backend required).
- `progressive-overload-program.md` — the 12-week program this app is built around.

## Next steps (for Claude Code)
1. `git init`, push to a new GitHub repo.
2. Create a free Supabase project. Run this SQL in the Supabase SQL Editor:

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

3. Swap the app's storage layer (`storeGet` / `storeSet` / `storeDelete` in the `<script>`
   block) from `localStorage` to the Supabase JS client (`@supabase/supabase-js`), using the
   project's URL + anon public key.
4. Optionally set up the Supabase MCP connector so Claude (in claude.ai chat) can query
   `workout_logs` directly for analysis in future conversations.

## App notes
- Set rows support tagging (warmup/dropset/failure), a per-set checkmark that's gated behind
  an active "Start Workout" clock, and an add/remove-set control per exercise.
- In-progress workouts autosave a draft (debounced) and prompt to restore on reload — this
  logic lives in `restoreDraftIfAny()` near the bottom of the script and depends on the
  storage adapter functions above.
- Phase 3 "Day 3: Legs (Peaking 8/7)" has hardcoded set-by-set weight/rep presets in the
  `SET_PRESETS` object — that's the pattern to follow if more prescribed-weight days get added.
