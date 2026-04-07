# Worktime log

A small Next.js app for clock-in / clock-out. Data is stored in Postgres (e.g. Neon), old rows are cleaned by cron, and an optional "today's schedule" panel can read Google Calendar.

## Requirements

- Node.js 20.9 or newer

## Local run

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

## Environment variables (secrets)

**Do not commit real connection strings or API secrets.**

1. Copy `.env.example` to `.env.local` in the project root.
2. Set `DATABASE_URL` (or `POSTGRES_URL` on some hosts) to **your** database URL.
3. If you will call the cron endpoint manually, set `CRON_SECRET`.

On platforms like Vercel, add the same names under **Environment Variables** in the dashboard. Keep values out of public repos and screenshots.

### Optional private API integration (Google Calendar)

This repository is public, so no private keys or fixed calendar IDs are committed.

- `GOOGLE_CALENDAR_API_KEY`
- `GOOGLE_CALENDAR_ID`

Example in `.env.local`:

```bash
GOOGLE_CALENDAR_API_KEY=your_google_api_key
GOOGLE_CALENDAR_ID=your_calendar_id@group.calendar.google.com
```

When both are set, `/api/calendar/today` returns today's events and the UI shows them.  
When missing, the schedule panel stays disabled safely.

Recommended for public repos:

- Restrict key usage in Google Cloud (API scope, quota, and allowed APIs)
- Do not hardcode calendar IDs or tokens in source
- Rotate keys if they are ever exposed

## Tests

```bash
npm test
```

## Deploy notes

- `vercel.json` may define a cron schedule; adjust path and timing as needed.
- Without a database, local dev can use browser-only storage (see in-app copy).
- The calendar API route is server-side and only activates when both calendar env vars are present.

## License

This repository is public; add a license or terms if you need them.
