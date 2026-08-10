"""
Ingests the "sleep session detail" HealthKit document shape into health_metrics:
  {
    "sleep_session_range": {start_utc, end_utc, start_local, end_local},
    "heartRateVariabilitySDNN": {samples:[{t,value}], summary:{average,max,min,total_samples}},
    "respiratoryRate": {summary:{average,max,min,total_samples}},
    "heartRate": {summary:{average,max,min,total_samples}},
    "oxygenSaturation": {samples:[{t,value}], summary:{average,max,min,total_samples}},
    "appleSleepingWristTemperature": {samples:[{start,end,value}]},
    "sleepAnalysis": {samples:[{start,end,category}]}   -- optional, raw stage intervals
  }

Distinct from the multi-day summary shape (ingest_daily_summary.py), which
covers day-average HRV/resting HR/step count across a date range. Both
upsert into the same health_metrics table, keyed by date (the wake-up
morning), so a day's row can be built from either or both shapes as they
come in - this one only touches the overnight-vitals columns it's given,
leaving whatever a prior ingestion already set alone. Doesn't compute
recovery_pct or sleep_score itself - see ingest_daily_summary.py's
docstring for why (a DB trigger handles it now, regardless of writer).

Usage: python3 ingest_sleep_session_detail.py <path_to_json>
"""
import json, sys, urllib.request, urllib.error
from datetime import datetime

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

def aggregate_sleep_stages(samples):
    mins = {'Deep': 0, 'REM': 0, 'Core': 0, 'Awake': 0}
    for s in samples:
        start = datetime.fromisoformat(s['start'].replace('Z', '+00:00'))
        end = datetime.fromisoformat(s['end'].replace('Z', '+00:00'))
        dur_min = (end - start).total_seconds() / 60
        for key in mins:
            if key in s['category']:
                mins[key] += dur_min
                break
    total_sleep = mins['Deep'] + mins['REM'] + mins['Core']
    session_start = min(datetime.fromisoformat(s['start'].replace('Z', '+00:00')) for s in samples)
    session_end = max(datetime.fromisoformat(s['end'].replace('Z', '+00:00')) for s in samples)
    time_in_bed = (session_end - session_start).total_seconds() / 60
    return {
        'sleep_deep_min': round(mins['Deep']),
        'sleep_rem_min': round(mins['REM']),
        'sleep_core_min': round(mins['Core']),
        'sleep_awake_min': round(mins['Awake']),
        'sleep_total_min': round(total_sleep),
        'sleep_efficiency_pct': round(100 * total_sleep / time_in_bed, 1) if time_in_bed else None,
    }

def ingest(doc):
    wake_date = datetime.fromisoformat(doc['sleep_session_range']['end_local']).date()
    payload = {'date': wake_date.isoformat()}

    if 'heartRateVariabilitySDNN' in doc:
        s = doc['heartRateVariabilitySDNN']['summary']
        payload['overnight_hrv_ms'] = s['average']
        payload['overnight_hrv_min_ms'] = s['min']
        payload['overnight_hrv_max_ms'] = s['max']
        payload['overnight_hrv_samples'] = doc['heartRateVariabilitySDNN'].get('samples', [])

    if 'respiratoryRate' in doc:
        s = doc['respiratoryRate']['summary']
        payload['respiratory_rate_avg'] = s['average']
        payload['respiratory_rate_min'] = s['min']
        payload['respiratory_rate_max'] = s['max']

    if 'heartRate' in doc:
        s = doc['heartRate']['summary']
        payload['overnight_hr_avg_bpm'] = s['average']
        payload['overnight_hr_min_bpm'] = s['min']
        payload['overnight_hr_max_bpm'] = s['max']

    if 'oxygenSaturation' in doc:
        s = doc['oxygenSaturation']['summary']
        payload['overnight_spo2_avg_pct'] = s['average']
        payload['overnight_spo2_min_pct'] = s['min']
        payload['overnight_spo2_max_pct'] = s['max']
        payload['overnight_spo2_samples'] = doc['oxygenSaturation'].get('samples', [])

    temp_samples = doc.get('appleSleepingWristTemperature', {}).get('samples', [])
    if temp_samples:
        payload['wrist_temp_c'] = temp_samples[0]['value']

    stage_samples = doc.get('sleepAnalysis', {}).get('samples')
    if stage_samples:
        stages = aggregate_sleep_stages(stage_samples)
        payload.update(stages)
        payload['sleep_start'] = doc['sleep_session_range']['start_utc']
        payload['sleep_end'] = doc['sleep_session_range']['end_utc']
        # sleep_score is NOT set here - the compute_health_scores DB trigger
        # recomputes it automatically from these same fields on write. See
        # ingest_daily_summary.py's docstring for why scoring moved server-side.

    return payload

if __name__ == '__main__':
    token_path = '/tmp/sp_token.txt'
    try:
        token = open(token_path).read().strip()
    except FileNotFoundError:
        print(f"No token at {token_path} - authenticate first and save an access_token there.", file=sys.stderr)
        sys.exit(1)

    doc = json.load(open(sys.argv[1]))
    payload = ingest(doc)
    print("Upserting:", json.dumps(payload, indent=2, default=str))
    req("POST", "health_metrics?on_conflict=date", payload,
        prefer="return=minimal,resolution=merge-duplicates", token=token)
    print("Done.")
