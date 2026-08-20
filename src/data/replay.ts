// AirCorridor — local recreation of the seeded replay contract.
// Faithful hand-authored fixtures for event EV-2023-1105-001, driving the
// design front-end. This is not the geo engine port; it reproduces the
// seeded outputs described in air-corridor-logic.md (§5 types, §7 fixtures).

export type Confidence = "high" | "medium" | "low";
export type Severity = "moderate" | "high" | "critical";
export type SourceCategory =
  | "biomass"
  | "industrial"
  | "traffic"
  | "dust"
  | "unknown";
export type EvidenceKind =
  | "sensor"
  | "firms"
  | "wind"
  | "citizen_photo"
  | "citizen_voice"
  | "baseline";
export type PlaybookStatus =
  | "new"
  | "assigned"
  | "acked"
  | "verified"
  | "resolved"
  | "false_alarm";
export type Role = "citizen" | "analyst" | "authority";
export type LatLng = { lat: number; lng: number };

export type District = {
  id: string;
  name: string;
  state: "punjab" | "haryana" | "delhi" | "up";
  center: LatLng;
};

export type Evidence = {
  id: string;
  kind: EvidenceKind;
  source: string;
  at: string;
  summary: string;
  live: boolean;
  location?: LatLng;
  value?: number;
  unit?: string;
  photoUrl?: string;
  transcript?: string;
};

export type Hypothesis = {
  category: SourceCategory;
  rank: number;
  confidence: Confidence;
  why: string[];
  missing: string[];
};

export type DownwindZone = {
  districtId: string;
  etaHours: number;
  risk: "elevated" | "high";
};

export type PlaybookItem = {
  id: string;
  department: string;
  action: string;
  status: PlaybookStatus;
};

export type AirEvent = {
  schema: "aircorridor.event.v1";
  id: string;
  corridorId: "delhi-punjab-haryana";
  window: { start: string; end: string };
  severity: Severity;
  pollutant: "pm25";
  hypotheses: Hypothesis[];
  origin: { label: string; evidenceIds: string[] };
  downwind: DownwindZone[];
  evidence: Evidence[];
  playbook: PlaybookItem[];
  gemini: {
    model: string;
    promptHash: string;
    at: string;
    photoSummary: string;
    explanation: string;
    alertEn: string;
    alertHi: string;
    cached: boolean;
  };
  status: PlaybookStatus;
  audit: { at: string; actor: string; action: string }[];
};

// ─── §7 seeded constants ───────────────────────────────────────────────
export const CORRIDOR_ID = "delhi-punjab-haryana" as const;
export const REPLAY_T0 = "2023-11-05T14:40:00.000Z";
export const REPLAY_LABEL =
  "Replay · 5 Nov 2023 20:10 IST · stubble-burning corridor evening";
export const WIND = {
  fromDeg: 318,
  transportDeg: 138,
  speedKmh: 16,
  label: "138° SE",
};

export const BBOX = { minLng: 74.4, maxLng: 78.0, minLat: 28.15, maxLat: 31.85 };

export const DISTRICTS: District[] = [
  { id: "amritsar", name: "Amritsar", state: "punjab", center: { lat: 31.63, lng: 74.87 } },
  { id: "ludhiana", name: "Ludhiana", state: "punjab", center: { lat: 30.9, lng: 75.85 } },
  { id: "sangrur", name: "Sangrur", state: "punjab", center: { lat: 30.25, lng: 75.84 } },
  { id: "patiala", name: "Patiala", state: "punjab", center: { lat: 30.34, lng: 76.39 } },
  { id: "ambala", name: "Ambala", state: "haryana", center: { lat: 30.38, lng: 76.78 } },
  { id: "karnal", name: "Karnal", state: "haryana", center: { lat: 29.69, lng: 76.99 } },
  { id: "panipat", name: "Panipat", state: "haryana", center: { lat: 29.39, lng: 76.97 } },
  { id: "sonipat", name: "Sonipat", state: "haryana", center: { lat: 28.99, lng: 77.02 } },
  { id: "rohtak", name: "Rohtak", state: "haryana", center: { lat: 28.9, lng: 76.61 } },
  { id: "hisar", name: "Hisar", state: "haryana", center: { lat: 29.15, lng: 75.72 } },
  { id: "gurugram", name: "Gurugram", state: "haryana", center: { lat: 28.46, lng: 77.03 } },
  { id: "west-delhi", name: "West Delhi", state: "delhi", center: { lat: 28.67, lng: 77.09 } },
  { id: "central-delhi", name: "Central Delhi", state: "delhi", center: { lat: 28.65, lng: 77.22 } },
  { id: "east-delhi", name: "East Delhi", state: "delhi", center: { lat: 28.66, lng: 77.29 } },
  { id: "noida", name: "Noida", state: "up", center: { lat: 28.54, lng: 77.39 } },
  { id: "ghaziabad", name: "Ghaziabad", state: "up", center: { lat: 28.67, lng: 77.45 } },
  { id: "faridabad", name: "Faridabad", state: "haryana", center: { lat: 28.41, lng: 77.31 } },
];

