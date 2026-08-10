"""
Ingests the "daily summary" HealthKit document shape into health_metrics:
  {
    "heartRateVariabilitySDNN": {"statistics": [{period_start, period_end, average}, ...]},
    "restingHeartRate":         {"statistics": [{period_start, period_end, average}, ...]},
    "stepCount":                {"statistics": [{period_start, period_end, sum}, ...]},
    "sleepAnalysis":            {"samples": [{start, end, category}, ...]}
  }

Each statistics array covers one row per Pacific calendar day (period_start
is already midnight-Pacific-aligned in what's been supplied so far). Sleep
samples are raw intervals covering possibly-multiple nights; this groups them
into sessions by gap detection (>3h gap = new session) and assigns each
session to the WAKE date (the morning after), matching how recovery apps
date a night's sleep by the day you experience it.

This script only writes raw metrics - it does NOT compute recovery_pct or
sleep_score itself. A DB trigger (compute_health_scores, see migration
add_score_computation_trigger) recomputes both automatically on every
insert/update against a proper leave-one-out baseline over all rows, so
scoring stays correct regardless of which ingestion path wrote a given row
(this script, ingest_sleep_session_detail.py, or the sleep-vitals-export
skill running independently). Does NOT compute strain - that needs
continuous/intraday heart rate, which no current source reliably provides.

Usage: python3 ingest_daily_summary.py <path_to_json>
"""
import json, sys, urllib.request, urllib.error
from datetime import datetime, timedelta

SUPABASE_URL = "https://rrqljyhfjoyancgfefcb.supabase.co/rest/v1"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJycWxqeWhmam95YW5jZ2ZlZmNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwOTY0MDMsImV4cCI6MjA2OTY3MjQwM30.aWcGiDPyaQy6iK9umVy8feZowfV_1ea8143WEpLmcF0"

def req(method, path, body=None, prefer=None, token=None):
    headers = {"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    if prefer: headers["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(f"{SUPABASE_URL}/{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        print(f"ERROR {method} {path}: {e.code} {e.read().decode()}", file=sys.stderr)
        raise

PACIFIC_OFFSET = timedelta(hours=-7)  # PDT - adjust to -8 for PST months

def to_pacific_date(iso_str):
    dt = datetime.fromisoformat(iso_str.replace('Z', '+00:00'))
    return (dt + PACIFIC_OFFSET).date()

def aggregate_sleep_sessions(samples):
    """Groups raw sleep-stage interval samples into per-night sessions, keyed
    by wake date. Returns {date: {sleep_start, sleep_end, sleep_*_min, sleep_efficiency_pct}}."""
    samples = sorted(samples, key=lambda s: s['start'])
    sessions, cur, prev_end = [], [], None
    for s in samples:
        start = datetime.fromisoformat(s['start'].replace('Z', '+00:00'))
        end = datetime.fromisoformat(s['end'].replace('Z', '+00:00'))
        if prev_end is not None and (start - prev_end) > timedelta(hours=3):
            sessions.append(cur)
            cur = []
        cur.append((start, end, s['category']))
        prev_end = end
    if cur:
        sessions.append(cur)

    result = {}
    for session in sessions:
        session_start = min(s[0] for s in session)
        session_end = max(s[1] for s in session)
        mins = {'Deep': 0, 'REM': 0, 'Core': 0, 'Awake': 0}
        for start, end, category in session:
            dur_min = (end - start).total_seconds() / 60
            for key in mins:
                if key in category:
                    mins[key] += dur_min
                    break
        total_sleep = mins['Deep'] + mins['REM'] + mins['Core']
        time_in_bed = (session_end - session_start).total_seconds() / 60
        wake_date = to_pacific_date(session_end.isoformat())
        result[wake_date] = {
            'sleep_start': session_start.isoformat(),
            'sleep_end': session_end.isoformat(),
            'sleep_deep_min': round(mins['Deep']),
            'sleep_rem_min': round(mins['REM']),
            'sleep_core_min': round(mins['Core']),
            'sleep_awake_min': round(mins['Awake']),
            'sleep_total_min': round(total_sleep),
            'sleep_efficiency_pct': round(100 * total_sleep / time_in_bed, 1) if time_in_bed else None,
        }
    return result

def build_rows(data):
    rows = {}
    if 'heartRateVariabilitySDNN' in data:
        for stat in data['heartRateVariabilitySDNN']['statistics']:
            d = to_pacific_date(stat['period_start'])
            rows.setdefault(d, {})['hrv_ms'] = round(stat['average'], 1)
    if 'restingHeartRate' in data:
        for stat in data['restingHeartRate']['statistics']:
            d = to_pacific_date(stat['period_start'])
            rows.setdefault(d, {})['resting_hr_bpm'] = round(stat['average'], 1)
    if 'stepCount' in data:
        for stat in data['stepCount']['statistics']:
            d = to_pacific_date(stat['period_start'])
            rows.setdefault(d, {})['step_count'] = round(stat['sum'])
    if 'sleepAnalysis' in data and data['sleepAnalysis'].get('samples'):
        for d, sleep_fields in aggregate_sleep_sessions(data['sleepAnalysis']['samples']).items():
            rows.setdefault(d, {}).update(sleep_fields)

    # recovery_pct/sleep_score are NOT computed here - a DB trigger
    # (compute_health_scores, see migration add_score_computation_trigger)
    # recomputes both automatically on every insert/update, using a proper
    # leave-one-out baseline against all other rows. Computing it here too
    # would just be duplicate logic that can drift from the trigger's -
    # exactly what happened before this migration existed, when a different
    # ingestion path (the sleep-vitals-export skill) wrote rows with no
    # score at all because it didn't know this script's formula.
    return rows

if __name__ == '__main__':
    import getpass
    token_path = '/tmp/sp_token.txt'
    try:
        token = open(token_path).read().strip()
    except FileNotFoundError:
        print(f"No token at {token_path} - authenticate first and save an access_token there.", file=sys.stderr)
        sys.exit(1)

    data = json.load(open(sys.argv[1]))
    rows = build_rows(data)

    for d in sorted(rows):
        print(d, '->', {k: v for k, v in rows[d].items() if k not in ('sleep_start', 'sleep_end')})

    print()
    for d, r in sorted(rows.items()):
        payload = dict(r)
        payload['date'] = d.isoformat()
        req("POST", "health_metrics?on_conflict=date", payload,
            prefer="return=minimal,resolution=merge-duplicates", token=token)
        print(f"  upserted {d}")
    print("Done.")
