/** Seoul local day bounds as UTC RFC3339 strings: [00:00, next 00:00). */
export function seoulDayBoundsUtcIso(nowMs: number): { timeMin: string; timeMax: string } {
  const ymd = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(nowMs));
  const start = new Date(`${ymd}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}

export type GCalEventStart = { date?: string; dateTime?: string; timeZone?: string };
export type AgendaItem = { id: string; timeLabel: string; title: string };

type GCalEventForTitle = {
  summary?: string;
  location?: string;
  description?: string;
  source?: { title?: string };
};

export function timeLabelForEventStart(start: GCalEventStart | undefined): string {
  if (!start) return "";
  if (start.date) return "All day";
  if (start.dateTime) {
    const d = new Date(start.dateTime);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  }
  return "";
}

export function deriveEventTitle(ev: GCalEventForTitle): string {
  const summary = (ev.summary ?? "").trim();
  if (summary) return summary;

  const sourceTitle = (ev.source?.title ?? "").trim();
  if (sourceTitle) return sourceTitle;

  const location = (ev.location ?? "").trim();
  if (location) return location;

  const firstDescriptionLine =
    (ev.description ?? "")
      .split(/\r?\n/)
      .find((line) => line.trim())
      ?.trim() ?? "";
  if (firstDescriptionLine) {
    return firstDescriptionLine.length > 72
      ? `${firstDescriptionLine.slice(0, 69)}...`
      : firstDescriptionLine;
  }

  return "Private event title";
}

function startTimeMs(start: GCalEventStart | undefined): number {
  if (!start) return 0;
  if (start.date) return new Date(`${start.date}T00:00:00+09:00`).getTime();
  if (start.dateTime) return new Date(start.dateTime).getTime();
  return 0;
}

export function eventsToAgendaItems(
  items: (GCalEventForTitle & { id?: string; start?: GCalEventStart })[]
): AgendaItem[] {
  return [...items]
    .sort((a, b) => startTimeMs(a.start) - startTimeMs(b.start))
    .map((ev, index) => {
      const title = deriveEventTitle(ev);
      const timeLabel = timeLabelForEventStart(ev.start);
      return {
        id: ev.id ?? `${timeLabel}-${title}-${index}`,
        timeLabel: timeLabel || "-",
        title,
      };
    });
}
