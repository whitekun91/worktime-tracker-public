"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MS_4H,
  MS_8H,
  MS_BREAK_30,
  MS_HOUR,
  laborBreakDeductionMs,
  laborBreakDeductionLabelKo,
  netWorkingMsAfterLaborBreak,
} from "@/lib/labor-break";
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
    return parsed.filter(
      (p): p is Punch =>
        p &&
        typeof p === "object" &&
        "id" in p &&
        "type" in p &&
        "at" in p &&
        (p.type === "in" || p.type === "out")
    );
  } catch {
    return [];
  }
}

function saveLocalDevPunches(punches: Punch[]) {
  localStorage.setItem(LOCAL_PUNCHES_DEV_KEY, JSON.stringify(punches));
}

export type PunchType = "in" | "out";

export type Punch = {
  id: string;
  type: PunchType;
  at: string;
};

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

function formatKoreanDateTime(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(d);
}

/** 해당 인덱스의 퇴근에 대응하는 직전 출근 인덱스 */
function findPrevInIndex(punches: Punch[], outIndex: number): number | null {
  for (let j = outIndex - 1; j >= 0; j--) {
    if (punches[j].type === "in") return j;
  }
  return null;
}

/** 출근~퇴근 구간의 실근무 ms (휴게 차감 반영), 짝이 없으면 null */
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
  /** DB 없을 때 dev에서만 로컬 저장으로 출근/퇴근 테스트 */
  const [localDevPunch, setLocalDevPunch] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  /** 개발용: 출근 누적(ms)에 더해 휴게 구간을 바로 테스트 */
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
        setLoadError(data.error ?? "목록을 불러오지 못했습니다.");
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
      setLoadError("네트워크 오류로 목록을 불러오지 못했습니다.");
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

  /** 직전 퇴근까지 구간(마지막 출근~퇴근) 요약 — 퇴근 상태에서만 */
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

  /** 출근 시각 + 누적 4h30m / 9h 시점(실근무 4h / 8h, 앱의 휴게 차감 규칙과 동일) */
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
        setLoadError(data.error ?? "저장에 실패했습니다.");
        return;
      }
      if (data.punch) {
        setPunches((prev) => [...prev, data.punch!]);
      }
    } catch {
      setLoadError("네트워크 오류로 저장하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }, [configured, localDevPunch, pending, punches, punchesSaveReady]);

  const clearAll = useCallback(async () => {
    if (punches.length === 0 || !punchesSaveReady) return;
    if (typeof window !== "undefined" && !window.confirm("모든 기록을 지울까요?")) return;

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
        setLoadError(data.error ?? "삭제에 실패했습니다.");
        return;
      }
      setPunches([]);
    } catch {
      setLoadError("네트워크 오류로 삭제하지 못했습니다.");
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
          출퇴근 기록
        </h1>
        <div className="mt-2.5 space-y-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          <p>버튼을 누를 때마다 출근·퇴근이 번갈아 기록돼요.</p>
          <p>
            누적 근무가{" "}
            <span className="font-medium text-zinc-800 dark:text-zinc-200">
              4시간 이상 8시간 미만이면 30분, 8시간 이상이면 1시간
            </span>
            휴게를 실근무에서 빼서 보여 줘요.
          </p>
          <p>
            Neon에 저장돼요.{" "}
            <span className="font-medium text-zinc-800 dark:text-zinc-200">7일 지난 기록</span>은 자동으로
            지워져요.
          </p>
        </div>
        {!configured && hydrated && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-base leading-snug text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
            배포 환경에 Postgres 연결 문자열{" "}
            <code className="text-[0.8rem] sm:text-sm">DATABASE_URL</code>(또는 일부 호스팅의{" "}
            <code className="text-[0.8rem] sm:text-sm">POSTGRES_URL</code>)을 설정하면 DB 저장이 활성화됩니다. (Neon·Supabase
            등 호스트 대시보드의 환경 변수 메뉴에서 설정)
            {IS_DEV && (
              <>
                {" "}
                <span className="font-medium">
                  로컬 개발(<code className="text-[0.8rem] sm:text-sm">npm run dev</code>)에서는 DB 없이도 출근 버튼이
                  동작하며, 이 브라우저에만 기록이 저장됩니다.
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
            ? "불러오는 중…"
            : localDevPunch && !configured
              ? "로컬 테스트 (DB 없음)"
              : !configured
                ? "DB 미연결"
                : isWorking
                  ? "현재 근무 중"
                  : "퇴근 상태"}
        </p>

        <div className="flex w-full max-w-md flex-col items-center gap-2">
          <span className="text-sm font-medium tracking-wide text-zinc-500 dark:text-zinc-400">
            실근무 시간
          </span>
          {IS_DEV && isWorking && hydrated && punchesSaveReady && (
            <div className="w-full rounded-lg border border-dashed border-violet-400/80 bg-violet-50/90 px-3 py-2.5 dark:border-violet-600 dark:bg-violet-950/40">
              <label
                htmlFor="dev-add-minutes"
                className="mb-1.5 block text-left text-xs font-semibold leading-snug text-violet-900 dark:text-violet-200"
              >
                테스트: 누적에 더할 분 (실근무 타이머에 바로 반영)
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
                실제 경과 {formatMsAsHms(elapsedRawMs)}
                {devAddMinutes > 0 && (
                  <>
                    {" "}
                    + 가산 {devAddMinutes}분 → 계산 기준 {formatMsAsHms(elapsedForLaborMs)}
                  </>
                )}
              </p>
            </div>
          )}
          {IS_DEV && !isWorking && hydrated && punchesSaveReady && (
            <p className="w-full text-center text-xs leading-snug text-violet-700/90 dark:text-violet-400">
              출근하면 위에 &quot;더할 분&quot;으로 4h·8h 구간을 바로 테스트할 수 있습니다.
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
                  출근~퇴근 실제 경과{" "}
                  <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300">
                    {formatMsAsHms(lastClosedSegment.rawMs)}
                  </span>
                </p>
                <span className="font-mono text-[2rem] font-semibold tabular-nums tracking-tight sm:text-4xl">
                  {formatMsAsHms(lastClosedSegment.netMs)}
                </span>
                {lastClosedSegment.breakDeductionMs > 0 ? (
                  <p className="w-full text-center text-[11px] leading-snug text-zinc-500 dark:text-zinc-400 sm:text-sm">
                    휴게 차감 {laborBreakDeductionLabelKo(lastClosedSegment.breakDeductionMs)}
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
                출근 시각 기준 실제 누적{" "}
                <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300">
                  {formatMsAsHms(elapsedRawMs)}
                </span>
              </p>
              {(IS_DEV && devAddMinutes > 0) || breakDeductionMs > 0 ? (
                <p className="text-[11px] leading-snug sm:text-sm">
                  {IS_DEV && devAddMinutes > 0 && (
                    <>
                      가산 {devAddMinutes}분 반영 시 계산 누적{" "}
                      <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300">
                        {formatMsAsHms(elapsedForLaborMs)}
                      </span>
                    </>
                  )}
                  {IS_DEV && devAddMinutes > 0 && breakDeductionMs > 0 && (
                    <span className="mx-1 text-zinc-400 dark:text-zinc-500">·</span>
                  )}
                  {breakDeductionMs > 0 && (
                    <>휴게 차감 {laborBreakDeductionLabelKo(breakDeductionMs)}</>
                  )}
                </p>
              ) : null}
            </div>
          )}
          {!isWorking && hydrated && punchesSaveReady && (
            <p className="text-center text-xs leading-relaxed text-zinc-500 sm:text-sm dark:text-zinc-400">
              {lastClosedSegment
                ? "다시 출근하면 새 구간부터 이어집니다."
                : "출근하면 실근무 시간이 표시됩니다"}
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
          {isWorking ? "퇴근" : "출근"}
        </button>

      </div>

      <section className="flex min-h-0 flex-1 flex-col">
        <div className="mb-3 flex shrink-0 items-center justify-between">
          <h2 className="text-base font-medium text-zinc-700 dark:text-zinc-300">최근 기록</h2>
          <button
            type="button"
            onClick={() => void clearAll()}
            disabled={!hydrated || !punchesSaveReady || punches.length === 0 || pending}
            className="text-sm text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline disabled:opacity-40 dark:hover:text-zinc-200"
          >
            전체 삭제
          </button>
        </div>

        {isWorking &&
          clockInAt &&
          hydrated &&
          punchesSaveReady &&
          laborMilestoneWallMs && (
            <div className="mb-3 shrink-0 space-y-2 rounded-xl border border-emerald-200/90 bg-emerald-50/60 p-3 sm:p-3.5 dark:border-emerald-900/60 dark:bg-emerald-950/35">
              <p className="text-sm font-medium leading-snug text-emerald-900 dark:text-emerald-200">
                이번 출근 기준 예상 시각
              </p>
              <ul className="space-y-2 text-sm">
                <li className="rounded-lg bg-white/90 px-2.5 py-2 dark:bg-zinc-900/70">
                  <div className="text-zinc-600 dark:text-zinc-400">
                    실근무 4시간 (출근 시각 기준 누적 4시간 30분)
                  </div>
                  <div className="mt-0.5 font-mono text-base text-zinc-900 dark:text-zinc-100">
                    {formatKoreanDateTime(new Date(laborMilestoneWallMs.at4h30Raw).toISOString())}
                    {nowMs >= laborMilestoneWallMs.at4h30Raw ? (
                      <span className="ml-2 font-sans text-sm font-medium text-emerald-600 dark:text-emerald-400">
                        도달
                      </span>
                    ) : null}
                  </div>
                </li>
                <li className="rounded-lg bg-white/90 px-2.5 py-2 dark:bg-zinc-900/70">
                  <div className="text-zinc-600 dark:text-zinc-400">
                    실근무 8시간 (출근 시각 기준 누적 9시간)
                  </div>
                  <div className="mt-0.5 font-mono text-base text-zinc-900 dark:text-zinc-100">
                    {formatKoreanDateTime(new Date(laborMilestoneWallMs.at9hRaw).toISOString())}
                    {nowMs >= laborMilestoneWallMs.at9hRaw ? (
                      <span className="ml-2 font-sans text-sm font-medium text-emerald-600 dark:text-emerald-400">
                        도달
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
              <p className="text-base leading-relaxed text-zinc-500">기록을 불러오는 중입니다.</p>
            </div>
          ) : !punchesSaveReady ? (
            <div className="flex flex-1 items-start rounded-xl border border-zinc-200 bg-white px-3 py-3.5 dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-base leading-relaxed text-zinc-500">DB 연결 후 이 기기의 기록이 여기에 표시됩니다.</p>
            </div>
          ) : punches.length === 0 ? (
            <div className="flex flex-1 items-start rounded-xl border border-zinc-200 bg-white px-3 py-3.5 dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-base leading-relaxed text-zinc-500">아직 기록이 없습니다. 출근을 눌러 시작하세요.</p>
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
                      {p.type === "in" ? "출근" : "퇴근"}
                    </span>
                    <span className="truncate font-mono text-sm text-zinc-600 dark:text-zinc-400">
                      {formatKoreanDateTime(p.at)}
                    </span>
                  </div>
                  {outSecondLine ? (
                    <p className="w-full text-right text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
                      실근무{" "}
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
