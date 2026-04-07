import { NextResponse } from "next/server";
import {
  eventsToAgendaItems,
  seoulDayBoundsUtcIso,
  type AgendaItem,
} from "@/lib/google-calendar";

type GCalListResponse = {
  items?: { id?: string; summary?: string; start?: { date?: string; dateTime?: string } }[];
};

function friendlyError(status: number): string {
  if (status === 401 || status === 403) {
    return "Calendar access is denied. Check API key restrictions and calendar visibility.";
  }
  if (status === 404) {
    return "Calendar ID was not found.";
  }
  if (status >= 500) {
    return "Calendar provider is temporarily unavailable.";
  }
  return "Could not load today's calendar events.";
}

export async function GET() {
  const apiKey = process.env.GOOGLE_CALENDAR_API_KEY?.trim();
  const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim();
  if (!apiKey || !calendarId) {
    return NextResponse.json({
      configured: false as const,
      events: [] as AgendaItem[],
    });
  }

  const { timeMin, timeMax } = seoulDayBoundsUtcIso(Date.now());
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  const params = new URLSearchParams({
    key: apiKey,
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
  });

  try {
    const res = await fetch(`${base}?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({
        configured: true as const,
        events: [] as AgendaItem[],
        error: friendlyError(res.status),
      });
    }
    const data = (await res.json()) as GCalListResponse;
    const events = eventsToAgendaItems(Array.isArray(data.items) ? data.items : []);
    return NextResponse.json({ configured: true as const, events });
  } catch {
    return NextResponse.json({
      configured: true as const,
      events: [] as AgendaItem[],
      error: "Could not load today's calendar events.",
    });
  }
}
