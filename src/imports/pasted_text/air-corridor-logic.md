AirCorridor — backend / logic contract

1. Purpose

Pollution-event operating system for corridor delhi-punjab-haryana. Not an AQI map.

Must answer: what is happening, where it likely originated, who is downwind next, which department acts now.

Invariants:

• Product object is an Event, not a reading.
• Default mode is Replay. Never present as live.
• TypeScript owns numbers (anomaly, distance, wind alignment, advection, routing).
• Gemini owns language/multimodal only. Must not invent µg/m³, distances, or causality.
• FIRMS = possible ~1 km fire flag, not a confirmed fire.
• Downwind = indicative wind advection, not a chemistry model.
• Interop JSON strips citizen identities.

───

2. Runtime architecture (as implemented)

data/replay.ts  →  detect / advection / playbook / geo / corridor
                →  lib/engine.ts  buildReplayEvent(hour) → AirEvent
                                interopPayload(event) → share JSON
                →  frontend imports these. No HTTP.

┌───────────────────────┬─────────────────────────────────────────────────┐
│ Exists                │ Does not exist                                  │
├───────────────────────┼─────────────────────────────────────────────────┤
│ In-process TS modules │ app/api/**                                      │
├───────────────────────┼─────────────────────────────────────────────────┤
│ Replay fixtures       │ Database / Firestore / BigQuery                 │
├───────────────────────┼─────────────────────────────────────────────────┤
│ Cached Gemini strings │ Live Gemini / OpenAQ / FIRMS / Open-Meteo calls │
├───────────────────────┼─────────────────────────────────────────────────┤
│ Client-only Role      │ Auth, sessions, RBAC                            │
└───────────────────────┴─────────────────────────────────────────────────┘

───

3. User flows (logic)

Analyst: hour ∈ {0,1,2,3} → buildReplayEvent(hour) → one event EV-2023-1105-001. At hour 0 only first citizen report; hour ≥ 1 all three. Engine status: "new" if hour < 2 else "assigned".

Authority: same event. Overlay playbook item → "acked". Overlay verify note → audit line actor: "authority" and event status: "verified". If acked and no verify, event status: "acked". Engine does not persist this (see §7).

Citizen: intended { text, location, photo?, voice? }. Not implemented. Current success = return event id EV-2023-1105-001. Does not mutate the event graph.

Neighbour: interopPayload(event).

───

4. In-process API (preserve)

buildReplayEvent(hourOffset: number): AirEvent

lib/engine.ts. Clamps hour to [0, 3]. Pure. Throws "Replay fixture produced no event" if detection empty.

interopPayload(event: AirEvent): object

Keeps schema, id, corridorId, window, severity, pollutant, hypotheses, origin, downwind, playbook. Evidence reduced to { id, kind, source, at, summary, live }. Citizen summary becomes "Citizen evidence (identity stripped)". Drops gemini, status, audit, location, value, unit, photoUrl, transcript.

stationsAtHour(hourOffset: number): StationReading[]

data/replay.ts. Index hourOffset + 2 into 6-length series (−2…+3).

detectCandidates(stations, fires, wind, reports): Candidate[]

Include if deviation >= 0.8 OR score >= 2.2. Sort by score desc.

deviation = (pm25 - max(baseline,20)) / max(baseline,20)
score = max(0,dev)*2.4 + min(3,fires)*0.9 + min(3,reports)*0.5 + max(0,windAlign)*0.8

Fire support: ≤400 km and alignment ≥ 0.35 vs transport dir. Report support: ≤35 km. transportDeg = (wind.fromDeg + 180) % 360.

downwindZones(origin, wind, hours, skip?): DownwindZone[]

Each hour 1..N, tip at speedKmh * h km along transport. District included if center within 28 km of tip. risk: "high" if etaHours ≤ 2 else "elevated".

Engine uses spike station as origin (not FIRMS), skips spike district, hours = max(hour,1), then if hour===0 keeps only etaHours <= 1.

routePlaybook(category, originLabel, downwindNames): PlaybookItem[]

Replay always calls biomass + origin label "Sangrur".

┌────────────┬───────────────────────────────────────────────┐
│ category   │ ids                                           │
├────────────┼───────────────────────────────────────────────┤
│ biomass    │ pb-verify, pb-health, pb-coord (all assigned) │
├────────────┼───────────────────────────────────────────────┤
│ industrial │ pb-verify, pb-inspect                         │
├────────────┼───────────────────────────────────────────────┤
│ traffic    │ pb-traffic                                    │
├────────────┼───────────────────────────────────────────────┤
│ else       │ pb-verify                                     │
└────────────┴───────────────────────────────────────────────┘

Corridor

CORRIDOR_ID, BBOX { minLng:74.4, maxLng:78.0, minLat:28.15, maxLat:31.85 }, DISTRICTS, districtById, nearestDistrict (Euclidean lat/lng).

Geo: haversineKm, bearingDeg, destinationPoint, angleDiffDeg, transportDeg, alignment. R=6371 km.

───

5. Types (lib/types.ts) — must preserve

Confidence = "high" | "medium" | "low"
Severity = "moderate" | "high" | "critical"
SourceCategory = "biomass" | "industrial" | "traffic" | "dust" | "unknown"
EvidenceKind = "sensor" | "firms" | "wind" | "citizen_photo" | "citizen_voice" | "baseline"
PlaybookStatus = "new" | "assigned" | "acked" | "verified" | "resolved" | "false_alarm"
Role = "citizen" | "analyst" | "authority"
LatLng = { lat: number; lng: number }

AirEvent = {
  schema: "aircorridor.event.v1"
  id: string
  corridorId: "delhi-punjab-haryana"
  window: { start: string; end: string }   // ISO UTC
  severity: Severity
  pollutant: "pm25"
  hypotheses: { category, rank, confidence, why: string[], missing: string[] }[]
  origin: { label: string; evidenceIds: string[] }
  downwind: { districtId: string; etaHours: number; risk: "elevated" | "high" }[]
  evidence: {
    id, kind, source, at, summary, live,
    location?, value?, unit?, photoUrl?, transcript?
  }[]
  playbook: { id, department, action, status }[]
  gemini: {
    model, promptHash, at, photoSummary, explanation, alertEn, alertHi, cached: boolean
  }
  status: PlaybookStatus
  audit: { at, actor, action }[]
}

Also: StationReading, FirePoint, WindSample, CitizenReport, District. ReplaySnapshot is unused.

───

6. Authority overlay (not in engine — frontend must reapply)

const event = buildReplayEvent(hour)
event.playbook = event.playbook.map(p =>
  ackedIds.has(p.id) ? { ...p, status: "acked" } : p
)
if (verifyNotes.length) {
  event.audit = [...event.audit, ...verifyNotes.map(n => ({
    at: new Date().toISOString(), actor: "authority", action: n
  }))]
  event.status = "verified"
} else if (ackedIds.size) {
  event.status = "acked"
}

Empty verify note default: "Field team confirmed haze; no local stack found."
Ack ids on replay: pb-verify, pb-health, pb-coord.

───

7. Seeded replay (exact)

REPLAY_T0 = "2023-11-05T14:40:00.000Z" (20:10 IST).
REPLAY_LABEL = "Replay · 5 Nov 2023 20:10 IST · stubble-burning corridor evening"

Wind: 29.4, 76.8 · from 318° · 16 km/h · transport 138° SE.

FIRMS:
firms-1 30.72,75.91 FRP 44.2 conf 82 T0−2h
firms-2 30.41,76.08 FRP 21.6 conf 68 T0−1.5h
firms-3 30.19,76.36 FRP 17.4 conf 71 T0−1h
VIIRS.

PM2.5 series (−2…+3) — Dwarka 94,118,318,341,329,280 baseline 92, district west-delhi. Punjabi Bagh 90,121,274,301,288,250. Noida 80,88,104,168,241,256. Ghaziabad 83,91,118,190,268,274. Full table in data/replay.ts / docs/BACKEND_CONTEXT.md.

T0 top candidate: west-delhi. Severity from pm25: ≥250 critical, ≥150 high, else moderate → T0 critical.

Reports:
rep-1 T0+0.2h 28.66,77.08 photo /evidence/report-1.jpg voice "Bahut dhuan hai, aankhein jalan. West se aa raha hai." → evidence kind citizen_voice
rep-2 /evidence/report-2.jpg
rep-3 /evidence/report-3.jpg
Hour 0 includes [rep-1] only.

Engine labels: origin "Upwind Sangrur–Ludhiana belt". Hypotheses: biomass rank 1 (why ev-sensor-1, ev-wind, ev-firms-1, ev-citizen-1) + industrial rank 2 low. Confidence: high if score≥5 and ≥2 fires and ≥2 reports; else medium if score≥3 and (≥1 fire or ≥1 report); else low. T0 typically medium (only one report in detection).

Initial audit: actor detector, "Event opened from PM2.5 spike + upwind FIRMS + wind alignment."

District ids: amritsar, ludhiana, patiala, sangrur, ambala, karnal, panipat, sonipat, rohtak, hisar, gurugram, west-delhi, central-delhi, east-delhi, noida, ghaziabad, faridabad.

───

8. Auth

None. Role is client-only.

┌───────────────┬─────────┬─────────┬───────────┐
│               │ citizen │ analyst │ authority │
├───────────────┼─────────┼─────────┼───────────┤
│ View event    │ yes     │ yes     │ yes       │
├───────────────┼─────────┼─────────┼───────────┤
│ Submit report │ yes     │ —       │ —         │
├───────────────┼─────────┼─────────┼───────────┤
│ Replay hour   │ —       │ yes     │ yes       │
├───────────────┼─────────┼─────────┼───────────┤
│ Ack playbook  │ no      │ no      │ yes       │
├───────────────┼─────────┼─────────┼───────────┤
│ Verify/audit  │ no      │ no      │ yes       │
├───────────────┼─────────┼─────────┼───────────┤
│ Interop JSON  │ no      │ yes     │ yes       │
└───────────────┴─────────┴─────────┴───────────┘

───

9. AI

No live call. No prompts in repo. event.gemini is CACHED_GEMINI: model gemini-2.5-flash, cached: true, promptHash: replay-stubble-2023-11-05. Full photoSummary / explanation / alertEn / alertHi in data/replay.ts.

Live path planned: GEMINI_API_KEY, structured JSON in, structured gemini object out, evidence-only payload, no invented measurements.

───

10. Env (all unused by logic today)

GEMINI_API_KEY=
OPENAQ_API_KEY=
FIRMS_MAP_KEY=
NEXT_PUBLIC_GOOGLE_MAPS_KEY=

Replay is offline.

───

11. Dependencies

Runtime: Next 16.3.1, React 19.2.8. Logic has no geo/AI/DB packages.

Named, not called: OpenAQ v3, NASA FIRMS, Open-Meteo, Gemini, Google Maps (renderer only).

───

12. New frontend must import

import { buildReplayEvent, interopPayload } from "@/lib/engine"
import { DISTRICTS, BBOX, districtById } from "@/lib/corridor"
import { REPLAY_LABEL, REPLAY_T0, stationsAtHour } from "@/data/replay"
import type { AirEvent, Role } from "@/lib/types"

Then §6 overlay. Hour 0|1|2|3. Assets at /evidence/report-{1,2,3}.jpg.

Category display strings: Possible biomass-burning plume / Possible industrial release / Traffic-related spike / Dust event / Unknown.

───

13. Tests that must stay green

npm test → lib/geo.test.ts: transport 318→138; Ludhiana–West Delhi 200–400 km; angle wrap; T0 spike west-delhi; 3h advection from 28.67,77.09 hits noida|ghaziabad|faridabad|east-delhi.

───

14. Gaps — do not invent

No HTTP, no persistence, no live ingest, no Gemini client, no citizen ingest into the graph, no multi-event list from engine, no district polygons (points only).