"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MS_4H,
  MS_8H,
  MS_BREAK_30,
  MS_HOUR,
  laborBreakDeductionMs,
  laborBreakDeductionLabel,
  netWorkingMsAfterLaborBreak,
} from "@/lib/labor-break";
import type { AgendaItem } from "@/lib/google-calendar";
import { isPunch, type Punch, type PunchType } from "@/lib/punches";
import { formatMsAsHms } from "@/lib/time-format";

const DEVICE_KEY = "worktime-device-id";
const LOCAL_PUNCHES_DEV_KEY = "worktime-punches-dev-local";

const IS_DEV = process.env.NODE_ENV === "development";

const DEV_ADD_MINUTES_KEY = "worktime-dev-add-minutes";

function loadLocalDevPunches(): Punch[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_PUNCHES_DEV_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPunch);
  } catch {
    return [];
  }
}

function saveLocalDevPunches(punches: Punch[]) {
  localStorage.setItem(LOCAL_PUNCHES_DEV_KEY, JSON.stringify(punches));
}

function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

function deviceHeaders(): HeadersInit {
  return { "x-device-id": getOrCreateDeviceId() };
}

function formatLocaleDateTime(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(d);
}

/** Index of the clock-in that pairs with the clock-out at `outIndex` */
function findPrevInIndex(punches: Punch[], outIndex: number): number | null {
  for (let j = outIndex - 1; j >= 0; j--) {
    if (punches[j].type === "in") return j;
  }
  return null;
}

/** Net working ms for in→out segment (break rules applied); null if unmatched */
function netWorkingMsForOutPunch(punches: Punch[], outIndex: number): number | null {
  const inIdx = findPrevInIndex(punches, outIndex);
  if (inIdx === null) return null;
  const start = new Date(punches[inIdx].at).getTime();
  const end = new Date(punches[outIndex].at).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  const raw = end - start;
  return netWorkingMsAfterLaborBreak(raw);
}