export const districtById = (id: string): District | undefined =>
  DISTRICTS.find((d) => d.id === id);

export const FIRES = [
  { id: "firms-1", center: { lat: 30.72, lng: 75.91 }, frp: 44.2, conf: 82, at: "T0−2h" },
  { id: "firms-2", center: { lat: 30.41, lng: 76.08 }, frp: 21.6, conf: 68, at: "T0−1.5h" },
  { id: "firms-3", center: { lat: 30.19, lng: 76.36 }, frp: 17.4, conf: 71, at: "T0−1h" },
];

// PM2.5 series (−2 … +3), station → readings + baseline
export const STATIONS = [
  { id: "dwarka", name: "Dwarka", districtId: "west-delhi", center: { lat: 28.59, lng: 77.05 }, baseline: 92, series: [94, 118, 318, 341, 329, 280] },
  { id: "punjabi-bagh", name: "Punjabi Bagh", districtId: "west-delhi", center: { lat: 28.67, lng: 77.13 }, baseline: 90, series: [90, 121, 274, 301, 288, 250] },
  { id: "noida", name: "Noida S62", districtId: "noida", center: { lat: 28.54, lng: 77.39 }, baseline: 80, series: [80, 88, 104, 168, 241, 256] },
  { id: "ghaziabad", name: "Ghaziabad", districtId: "ghaziabad", center: { lat: 28.67, lng: 77.45 }, baseline: 83, series: [83, 91, 118, 190, 268, 274] },
];

export const stationsAtHour = (hourOffset: number) => {
  const i = Math.min(Math.max(hourOffset, 0), 3) + 2; // index −2…+3
  return STATIONS.map((s) => ({
    id: s.id,
    name: s.name,
    districtId: s.districtId,
    center: s.center,
    baseline: s.baseline,
    pm25: s.series[i],
  }));
};

const CACHED_GEMINI = {
  model: "gemini-2.5-flash",
  promptHash: "replay-stubble-2023-11-05",
  at: REPLAY_T0,
  photoSummary:
    "Low-angle dusk photo: dense grey-brown haze flattening the skyline, streetlights haloed. Consistent with fine particulate smoke, not fog.",
  explanation:
    "West Delhi PM2.5 jumped ~3.7× over baseline within an hour while upwind FIRMS fire flags and a steady NW→SE wind line up along the transport bearing. Pattern reads as an advected biomass plume rather than a local source.",
  alertEn:
    "Air-quality event: severe fine-particulate haze over West Delhi, likely upwind crop-residue smoke drifting southeast. Downwind districts should expect worsening air over the next 1–3 hours.",
  alertHi:
    "वायु गुणवत्ता चेतावनी: पश्चिमी दिल्ली में गंभीर धुंध, संभवतः ऊपरी हवा से आती पराली का धुआँ। अगले 1–3 घंटों में हवा और बिगड़ सकती है।",
  cached: true,
};

const evidenceFor = (hour: number): Evidence[] => {
  const base: Evidence[] = [
    {
      id: "ev-sensor-1",
      kind: "sensor",
      source: "CPCB · Dwarka",
      at: "T0",
      summary: "PM2.5 spike to 341 µg/m³ (baseline 92) — 3.7× over normal.",
      live: false,
      location: { lat: 28.59, lng: 77.05 },
      value: 341,
      unit: "µg/m³",
    },
    {
      id: "ev-wind",
      kind: "wind",
      source: "Open-Meteo",
      at: "T0",
      summary: "Wind from 318° at 16 km/h — transport bearing 138° SE.",
      live: false,
    },
    {
      id: "ev-firms-1",
      kind: "firms",
      source: "NASA FIRMS · VIIRS",
      at: "T0−2h",
      summary: "Possible ~1 km fire flag near Ludhiana, FRP 44.2, conf 82.",
      live: false,
      location: FIRES[0].center,
    },
    {
      id: "ev-baseline",
      kind: "baseline",
      source: "CPCB · 30-day",
      at: "T0",
      summary: "Corridor baseline 92 µg/m³ — anomaly threshold cleared.",
      live: false,
    },
  ];

  const reports: Evidence[] = [
    {
      id: "ev-citizen-1",
      kind: "citizen_voice",
      source: "Citizen report rep-1",
      at: "T0+0.2h",
      summary: "\"Bahut dhuan hai, aankhein jalan. West se aa raha hai.\"",
      live: false,
      location: { lat: 28.66, lng: 77.08 },
      photoUrl: "/evidence/report-1.jpg",
      transcript: "Bahut dhuan hai, aankhein jalan. West se aa raha hai.",
    },
    {
      id: "ev-citizen-2",
      kind: "citizen_photo",
      source: "Citizen report rep-2",
      at: "T0+0.6h",
      summary: "Haze photo from Janakpuri rooftop; visibility under 400 m.",
      live: false,
      location: { lat: 28.62, lng: 77.09 },
      photoUrl: "/evidence/report-2.jpg",
    },
    {
      id: "ev-citizen-3",
      kind: "citizen_photo",
      source: "Citizen report rep-3",
      at: "T0+0.9h",
      summary: "Street-level smoke, sodium lamps haloed — Uttam Nagar.",
      live: false,
      location: { lat: 28.62, lng: 77.05 },
      photoUrl: "/evidence/report-3.jpg",
    },
  ];

  // Hour 0 includes rep-1 only; hour ≥1 all three.
  return hour === 0 ? [...base, reports[0]] : [...base, ...reports];
};

