import { useMemo, useState, type ReactNode } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Marker,
  Polygon,
  Polyline,
  Tooltip,
} from "react-leaflet";
import L from "leaflet";
import {
  buildReplayEvent,
  interopPayload,
  districtById,
  DISTRICTS,
  STATIONS,
  FIRES,
  BBOX,
  WIND,
  REPLAY_LABEL,
  CATEGORY_LABEL,
  type AirEvent,
  type Role,
  type Evidence,
  type PlaybookItem,
} from "./data/replay";

/* ─── tiny inline icons ─────────────────────────────────────────────── */
type IconProps = { className?: string };
const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
const IMap = (p: IconProps) => (
  <svg viewBox="0 0 24 24" className={p.className} {...stroke}><path d="M9 4L4 6v14l5-2 6 2 5-2V4l-5 2-6-2z" /><path d="M9 4v14M15 6v14" /></svg>
);
const IPlay = (p: IconProps) => (
  <svg viewBox="0 0 24 24" className={p.className} {...stroke}><rect x="4" y="5" width="16" height="14" rx="3" /><path d="M8 9h4M8 13h8M8 17h6" /></svg>
);
const IEye = (p: IconProps) => (
  <svg viewBox="0 0 24 24" className={p.className} {...stroke}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="2.5" /></svg>
);
const IShare = (p: IconProps) => (
  <svg viewBox="0 0 24 24" className={p.className} {...stroke}><circle cx="6" cy="12" r="2.4" /><circle cx="18" cy="6" r="2.4" /><circle cx="18" cy="18" r="2.4" /><path d="M8.1 10.9l7.8-3.8M8.1 13.1l7.8 3.8" /></svg>
);
const IBell = (p: IconProps) => (
  <svg viewBox="0 0 24 24" className={p.className} {...stroke}><path d="M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6z" /><path d="M10 20a2 2 0 004 0" /></svg>
);
const IPlus = (p: IconProps) => (
  <svg viewBox="0 0 24 24" className={p.className} {...stroke}><path d="M12 5v14M5 12h14" /></svg>
);
const IWind = (p: IconProps) => (
  <svg viewBox="0 0 24 24" className={p.className} {...stroke}><path d="M3 8h11a3 3 0 100-6M3 12h16a3 3 0 110 6M3 16h8a2.5 2.5 0 110 5" /></svg>
);

/* ─── small presentational helpers ──────────────────────────────────── */
// each rail item swaps the main panel view; "interop" opens the drawer
const NAV = [
  { id: "map", label: "Corridor", Icon: IMap },
  { id: "evidence", label: "Evidence", Icon: IEye },
  { id: "audit", label: "Audit trail", Icon: IPlay },
  { id: "interop", label: "Interop", Icon: IShare },
];

const ROLES: { id: Role; label: string }[] = [
  { id: "citizen", label: "Citizen" },
  { id: "analyst", label: "Analyst" },
  { id: "authority", label: "Authority" },
];

const evidenceTint: Record<string, { bg: string; ink: string; tag: string }> = {
  sensor: { bg: "bg-lime", ink: "text-grape-900", tag: "Sensor spike" },
  firms: { bg: "bg-grape-100", ink: "text-grape-900", tag: "FIRMS flag" },
  wind: { bg: "bg-grape-100", ink: "text-grape-900", tag: "Wind" },
  baseline: { bg: "bg-grape-50", ink: "text-grape-700", tag: "Baseline" },
  citizen_photo: { bg: "bg-grape-200", ink: "text-grape-900", tag: "Citizen · photo" },
  citizen_voice: { bg: "bg-grape-200", ink: "text-grape-900", tag: "Citizen · voice" },
};

/* equirectangular offset — good enough at this scale. Returns [lat, lng]. */
function destPoint(
  lat: number,
  lng: number,
  bearingDeg: number,
  km: number,
): [number, number] {
  const b = (bearingDeg * Math.PI) / 180;
  return [
    lat + (km * Math.cos(b)) / 110.57,
    lng + (km * Math.sin(b)) / (111.32 * Math.cos((lat * Math.PI) / 180)),
  ];
}

