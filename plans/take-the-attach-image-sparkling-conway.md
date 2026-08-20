# AirCorridor — Pollution-Event Dashboard (TimeFrame aesthetic)

## Context
The user wants a front-end design for **AirCorridor**, a pollution-event operating system
for the Delhi–Punjab–Haryana corridor (see `src/imports/pasted_text/air-corridor-logic.md`).
It is an *event* console, not an AQI map: it must answer *what is happening, where it
originated, who is downwind next, which department acts now*. Default mode is **Replay**
(never presented as live).

The attached screenshot (`src/imports/Screenshot_From_2026-08-21_00-01-09.png`, the
"TimeFrame" workout-calendar dashboard) is the **visual reference**: floating icon rail,
header with a centered segmented control, an oversized page title with inline stat
callouts + a pill CTA, a left column of stacked rounded cards, and a large right panel of
soft rounded event blocks in a lavender/lime palette.

The current repo is a bare Vite + React 19 + Tailwind v4 scaffold — `src/App.tsx` is empty
and none of the contract's `@/lib/*` / `@/data/*` modules exist. So the engine will be
recreated locally as seeded fixtures (this is a design task, not an engine port).

## Approach
Build a single-page role-aware dashboard that maps the reference layout onto the AirCorridor
domain, driven by locally recreated replay data for event `EV-2023-1105-001`.

### Data layer — `src/data/replay.ts`
Recreate the seeded contract (§5 types, §7 fixtures) as plain TS. Not a full geo engine —
faithful hand-authored `AirEvent` output per replay hour:
- `REPLAY_LABEL`, `REPLAY_T0`, wind (318°→transport 138° SE, 16 km/h), corridor `DISTRICTS`
  with lat/lng + `BBOX` (for map positioning), FIRMS points, PM2.5 series, citizen reports,
  cached Gemini strings.
- `buildReplayEvent(hour: 0|1|2|3): AirEvent` returning the seeded event: reports (`[rep-1]`
  at hour 0, all three at hour ≥1), `status` `"new"` (hour<2) / `"assigned"`, severity
  `critical`, biomass hypothesis rank 1 + industrial rank 2, origin "Upwind Sangrur–Ludhiana
  belt", downwind districts with ETA/risk, biomass playbook (`pb-verify`,`pb-health`,`pb-coord`).
- `interopPayload(event)`: identity-stripped share JSON per §4.
- Apply the §6 authority overlay in the UI (ack ids → `"acked"`, verify note → audit line +
  status `"verified"`).

### UI — `src/App.tsx` + `src/components/*`
Map reference → domain, keeping the exact visual language (rounded-3xl cards, soft shadows,
lavender surfaces, lime accent for the active/critical items, avatar/evidence chips):
- **Icon rail** (left): Event, Corridor map, Playbook, Evidence, Interop, Settings.
- **Header**: AirCorridor mark + title; centered segmented control = **Role** switch
  (Citizen / Analyst / Authority) replacing Daily/Weekly/Monthly; right side a non-live
  **REPLAY** badge (replacing Dark/Light), notifications, avatar.
- **Title block**: event id + "Corridor · Delhi–Punjab–Haryana" subtitle; inline stat
  callouts (Severity `critical`, peak PM2.5 `341 µg/m³ West Delhi`, Wind `138° SE · 16 km/h`);
  pill CTA that is role-gated (Authority → "Acknowledge", Citizen → "Submit report",
  Analyst → "Export interop JSON").
- **Left column cards**: Replay-hour selector styled like the mini-calendar (hours 0–3,
  gated to Analyst/Authority); **Playbook** checklist (departments + ack toggles for
  Authority, per §8 permissions); **Downwind** zones list with ETA + risk pills.
- **Main panel**: the reference timeline grid reinterpreted as the **corridor / advection
  view** — an SVG corridor plot positioning origin + FIRMS + downwind district tips from
  `BBOX`, above an **evidence & hypothesis timeline** of soft event blocks (sensor spike,
  FIRMS flags, citizen photo/voice, wind), lime for the origin spike, lavender for supporting
  evidence, avatar-style chips for citizen evidence.
- **Interop drawer/modal**: pretty-printed `interopPayload` JSON (Analyst/Authority only).
- Role permissions enforced per §8 table (view / submit / replay / ack / verify / interop).

### Styling / fonts
- `src/index.css`: keep `@import 'tailwindcss';` first; add a Google Fonts `@import`
  (display + text pairing chosen via aesthetic-stance) and theme tokens for the
  lavender/lime palette. No unlayered universal reset.
- Invoke `make:aesthetic-stance` before writing code and call `create_make_theme` (full-page
  brief) to lock fonts/tokens/imagery.

## Files
- `src/data/replay.ts` (new) — seeded fixtures + `buildReplayEvent` / `interopPayload` / types.
- `src/App.tsx` (rewrite) — dashboard composition + role/hour/ack state.
- `src/components/*.tsx` (new) — IconRail, Header, TitleStats, ReplayHours, PlaybookCard,
  DownwindCard, CorridorMap, EvidenceTimeline, InteropDrawer.
- `src/index.css` — fonts + palette tokens.

## Verification
- App builds and hot-reloads on the running Vite dev server (`$PORT`); load the preview.
- Switch Role: Citizen sees submit CTA + no replay/ack; Analyst gets replay hours + interop;
  Authority can ack playbook items (status → `acked`) and add a verify note (status →
  `verified`, audit line appended).
- Switch replay hour 0→3: hour 0 shows only `rep-1` and status `new`; hour ≥2 status
  `assigned`; downwind list and evidence update.
- Interop JSON view shows identity-stripped payload ("Citizen evidence (identity stripped)",
  no gemini/status/audit).