export default function WorktimeTracker() {
  const [punches, setPunches] = useState<Punch[]>([]);
  const [configured, setConfigured] = useState(true);
  /** Local-only punches in dev when DB is unavailable */
  const [localDevPunch, setLocalDevPunch] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [agendaConfigured, setAgendaConfigured] = useState(false);
  const [agendaError, setAgendaError] = useState<string | null>(null);
  /** Dev: add minutes to elapsed time to test break thresholds */
  const [devAddMinutes, setDevAddMinutes] = useState(0);

  const punchesSaveReady = configured || localDevPunch;

  useEffect(() => {
    if (!IS_DEV || typeof window === "undefined") return;
    try {
      const v = sessionStorage.getItem(DEV_ADD_MINUTES_KEY);
      if (v === null) return;
      const n = Number.parseInt(v, 10);
      if (Number.isFinite(n) && n >= 0) setDevAddMinutes(n);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!IS_DEV || typeof window === "undefined") return;
    try {
      sessionStorage.setItem(DEV_ADD_MINUTES_KEY, String(devAddMinutes));
    } catch {
      /* ignore */
    }
  }, [devAddMinutes]);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/punches", { headers: deviceHeaders() });
      const data = (await res.json()) as {
        configured?: boolean;
        punches?: Punch[];
        error?: string;
      };
      if (!res.ok) {
        setLoadError(data.error ?? "Could not load punches.");
        return;
      }
      const ok = data.configured !== false;
      setConfigured(ok);
      if (!ok && IS_DEV) {
        setLocalDevPunch(true);
        setPunches(loadLocalDevPunches());
      } else {
        setLocalDevPunch(false);
        setPunches(Array.isArray(data.punches) ? data.punches : []);
      }
    } catch {
      setLoadError("Network error while loading punches.");
    }
  }, []);

  useEffect(() => {
    void refresh().finally(() => setHydrated(true));
  }, [refresh]);

  const isWorking = useMemo(() => {
    const last = punches[punches.length - 1];
    return last?.type === "in";
  }, [punches]);

  const clockInAt = useMemo(() => {
    if (!isWorking) return null;
    const last = punches[punches.length - 1];
    if (!last || last.type !== "in") return null;
    return last.at;
  }, [isWorking, punches]);

  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!clockInAt) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [clockInAt]);

  const [agendaNowMs, setAgendaNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setAgendaNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const loadAgenda = useCallback(async () => {
    try {
      const res = await fetch("/api/calendar/today");
      const data = (await res.json()) as {
        configured?: boolean;
        events?: AgendaItem[];
        error?: string;
      };
      if (!res.ok) {
        setAgendaConfigured(false);
        setAgenda([]);
        setAgendaError("Could not load today's schedule.");
        return;
      }
      setAgendaConfigured(data.configured === true);
      setAgenda(Array.isArray(data.events) ? data.events : []);
      setAgendaError(data.error ?? null);
    } catch {
      setAgendaConfigured(false);
      setAgenda([]);
      setAgendaError("Could not load today's schedule.");
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void loadAgenda();
  }, [hydrated, agendaNowMs, loadAgenda]);

  const elapsedRawMs = useMemo(() => {
    if (!clockInAt) return 0;
    const start = new Date(clockInAt).getTime();
    return Math.max(0, nowMs - start);
  }, [clockInAt, nowMs]);

  const elapsedForLaborMs = useMemo(() => {
    if (!IS_DEV || !isWorking) return elapsedRawMs;
    return Math.max(0, elapsedRawMs + devAddMinutes * 60 * 1000);
  }, [elapsedRawMs, devAddMinutes, isWorking]);

  const breakDeductionMs = useMemo(
    () => laborBreakDeductionMs(elapsedForLaborMs),
    [elapsedForLaborMs]
  );

  const netWorkingMs = useMemo(
    () => netWorkingMsAfterLaborBreak(elapsedForLaborMs),
    [elapsedForLaborMs]
  );

  /** Last closed in→out segment summary (only when clocked out) */
  const lastClosedSegment = useMemo(() => {
    if (isWorking) return null;
    const last = punches[punches.length - 1];
    if (!last || last.type !== "out") return null;
    const inIdx = findPrevInIndex(punches, punches.length - 1);
    if (inIdx === null) return null;
    const start = new Date(punches[inIdx].at).getTime();
    const end = new Date(last.at).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
    const rawMs = end - start;
    const breakDeductionMs = laborBreakDeductionMs(rawMs);
    const netMs = netWorkingMsAfterLaborBreak(rawMs);
    return { rawMs, netMs, breakDeductionMs };
  }, [isWorking, punches]);

  /** Wall times for 4h30m / 9h raw elapsed (4h / 8h net under app rules) */
  const laborMilestoneWallMs = useMemo(() => {
    if (!clockInAt) return null;
    const start = new Date(clockInAt).getTime();
    if (Number.isNaN(start)) return null;
    return {
      at4h30Raw: start + MS_4H + MS_BREAK_30,
      at9hRaw: start + MS_8H + MS_HOUR,
    };
  }, [clockInAt]);

  const handlePunch = useCallback(async () => {
    if (pending || !punchesSaveReady) return;

    if (localDevPunch && !configured) {
      const last = punches[punches.length - 1];
      const working = last?.type === "in";
      const nextType: PunchType = working ? "out" : "in";
      const punch: Punch = {
        id: crypto.randomUUID(),
        type: nextType,
        at: new Date().toISOString(),
      };
      setPunches((prev) => {
        const next = [...prev, punch];
        saveLocalDevPunches(next);
        return next;
      });
      return;
    }

    setPending(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/punches", {
        method: "POST",
        headers: deviceHeaders(),
      });
      const data = (await res.json()) as { punch?: Punch; error?: string };
      if (!res.ok) {
        setLoadError(data.error ?? "Could not save punch.");
        return;
      }
      if (data.punch) {
        setPunches((prev) => [...prev, data.punch!]);
      }
    } catch {
      setLoadError("Network error while saving punch.");
    } finally {
      setPending(false);
    }
  }, [configured, localDevPunch, pending, punches, punchesSaveReady]);

  const clearAll = useCallback(async () => {
    if (punches.length === 0 || !punchesSaveReady) return;
    if (typeof window !== "undefined" && !window.confirm("Delete all punches for this device?")) return;

    if (localDevPunch && !configured) {
      saveLocalDevPunches([]);
      setPunches([]);
      return;
    }

    setPending(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/punches", {
        method: "DELETE",
        headers: deviceHeaders(),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setLoadError(data.error ?? "Could not delete punches.");
        return;
      }
      setPunches([]);
    } catch {
      setLoadError("Network error while deleting punches.");
    } finally {
      setPending(false);
    }
  }, [configured, localDevPunch, punches.length, punchesSaveReady]);

  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el || punches.length === 0) return;
    el.scrollTop = el.scrollHeight;
  }, [punches.length]);

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col gap-5 px-2.5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5 sm:gap-6 sm:px-3 sm:pt-7">
      <header className="shrink-0 text-center">
        <h1 className="text-[1.65rem] font-semibold leading-snug tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
          Worktime log
        </h1>
        <div className="mt-2.5 space-y-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          <p>Each tap alternates clock-in and clock-out.</p>
          <p>
            Cumulative time{" "}
            <span className="font-medium text-zinc-800 dark:text-zinc-200">
              from 4h to under 8h deducts 30m break; 8h+ deducts 1h
            </span>{" "}
            from displayed working time.
          </p>
          <p>
            Stored in Postgres (e.g. Neon).{" "}
            <span className="font-medium text-zinc-800 dark:text-zinc-200">Entries older than 7 days</span> can be
            removed by the cleanup job.
          </p>
        </div>
        {!configured && hydrated && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-base leading-snug text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
            Set a Postgres connection string in your deployment:{" "}
            <code className="text-[0.8rem] sm:text-sm">DATABASE_URL</code> (or{" "}
            <code className="text-[0.8rem] sm:text-sm">POSTGRES_URL</code> on some hosts) to enable database storage.
            Configure it in your host&apos;s environment variables (e.g. Neon, Supabase).
            {IS_DEV && (
              <>
                {" "}
                <span className="font-medium">
                  In local dev (<code className="text-[0.8rem] sm:text-sm">npm run dev</code>), clock-in works without a
                  DB; punches stay in this browser only.
                </span>
              </>
            )}
          </p>
        )}
        {loadError && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-base leading-snug text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {loadError}
          </p>
        )}
      </header>

      <div className="flex shrink-0 flex-col items-center gap-4 rounded-2xl border border-zinc-200 bg-zinc-50/80 px-4 py-6 sm:gap-5 sm:px-5 sm:py-7 dark:border-zinc-800 dark:bg-zinc-900/40">
        <p
          className={`text-xl font-medium sm:text-2xl ${
            isWorking ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-500 dark:text-zinc-400"
          }`}
        >
          {!hydrated
            ? "Loading…"
            : localDevPunch && !configured
              ? "Local test (no DB)"
              : !configured
                ? "Database not connected"
                : isWorking
                  ? "On the clock"
                  : "Clocked out"}
        </p>

        <div className="flex w-full max-w-md flex-col items-center gap-2">
          <span className="text-sm font-medium tracking-wide text-zinc-500 dark:text-zinc-400">
            Net working time
          </span>
          {IS_DEV && isWorking && hydrated && punchesSaveReady && (
            <div className="w-full rounded-lg border border-dashed border-violet-400/80 bg-violet-50/90 px-3 py-2.5 dark:border-violet-600 dark:bg-violet-950/40">
              <label
                htmlFor="dev-add-minutes"
                className="mb-1.5 block text-left text-xs font-semibold leading-snug text-violet-900 dark:text-violet-200"
              >
                Dev: minutes to add to elapsed (applies to net timer)
              </label>
              <input
                id="dev-add-minutes"
                type="number"
                min={0}
                max={99999}
                step={1}
                value={devAddMinutes}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10);
                  setDevAddMinutes(Number.isFinite(n) && n >= 0 ? n : 0);
                }}
                className="w-full rounded-md border border-violet-200 bg-white px-2.5 py-2 font-mono text-base text-zinc-900 dark:border-violet-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
              <p className="mt-1.5 text-left text-xs leading-snug text-violet-800 dark:text-violet-300">
                Actual elapsed {formatMsAsHms(elapsedRawMs)}
                {devAddMinutes > 0 && (
                  <>
                    {" "}
                    + {devAddMinutes}m → basis {formatMsAsHms(elapsedForLaborMs)}
                  </>
                )}
              </p>
            </div>
          )}
          {IS_DEV && !isWorking && hydrated && punchesSaveReady && (
            <p className="w-full text-center text-xs leading-snug text-violet-700/90 dark:text-violet-400">
              After clock-in, use &quot;minutes to add&quot; above to jump to 4h / 8h thresholds.
            </p>
          )}
          <div
            className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border px-3 py-3 sm:px-4 sm:py-3.5 ${
              isWorking && hydrated && punchesSaveReady
                ? "border-emerald-200 bg-emerald-50/90 text-emerald-900 shadow-sm dark:border-emerald-800/80 dark:bg-emerald-950/40 dark:text-emerald-100"
                : lastClosedSegment && hydrated && punchesSaveReady
                  ? "border-zinc-200 bg-white/80 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-100"
                  : "border-zinc-200 bg-white/60 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-500"
            }`}
            aria-live={isWorking ? "polite" : undefined}
          >
            {isWorking && hydrated && punchesSaveReady ? (
              <span className="flex items-center justify-center gap-2.5 font-mono text-[2rem] tabular-nums tracking-tight sm:text-4xl">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 dark:bg-emerald-300" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                </span>
                {formatMsAsHms(netWorkingMs)}
              </span>
            ) : lastClosedSegment && hydrated && punchesSaveReady ? (
              <>
                <p className="w-full text-center text-xs font-normal leading-snug text-zinc-500 dark:text-zinc-400 sm:text-sm">
                  In→out raw elapsed{" "}
                  <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300">
                    {formatMsAsHms(lastClosedSegment.rawMs)}
                  </span>
                </p>
                <span className="font-mono text-[2rem] font-semibold tabular-nums tracking-tight sm:text-4xl">
                  {formatMsAsHms(lastClosedSegment.netMs)}
                </span>
                {lastClosedSegment.breakDeductionMs > 0 ? (
                  <p className="w-full text-center text-[11px] leading-snug text-zinc-500 dark:text-zinc-400 sm:text-sm">
                    Break deduction {laborBreakDeductionLabel(lastClosedSegment.breakDeductionMs)}
                  </p>
                ) : null}
              </>
            ) : (
              <span className="font-mono text-[2rem] tabular-nums tracking-tight sm:text-4xl">
                00:00:00
              </span>
            )}
          </div>
          {isWorking && clockInAt && hydrated && punchesSaveReady && (
            <div className="flex w-full flex-col gap-1.5 text-center text-xs leading-snug text-zinc-500 sm:text-sm dark:text-zinc-400">
              <p>
                Raw elapsed since clock-in{" "}
                <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300">
                  {formatMsAsHms(elapsedRawMs)}
                </span>
              </p>
              {(IS_DEV && devAddMinutes > 0) || breakDeductionMs > 0 ? (
                <p className="text-[11px] leading-snug sm:text-sm">
                  {IS_DEV && devAddMinutes > 0 && (
                    <>
                      With +{devAddMinutes}m, basis elapsed{" "}
                      <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300">
                        {formatMsAsHms(elapsedForLaborMs)}
                      </span>
                    </>
                  )}
                  {IS_DEV && devAddMinutes > 0 && breakDeductionMs > 0 && (
                    <span className="mx-1 text-zinc-400 dark:text-zinc-500">·</span>
                  )}
                  {breakDeductionMs > 0 && (
                    <>Break deduction {laborBreakDeductionLabel(breakDeductionMs)}</>
                  )}
                </p>
              ) : null}
            </div>
          )}
          {!isWorking && hydrated && punchesSaveReady && (
            <p className="text-center text-xs leading-relaxed text-zinc-500 sm:text-sm dark:text-zinc-400">
              {lastClosedSegment
                ? "Clock in again to start a new segment."
                : "Clock in to show net working time."}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => void handlePunch()}
          disabled={!hydrated || !punchesSaveReady || pending}
          className={`h-40 w-40 rounded-full text-[1.95rem] font-semibold leading-none tracking-tight text-white shadow-lg transition hover:scale-[1.02] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 sm:h-44 sm:w-44 sm:text-[2.45rem] ${
            isWorking
              ? "bg-amber-500 hover:bg-amber-600"
              : "bg-emerald-600 hover:bg-emerald-700"
          }`}
        >
          {isWorking ? "Out" : "In"}
        </button>

      </div>

      <section className="flex min-h-0 flex-1 flex-col">
        <div className="mb-3 shrink-0 rounded-xl border border-sky-200/90 bg-sky-50/60 p-3 sm:p-3.5 dark:border-sky-900/60 dark:bg-sky-950/35">
          <p className="text-sm font-medium leading-snug text-sky-900 dark:text-sky-200">
            Today&apos;s schedule (optional)
          </p>
          {!hydrated ? (
            <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">Loading schedule…</p>
          ) : !agendaConfigured ? (
            <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
              Set <code>GOOGLE_CALENDAR_API_KEY</code> and <code>GOOGLE_CALENDAR_ID</code> to enable this section.
            </p>
          ) : agendaError ? (
            <p className="mt-1.5 text-sm text-amber-700 dark:text-amber-300">{agendaError}</p>
          ) : agenda.length === 0 ? (
            <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">No events today.</p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-sm">
              {agenda.map((item) => (
                <li key={item.id} className="rounded-md bg-white/80 px-2.5 py-1.5 dark:bg-zinc-900/70">
                  <span className="font-mono text-zinc-500 dark:text-zinc-400">{item.timeLabel}</span>
                  <span className="mx-2 text-zinc-400">·</span>
                  <span className="text-zinc-800 dark:text-zinc-100">{item.title}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mb-3 flex shrink-0 items-center justify-between">
          <h2 className="text-base font-medium text-zinc-700 dark:text-zinc-300">Recent punches</h2>
          <button
            type="button"
            onClick={() => void clearAll()}
            disabled={!hydrated || !punchesSaveReady || punches.length === 0 || pending}
            className="text-sm text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline disabled:opacity-40 dark:hover:text-zinc-200"
          >
            Clear all
          </button>
        </div>

        {isWorking &&
          clockInAt &&
          hydrated &&
          punchesSaveReady &&
          laborMilestoneWallMs && (
            <div className="mb-3 shrink-0 space-y-2 rounded-xl border border-emerald-200/90 bg-emerald-50/60 p-3 sm:p-3.5 dark:border-emerald-900/60 dark:bg-emerald-950/35">
              <p className="text-sm font-medium leading-snug text-emerald-900 dark:text-emerald-200">
                Estimated times (this clock-in)
              </p>
              <ul className="space-y-2 text-sm">
                <li className="rounded-lg bg-white/90 px-2.5 py-2 dark:bg-zinc-900/70">
                  <div className="text-zinc-600 dark:text-zinc-400">
                    4h net (4h 30m raw since clock-in)
                  </div>
                  <div className="mt-0.5 font-mono text-base text-zinc-900 dark:text-zinc-100">
                    {formatLocaleDateTime(new Date(laborMilestoneWallMs.at4h30Raw).toISOString())}
                    {nowMs >= laborMilestoneWallMs.at4h30Raw ? (
                      <span className="ml-2 font-sans text-sm font-medium text-emerald-600 dark:text-emerald-400">
                        reached
                      </span>
                    ) : null}
                  </div>
                </li>
                <li className="rounded-lg bg-white/90 px-2.5 py-2 dark:bg-zinc-900/70">
                  <div className="text-zinc-600 dark:text-zinc-400">
                    8h net (9h raw since clock-in)
                  </div>
                  <div className="mt-0.5 font-mono text-base text-zinc-900 dark:text-zinc-100">
                    {formatLocaleDateTime(new Date(laborMilestoneWallMs.at9hRaw).toISOString())}
                    {nowMs >= laborMilestoneWallMs.at9hRaw ? (
                      <span className="ml-2 font-sans text-sm font-medium text-emerald-600 dark:text-emerald-400">
                        reached
                      </span>
                    ) : null}
                  </div>
                </li>
              </ul>
            </div>
          )}

        <div className="flex min-h-0 flex-1 flex-col">
          {!hydrated ? (
            <div className="flex flex-1 items-start rounded-xl border border-zinc-200 bg-white px-3 py-3.5 dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-base leading-relaxed text-zinc-500">Loading punches…</p>
            </div>
          ) : !punchesSaveReady ? (
            <div className="flex flex-1 items-start rounded-xl border border-zinc-200 bg-white px-3 py-3.5 dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-base leading-relaxed text-zinc-500">
                After the database is connected, this device&apos;s punches appear here.
              </p>
            </div>
          ) : punches.length === 0 ? (
            <div className="flex flex-1 items-start rounded-xl border border-zinc-200 bg-white px-3 py-3.5 dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-base leading-relaxed text-zinc-500">No punches yet. Tap In to start.</p>
            </div>
          ) : (
            <ul
              ref={listRef}
              className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-xl border border-zinc-200 bg-white px-2.5 py-2.5 dark:border-zinc-800 dark:bg-zinc-950"
            >
            {punches.map((p, index) => {
              const netForOut =
                p.type === "out" ? netWorkingMsForOutPunch(punches, index) : null;
              const outSecondLine = p.type === "out" && netForOut != null;
              return (
                <li
                  key={p.id}
                  className={`rounded-lg bg-zinc-50 px-2.5 py-2.5 text-base sm:px-3 dark:bg-zinc-900 ${
                    outSecondLine
                      ? "flex flex-col items-stretch gap-1.5"
                      : "flex items-center justify-between gap-2 sm:gap-3"
                  }`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-sm font-medium ${
                        p.type === "in"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                      }`}
                    >
                      {p.type === "in" ? "In" : "Out"}
                    </span>
                    <span className="truncate font-mono text-sm text-zinc-600 dark:text-zinc-400">
                      {formatLocaleDateTime(p.at)}
                    </span>
                  </div>
                  {outSecondLine ? (
                    <p className="w-full text-right text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
                      Net{" "}
                      <span className="font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                        {formatMsAsHms(netForOut)}
                      </span>
                    </p>
                  ) : null}
                </li>
              );
            })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