export default function App() {
  const [role, setRole] = useState<Role>("analyst");
  const [hour, setHour] = useState(2);
  const [ackedIds, setAckedIds] = useState<Set<string>>(new Set());
  const [verifyNotes, setVerifyNotes] = useState<string[]>([]);
  const [showInterop, setShowInterop] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [view, setView] = useState("map");
  const [toast, setToast] = useState<string | null>(null);

  const canReplay = role === "analyst" || role === "authority";
  const canAck = role === "authority";
  const canInterop = role === "analyst" || role === "authority";
  const canSubmit = role === "citizen";

  // build event + apply §6 authority overlay
  const event: AirEvent = useMemo(() => {
    const ev = buildReplayEvent(hour);
    ev.playbook = ev.playbook.map((p) =>
      ackedIds.has(p.id) ? { ...p, status: "acked" } : p,
    );
    if (verifyNotes.length) {
      ev.audit = [
        ...ev.audit,
        ...verifyNotes.map((n) => ({
          at: new Date().toISOString(),
          actor: "authority",
          action: n,
        })),
      ];
      ev.status = "verified";
    } else if (ackedIds.size) {
      ev.status = "acked";
    }
    return ev;
  }, [hour, ackedIds, verifyNotes]);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  };

  // citizens only see the public corridor view; ops roles get every panel
  const allowedViews = canSubmit ? ["map"] : ["map", "evidence", "audit", "interop"];
  const effectiveView = allowedViews.includes(view) ? view : "map";

  // icon-rail navigation: swap the main panel view (Interop opens the drawer)
  const handleNav = (id: string) => {
    if (id === "interop") {
      if (canInterop) setShowInterop(true);
      else flash("Interop JSON is available to Analyst & Authority");
      return;
    }
    if (!allowedViews.includes(id)) {
      flash("Detailed panels are available to Analyst & Authority");
      return;
    }
    setView(id);
  };

  // notifications = high-risk downwind districts + audit trail
  const notifications = [
    ...event.downwind
      .filter((z) => z.risk === "high")
      .map((z) => ({
        tone: "danger" as const,
        text: `${districtById(z.districtId)?.name ?? z.districtId} — high risk, ETA ${z.etaHours}h`,
      })),
    ...event.audit.map((a) => ({
      tone: "muted" as const,
      text: `${a.actor}: ${a.action}`,
    })),
  ];

  const toggleAck = (id: string) => {
    if (!canAck) return;
    setAckedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const addVerify = () => {
    if (!canAck) return;
    setVerifyNotes((p) => [
      ...p,
      "Field team confirmed haze; no local stack found.",
    ]);
    flash("Verify note added · event verified");
  };

  const primaryCta = canSubmit
    ? { label: "Submit report", onClick: () => flash(`Report received · ${event.id}`) }
    : canInterop
      ? { label: "Export interop JSON", onClick: () => setShowInterop(true) }
      : { label: "Acknowledge event", onClick: () => flash("Acknowledged") };

  const peak = 341;

  return (
    <div className="flex h-full w-full overflow-hidden bg-canvas font-sans text-ink">
      <IconRail
        active={effectiveView}
        onNav={handleNav}
        interopEnabled={canInterop}
        allowed={allowedViews}
      />

      <main className="flex-1 overflow-y-auto px-5 py-5 lg:px-8 lg:py-7">
        {/* header */}
        <header className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-grape-900 text-lime">
              <IWind className="h-6 w-6" />
            </span>
            <div className="leading-tight">
              <div className="font-display text-lg font-bold tracking-tight">
                AirCorridor
              </div>
              <div className="text-xs text-ink-soft">Pollution-event OS</div>
            </div>
          </div>

          {/* role segmented control (was Daily/Weekly/Monthly) */}
          <div className="mx-auto flex items-center gap-1 rounded-full bg-white/70 p-1 shadow-sm ring-1 ring-grape-200/60">
            {ROLES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRole(r.id)}
                className={`rounded-full px-5 py-2 text-sm font-medium transition ${
                  role === r.id
                    ? "bg-grape-900 text-white shadow"
                    : "text-ink-soft hover:text-ink"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-3">
            <span className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-grape-700 shadow-sm ring-1 ring-grape-200/60">
              <span className="h-2 w-2 animate-pulse rounded-full bg-warn" />
              REPLAY · NOT LIVE
            </span>
            <div className="relative">
              <button
                onClick={() => setShowNotif((v) => !v)}
                aria-label="Notifications"
                className={`relative grid h-11 w-11 place-items-center rounded-full shadow-sm ring-1 ring-grape-200/60 transition ${
                  showNotif ? "bg-grape-900 text-lime" : "bg-white text-ink-soft hover:text-ink"
                }`}
              >
                <IBell className="h-5 w-5" />
                {notifications.length > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 grid h-4 w-4 place-items-center rounded-full bg-danger text-[9px] font-bold text-white">
                    {notifications.length}
                  </span>
                )}
              </button>
              {showNotif && (
                <NotifPanel
                  items={notifications}
                  onClose={() => setShowNotif(false)}
                />
              )}
            </div>
          </div>
        </header>

        {/* title + inline stats */}
        <section className="mt-7 flex flex-wrap items-end gap-x-10 gap-y-5">
          <div className="min-w-[16rem]">
            <div className="mb-1 font-mono text-xs uppercase tracking-widest text-grape-500">
              {event.id} · Corridor {event.corridorId}
            </div>
            <h1 className="font-display text-4xl font-extrabold leading-none tracking-tight lg:text-5xl">
              {CATEGORY_LABEL[event.hypotheses[0].category]}
            </h1>
            <p className="mt-2 max-w-md text-sm text-ink-soft">{REPLAY_LABEL}</p>
            <p className="mt-2 text-xs font-medium text-grape-500">
              Signed in as <span className="capitalize text-grape-700">{role}</span> ·{" "}
              {canSubmit
                ? "can submit citizen reports"
                : canAck
                  ? "can step replay, acknowledge & verify"
                  : "can step replay & export interop"}
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-x-9 gap-y-3">
            <Stat label="Severity" value={event.severity} accent />
            <Stat label="Peak PM2.5" value={`${peak}`} unit="µg/m³" />
            <Stat label="Wind transport" value={WIND.label} unit={`${WIND.speedKmh} km/h`} />
            <button
              onClick={primaryCta.onClick}
              className="flex items-center gap-2 rounded-full bg-grape-900 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-grape-900/20 transition hover:bg-grape-700"
            >
              <IPlus className="h-4 w-4" /> {primaryCta.label}
            </button>
          </div>
        </section>

        {/* main grid */}
        <div className="mt-7 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,340px)_1fr]">
          {/* left column — contents depend on role */}
          <div className="flex flex-col gap-5">
            {role === "citizen" && (
              <>
                <PublicAlert event={event} />
                <ReportForm
                  onSubmit={() => flash(`Report received · ${event.id}`)}
                />
              </>
            )}
            {role === "analyst" && (
              <>
                <ReplayCard hour={hour} setHour={setHour} enabled status={event.status} />
                <HypothesesCard event={event} />
                <DownwindCard event={event} />
              </>
            )}
            {role === "authority" && (
              <>
                <ReplayCard hour={hour} setHour={setHour} enabled status={event.status} />
                <PlaybookCard
                  items={event.playbook}
                  canAck
                  ackedIds={ackedIds}
                  toggleAck={toggleAck}
                  onVerify={addVerify}
                  verifyCount={verifyNotes.length}
                />
                <DownwindCard event={event} />
              </>
            )}
          </div>

          {/* main panel — switched by the icon rail */}
          <div className="flex flex-col gap-5">
            {effectiveView === "map" && <CorridorMap event={event} />}
            {effectiveView === "evidence" && (
              <EvidenceTimeline evidence={event.evidence} />
            )}
            {effectiveView === "audit" && <AuditPanel event={event} />}
          </div>
        </div>

        <footer className="mt-6 flex flex-wrap items-center gap-3 text-xs text-ink-soft">
          <span className="rounded-full bg-white/60 px-3 py-1 ring-1 ring-grape-200/50">
            FIRMS = possible ~1 km fire flag, not a confirmed fire
          </span>
          <span className="rounded-full bg-white/60 px-3 py-1 ring-1 ring-grape-200/50">
            Downwind = indicative wind advection, not a chemistry model
          </span>
        </footer>
      </main>

      {showInterop && (
        <InteropDrawer event={event} onClose={() => setShowInterop(false)} />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-grape-900 px-5 py-3 text-sm font-medium text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}

/* ─── Icon rail ─────────────────────────────────────────────────────── */
function IconRail({
  active,
  onNav,
  interopEnabled,
  allowed,
}: {
  active: string;
  onNav: (id: string) => void;
  interopEnabled: boolean;
  allowed: string[];
}) {
  return (
    <aside className="hidden shrink-0 flex-col items-center py-6 sm:flex">
      <nav className="flex flex-col items-center gap-2 rounded-full bg-white/70 p-2 shadow-sm ring-1 ring-grape-200/50">
        {NAV.map(({ id, label, Icon }) => {
          const disabled =
            id === "interop" ? !interopEnabled : !allowed.includes(id);
          return (
            <button
              key={id}
              title={disabled ? `${label} (Analyst / Authority)` : label}
              onClick={() => onNav(id)}
              className={`grid h-11 w-11 place-items-center rounded-full transition ${
                active === id
                  ? "bg-grape-900 text-lime"
                  : disabled
                    ? "text-grape-200"
                    : "text-ink-soft hover:bg-grape-100 hover:text-grape-700"
              }`}
            >
              <Icon className="h-5 w-5" />
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

/* ─── Notifications panel ───────────────────────────────────────────── */
function NotifPanel({
  items,
  onClose,
}: {
  items: { tone: "danger" | "muted"; text: string }[];
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute right-0 top-full z-40 mt-2 w-80 rounded-2xl bg-surface p-3 shadow-2xl ring-1 ring-grape-200/60">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="font-display text-sm font-semibold">Notifications</span>
          <span className="text-xs text-ink-soft">{items.length}</span>
        </div>
        <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
          {items.map((n, i) => (
            <li
              key={i}
              className="flex gap-2 rounded-xl bg-grape-50 px-3 py-2 text-xs leading-snug"
            >
              <span
                className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                  n.tone === "danger" ? "bg-danger" : "bg-grape-400"
                }`}
              />
              <span className={n.tone === "danger" ? "font-medium text-ink" : "text-ink-soft"}>
                {n.text}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

/* ─── Stat callout ──────────────────────────────────────────────────── */
function Stat({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="text-xs font-medium text-ink-soft">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span
          className={`font-display text-2xl font-bold capitalize leading-none ${
            accent ? "text-danger" : "text-ink"
          }`}
        >
          {value}
        </span>
        {unit && <span className="text-xs font-medium text-ink-soft">{unit}</span>}
      </div>
    </div>
  );
}

/* ─── Replay hour card (the mini-calendar analogue) ─────────────────── */
function ReplayCard({
  hour,
  setHour,
  enabled,
  status,
}: {
  hour: number;
  setHour: (h: number) => void;
  enabled: boolean;
  status: string;
}) {
  const hours = [0, 1, 2, 3];
  return (
    <div className="rounded-3xl bg-grape-500 p-5 text-white shadow-lg shadow-grape-500/25">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-display text-base font-semibold">Replay timeline</div>
          <div className="text-xs text-white/70">5 Nov 2023 · from 20:10 IST</div>
        </div>
        <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide">
          {status}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2">
        {hours.map((h) => {
          const on = h === hour;
          return (
            <button
              key={h}
              disabled={!enabled}
              onClick={() => enabled && setHour(h)}
              className={`flex flex-col items-center rounded-2xl py-3 transition ${
                on
                  ? "bg-lime text-grape-900"
                  : enabled
                    ? "bg-white/10 hover:bg-white/20"
                    : "bg-white/5 opacity-40"
              }`}
            >
              <span className="text-[11px] uppercase tracking-wide opacity-75">
                T0
              </span>
              <span className="font-display text-xl font-bold leading-none">
                +{h}
              </span>
              <span className="text-[10px] opacity-75">
                {String(20 + h).padStart(2, "0")}:10
              </span>
            </button>
          );
        })}
      </div>
      {!enabled && (
        <p className="mt-3 text-xs text-white/70">
          Replay stepping is available to Analyst & Authority.
        </p>
      )}
    </div>
  );
}

/* ─── Playbook card (checklist analogue) ────────────────────────────── */
function PlaybookCard({
  items,
  canAck,
  ackedIds,
  toggleAck,
  onVerify,
  verifyCount,
}: {
  items: PlaybookItem[];
  canAck: boolean;
  ackedIds: Set<string>;
  toggleAck: (id: string) => void;
  onVerify: () => void;
  verifyCount: number;
}) {
  return (
    <div className="rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-grape-200/50">
      <div className="flex items-center justify-between">
        <div className="font-display text-base font-semibold">Playbook</div>
        <span className="text-xs text-ink-soft">
          {ackedIds.size}/{items.length} acked
        </span>
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {items.map((p) => {
          const acked = p.status === "acked";
          return (
            <li
              key={p.id}
              className={`flex gap-3 rounded-2xl p-3 transition ${
                acked ? "bg-lime/40" : "bg-grape-50"
              }`}
            >
              <button
                onClick={() => toggleAck(p.id)}
                disabled={!canAck}
                aria-label={acked ? "Acknowledged" : "Acknowledge"}
                className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border transition ${
                  acked
                    ? "border-lime-deep bg-lime-deep text-grape-900"
                    : canAck
                      ? "border-grape-300 hover:border-grape-500"
                      : "border-grape-200"
                }`}
              >
                {acked && (
                  <svg viewBox="0 0 24 24" className="h-3 w-3" {...stroke}>
                    <path d="M5 12l4 4 10-10" />
                  </svg>
                )}
              </button>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-grape-700">
                  {p.department}
                </div>
                <div className="text-sm leading-snug">{p.action}</div>
              </div>
            </li>
          );
        })}
      </ul>

      {canAck ? (
        <button
          onClick={onVerify}
          className="mt-3 w-full rounded-2xl border border-dashed border-grape-300 py-2.5 text-sm font-medium text-grape-700 transition hover:bg-grape-50"
        >
          + Add verify note{verifyCount ? ` (${verifyCount})` : ""}
        </button>
      ) : (
        <p className="mt-3 text-xs text-ink-soft">
          Only Authority can acknowledge or verify.
        </p>
      )}
    </div>
  );
}

/* ─── Downwind card ─────────────────────────────────────────────────── */
function DownwindCard({ event }: { event: AirEvent }) {
  return (
    <div className="rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-grape-200/50">
      <div className="flex items-center justify-between">
        <div className="font-display text-base font-semibold">Downwind next</div>
        <span className="text-xs text-ink-soft">{event.downwind.length} districts</span>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {event.downwind.map((z) => {
          const d = districtById(z.districtId);
          const high = z.risk === "high";
          return (
            <li
              key={z.districtId}
              className="flex items-center justify-between rounded-2xl bg-grape-50 px-4 py-2.5"
            >
              <div>
                <div className="text-sm font-semibold">{d?.name ?? z.districtId}</div>
                <div className="text-xs text-ink-soft capitalize">{d?.state}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-ink-soft">
                  ETA {z.etaHours}h
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    high ? "bg-danger/15 text-danger" : "bg-warn/15 text-warn"
                  }`}
                >
                  {z.risk}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ─── Corridor map (SVG advection view) ─────────────────────────────── */
// numbered pin as a leaflet divIcon
function numberIcon(n: number, high: boolean) {
  return L.divIcon({
    className: "",
    html: `<span style="display:grid;place-items:center;width:20px;height:20px;border-radius:9999px;background:${high ? "#e5484d" : "#f0a020"};color:#fff;font:700 10px/1 Inter,sans-serif;box-shadow:0 0 0 3px ${high ? "rgba(229,72,77,.25)" : "rgba(240,160,32,.25)"}">${n}</span>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

function fireIcon() {
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:10px solid #f0a020;filter:drop-shadow(0 0 4px rgba(240,160,32,.7))"></span>`,
    iconSize: [12, 10],
    iconAnchor: [6, 8],
  });
}

function CorridorMap({ event }: { event: AirEvent }) {
  const origin: [number, number] = [30.25, 75.84]; // Sangrur belt
  const downIds = new Set(event.downwind.map((z) => z.districtId));

  const reach = WIND.speedKmh * 3 + 40;
  const cone: [number, number][] = [
    origin,
    destPoint(origin[0], origin[1], WIND.transportDeg - 16, reach),
    destPoint(origin[0], origin[1], WIND.transportDeg + 16, reach),
  ];
  const centreline: [number, number][] = [
    origin,
    destPoint(origin[0], origin[1], WIND.transportDeg, reach),
  ];
  const hourMarks = [1, 2, 3].map((h) => ({
    h,
    pos: destPoint(origin[0], origin[1], WIND.transportDeg, WIND.speedKmh * h),
  }));

  const bounds = L.latLngBounds(
    [BBOX.minLat, BBOX.minLng],
    [BBOX.maxLat, BBOX.maxLng],
  );

  return (
    <div className="relative overflow-hidden rounded-3xl bg-[#161233] p-5 text-white shadow-lg ring-1 ring-white/5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="font-display text-base font-semibold">Corridor advection</div>
          <div className="text-xs text-white/55">
            Origin {event.origin.label} · transport {WIND.label} @ {WIND.speedKmh} km/h
          </div>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] text-white/70">
          Indicative advection · not a chemistry model
        </span>
      </div>

      <div className="relative">
        <MapContainer
          bounds={bounds}
          scrollWheelZoom={false}
          zoomControl={false}
          attributionControl={false}
          style={{ height: 400, width: "100%", background: "#161233" }}
          className="overflow-hidden rounded-2xl"
        >
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />

          {/* advection cone + centreline */}
          <Polygon
            positions={cone}
            pathOptions={{ color: "#cdf564", weight: 0, fillColor: "#cdf564", fillOpacity: 0.18 }}
          />
          <Polyline
            positions={centreline}
            pathOptions={{ color: "#cdf564", weight: 1.5, opacity: 0.6, dashArray: "5 5" }}
          />
          {hourMarks.map((m) => (
            <CircleMarker
              key={m.h}
              center={m.pos}
              radius={3}
              pathOptions={{ color: "#cdf564", fillColor: "#cdf564", fillOpacity: 0.9, weight: 0 }}
            >
              <Tooltip permanent direction="top" offset={[0, -4]} className="ac-tip">
                T+{m.h}h
              </Tooltip>
            </CircleMarker>
          ))}

          {/* monitoring stations */}
          {STATIONS.map((s) => (
            <CircleMarker
              key={s.id}
              center={[s.center.lat, s.center.lng]}
              radius={4}
              pathOptions={{ color: "#9a8ae0", weight: 1.5, fillOpacity: 0 }}
            >
              <Tooltip direction="top">{s.name} · PM2.5 station</Tooltip>
            </CircleMarker>
          ))}

          {/* other districts (faint) */}
          {DISTRICTS.filter((d) => !downIds.has(d.id)).map((d) => (
            <CircleMarker
              key={d.id}
              center={[d.center.lat, d.center.lng]}
              radius={2.5}
              pathOptions={{ color: "#fff", fillColor: "#fff", fillOpacity: 0.35, weight: 0 }}
            >
              <Tooltip direction="top">{d.name}</Tooltip>
            </CircleMarker>
          ))}

          {/* FIRMS fire flags */}
          {FIRES.map((f) => (
            <Marker key={f.id} position={[f.center.lat, f.center.lng]} icon={fireIcon()}>
              <Tooltip direction="top">
                FIRMS flag · FRP {f.frp} · conf {f.conf} · {f.at}
              </Tooltip>
            </Marker>
          ))}

          {/* downwind districts, numbered */}
          {event.downwind.map((z, i) => {
            const d = districtById(z.districtId);
            if (!d) return null;
            return (
              <Marker
                key={z.districtId}
                position={[d.center.lat, d.center.lng]}
                icon={numberIcon(i + 1, z.risk === "high")}
              >
                <Tooltip direction="top">
                  {d.name} · {z.risk} · ETA {z.etaHours}h
                </Tooltip>
              </Marker>
            );
          })}

          {/* origin */}
          <CircleMarker
            center={origin}
            radius={7}
            pathOptions={{ color: "#fff", weight: 1.5, fillColor: "#e5484d", fillOpacity: 1 }}
          >
            <Tooltip permanent direction="right" offset={[8, 0]} className="ac-tip">
              Origin belt
            </Tooltip>
          </CircleMarker>
        </MapContainer>

        {/* downwind inset — keyed to numbered markers, so no label collisions */}
        <div className="pointer-events-none absolute right-3 top-3 z-[1000] w-44 rounded-2xl bg-black/45 p-3 text-[11px] backdrop-blur-sm ring-1 ring-white/10">
          <div className="mb-1.5 font-semibold text-white/80">Downwind next</div>
          <ul className="flex flex-col gap-1">
            {event.downwind.map((z, i) => {
              const d = districtById(z.districtId);
              const high = z.risk === "high";
              return (
                <li key={z.districtId} className="flex items-center gap-2">
                  <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full text-[8px] font-bold text-white ${high ? "bg-danger" : "bg-warn"}`}>{i + 1}</span>
                  <span className="flex-1 truncate text-white/85">{d?.name ?? z.districtId}</span>
                  <span className="font-mono text-white/50">{z.etaHours}h</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-white/60">
        <LegendDot node={<span className="h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-white/40" />} label="Likely origin" />
        <LegendDot node={<span className="h-0 w-0 border-x-4 border-b-[7px] border-x-transparent" style={{ borderBottomColor: "#f0a020" }} />} label="FIRMS fire flag" />
        <LegendDot node={<span className="h-2.5 w-2.5 rounded-full bg-danger" />} label="High-risk downwind" />
        <LegendDot node={<span className="h-2.5 w-2.5 rounded-full bg-warn" />} label="Elevated downwind" />
        <LegendDot node={<span className="h-2.5 w-2.5 rounded-full border border-grape-400" />} label="Monitoring station" />
        <span className="ml-auto text-white/35">© OpenStreetMap · CARTO</span>
      </div>
    </div>
  );
}

function LegendDot({ node, label }: { node: ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      {node}
      {label}
    </span>
  );
}

/* ─── Evidence timeline (the event-block grid analogue) ─────────────── */
function EvidenceTimeline({ evidence }: { evidence: Evidence[] }) {
  return (
    <div className="rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-grape-200/50">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-display text-base font-semibold">Evidence timeline</div>
        <span className="text-xs text-ink-soft">{evidence.length} items</span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {evidence.map((e) => {
          const t = evidenceTint[e.kind] ?? evidenceTint.baseline;
          const isCitizen =
            e.kind === "citizen_photo" || e.kind === "citizen_voice";
          return (
            <div
              key={e.id}
              className={`flex flex-col gap-2 rounded-2xl p-4 ${t.bg} ${t.ink}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
                  {t.tag}
                </span>
                <span className="font-mono text-[11px] opacity-70">{e.at}</span>
              </div>
              <p className="text-sm font-medium leading-snug">{e.summary}</p>
              <div className="mt-auto flex items-center justify-between pt-1">
                <span className="text-[11px] opacity-70">{e.source}</span>
                {isCitizen && (
                  <span className="flex -space-x-1.5">
                    {[0, 1].map((i) => (
                      <span
                        key={i}
                        className="grid h-5 w-5 place-items-center rounded-full bg-grape-700 text-[9px] font-bold text-white ring-2 ring-white"
                      >
                        {String.fromCharCode(65 + i)}
                      </span>
                    ))}
                  </span>
                )}
                {e.value && (
                  <span className="font-mono text-xs font-semibold">
                    {e.value} {e.unit}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Public alert (Citizen) ────────────────────────────────────────── */
function PublicAlert({ event }: { event: AirEvent }) {
  const next = event.downwind[0]
    ? districtById(event.downwind[0].districtId)?.name
    : null;
  return (
    <div className="rounded-3xl bg-grape-900 p-5 text-white shadow-lg">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-danger px-3 py-1 text-[11px] font-bold uppercase tracking-wide">
          {event.severity} air alert
        </span>
        <span className="text-xs text-white/60">Replay · not live</span>
      </div>
      <p className="mt-3 text-sm leading-relaxed">{event.gemini.alertEn}</p>
      <p className="mt-2 text-sm leading-relaxed text-white/70">
        {event.gemini.alertHi}
      </p>
      {next && (
        <div className="mt-4 rounded-2xl bg-white/10 px-4 py-3 text-sm">
          Worsening air expected next in{" "}
          <span className="font-semibold text-lime">{next}</span> · ETA{" "}
          {event.downwind[0].etaHours}h
        </div>
      )}
    </div>
  );
}

/* ─── Citizen report form ───────────────────────────────────────────── */
function ReportForm({ onSubmit }: { onSubmit: () => void }) {
  const [text, setText] = useState("");
  const [loc, setLoc] = useState("Auto · West Delhi");
  const [attached, setAttached] = useState<string[]>([]);

  const toggle = (k: string) =>
    setAttached((a) => (a.includes(k) ? a.filter((x) => x !== k) : [...a, k]));

  const submit = () => {
    onSubmit();
    setText("");
    setAttached([]);
  };

  return (
    <div className="rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-grape-200/50">
      <div className="font-display text-base font-semibold">Report what you see</div>
      <p className="mt-0.5 text-xs text-ink-soft">
        Your identity is stripped before sharing.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="e.g. Bahut dhuan hai, aankhein jalan…"
        className="mt-3 w-full resize-none rounded-2xl bg-grape-50 px-4 py-3 text-sm outline-none ring-1 ring-transparent focus:ring-grape-300"
      />

      <input
        value={loc}
        onChange={(e) => setLoc(e.target.value)}
        className="mt-2 w-full rounded-2xl bg-grape-50 px-4 py-2.5 text-sm outline-none ring-1 ring-transparent focus:ring-grape-300"
      />

      <div className="mt-2 flex gap-2">
        {[
          { k: "photo", label: "📷 Photo" },
          { k: "voice", label: "🎙 Voice" },
        ].map((o) => (
          <button
            key={o.k}
            onClick={() => toggle(o.k)}
            className={`flex-1 rounded-2xl py-2.5 text-sm font-medium transition ${
              attached.includes(o.k)
                ? "bg-lime text-grape-900"
                : "bg-grape-50 text-ink-soft hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      <button
        onClick={submit}
        disabled={!text.trim()}
        className="mt-3 w-full rounded-2xl bg-grape-900 py-3 text-sm font-semibold text-white transition hover:bg-grape-700 disabled:opacity-40"
      >
        Submit report
      </button>
    </div>
  );
}

/* ─── Hypotheses card (Analyst) ─────────────────────────────────────── */
function HypothesesCard({ event }: { event: AirEvent }) {
  const conf: Record<string, string> = {
    high: "bg-lime text-grape-900",
    medium: "bg-warn/20 text-warn",
    low: "bg-grape-100 text-grape-700",
  };
  return (
    <div className="rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-grape-200/50">
      <div className="flex items-center justify-between">
        <div className="font-display text-base font-semibold">Hypotheses</div>
        <span className="text-xs text-ink-soft">{event.origin.label}</span>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {event.hypotheses.map((h) => (
          <li key={h.category} className="rounded-2xl bg-grape-50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">
                #{h.rank} · {CATEGORY_LABEL[h.category]}
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${conf[h.confidence]}`}
              >
                {h.confidence}
              </span>
            </div>
            <div className="mt-1 text-xs text-ink-soft">
              {h.why.length} supporting ·{" "}
              {h.missing.length ? `${h.missing.length} missing` : "no gaps"}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─── Audit trail panel ─────────────────────────────────────────────── */
function AuditPanel({ event }: { event: AirEvent }) {
  return (
    <div className="rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-grape-200/50">
      <div className="mb-4 flex items-center justify-between">
        <div className="font-display text-base font-semibold">Audit trail</div>
        <span className="text-xs text-ink-soft">
          {event.audit.length} entries · status {event.status}
        </span>
      </div>
      <ol className="relative ml-2 border-l border-grape-200">
        {event.audit.map((a, i) => (
          <li key={i} className="mb-4 ml-4 last:mb-0">
            <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-grape-500" />
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-grape-100 px-2 py-0.5 text-[11px] font-semibold capitalize text-grape-700">
                {a.actor}
              </span>
              <span className="font-mono text-[11px] text-ink-soft">
                {new Date(a.at).toLocaleString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  day: "2-digit",
                  month: "short",
                })}
              </span>
            </div>
            <p className="mt-1 text-sm leading-snug">{a.action}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ─── Interop drawer ────────────────────────────────────────────────── */
function InteropDrawer({
  event,
  onClose,
}: {
  event: AirEvent;
  onClose: () => void;
}) {
  const payload = interopPayload(event);
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-grape-900/40 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-xl flex-col bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-grape-200/60 px-6 py-4">
          <div>
            <div className="font-display text-lg font-bold">Interop payload</div>
            <div className="text-xs text-ink-soft">
              Identity-stripped share JSON · {event.id}
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full bg-grape-50 text-ink-soft hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" {...stroke}>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="flex items-center gap-2 px-6 py-3">
          <button
            onClick={() =>
              navigator.clipboard?.writeText(JSON.stringify(payload, null, 2))
            }
            className="rounded-full bg-grape-900 px-4 py-2 text-xs font-semibold text-white hover:bg-grape-700"
          >
            Copy JSON
          </button>
          <span className="text-xs text-ink-soft">
            Citizen identities stripped · gemini / status / audit dropped
          </span>
        </div>
        <pre className="flex-1 overflow-auto bg-grape-900 px-6 py-4 font-mono text-xs leading-relaxed text-lime">
          {JSON.stringify(payload, null, 2)}
        </pre>
      </div>
    </div>
  );
}