const downwindFor = (hour: number): DownwindZone[] => {
  const all: DownwindZone[] = [
    { districtId: "central-delhi", etaHours: 1, risk: "high" },
    { districtId: "east-delhi", etaHours: 2, risk: "high" },
    { districtId: "noida", etaHours: 2, risk: "high" },
    { districtId: "ghaziabad", etaHours: 3, risk: "elevated" },
    { districtId: "faridabad", etaHours: 3, risk: "elevated" },
  ];
  // Engine: hour 0 keeps only etaHours <= 1.
  return hour === 0 ? all.filter((z) => z.etaHours <= 1) : all;
};

function isoPlusHours(iso: string, h: number): string {
  return new Date(new Date(iso).getTime() + h * 3600_000).toISOString();
}

/**
 * buildReplayEvent — pure, clamps hour to [0,3]. Returns the seeded event.
 */
export function buildReplayEvent(hourOffset: number): AirEvent {
  const hour = Math.min(Math.max(Math.round(hourOffset), 0), 3);
  const reportCount = hour === 0 ? 1 : 3;

  const confidence: Confidence =
    reportCount >= 2 ? "high" : hour >= 1 ? "medium" : "medium";

  return {
    schema: "aircorridor.event.v1",
    id: "EV-2023-1105-001",
    corridorId: CORRIDOR_ID,
    window: { start: REPLAY_T0, end: isoPlusHours(REPLAY_T0, hour) },
    severity: "critical", // peak pm25 341 ≥ 250
    pollutant: "pm25",
    hypotheses: [
      {
        category: "biomass",
        rank: 1,
        confidence,
        why: ["ev-sensor-1", "ev-wind", "ev-firms-1", "ev-citizen-1"],
        missing:
          reportCount >= 2
            ? []
            : ["Additional ground confirmation downwind"],
      },
      {
        category: "industrial",
        rank: 2,
        confidence: "low",
        why: ["ev-sensor-1"],
        missing: ["No stack signature", "No point-source proximity"],
      },
    ],
    origin: {
      label: "Upwind Sangrur–Ludhiana belt",
      evidenceIds: ["ev-firms-1", "ev-wind"],
    },
    downwind: downwindFor(hour),
    evidence: evidenceFor(hour),
    playbook: [
      { id: "pb-verify", department: "Pollution Control Board", action: "Dispatch field team to confirm haze & rule out local stack", status: "assigned" },
      { id: "pb-health", department: "Health / DDMA", action: "Issue mask + outdoor-exposure advisory for downwind districts", status: "assigned" },
      { id: "pb-coord", department: "Inter-state coordination", action: "Flag Punjab agri cell on active residue burning upwind", status: "assigned" },
    ],
    gemini: CACHED_GEMINI,
    status: hour < 2 ? "new" : "assigned",
    audit: [
      {
        at: REPLAY_T0,
        actor: "detector",
        action:
          "Event opened from PM2.5 spike + upwind FIRMS + wind alignment.",
      },
    ],
  };
}

/** interopPayload — identity-stripped share JSON (§4). */
export function interopPayload(event: AirEvent) {
  return {
    schema: event.schema,
    id: event.id,
    corridorId: event.corridorId,
    window: event.window,
    severity: event.severity,
    pollutant: event.pollutant,
    hypotheses: event.hypotheses,
    origin: event.origin,
    downwind: event.downwind,
    playbook: event.playbook,
    evidence: event.evidence.map((e) => ({
      id: e.id,
      kind: e.kind,
      source: e.source,
      at: e.at,
      summary:
        e.kind === "citizen_photo" || e.kind === "citizen_voice"
          ? "Citizen evidence (identity stripped)"
          : e.summary,
      live: e.live,
    })),
  };
}

export const CATEGORY_LABEL: Record<SourceCategory, string> = {
  biomass: "Possible biomass-burning plume",
  industrial: "Possible industrial release",
  traffic: "Traffic-related spike",
  dust: "Dust event",
  unknown: "Unknown",
};
