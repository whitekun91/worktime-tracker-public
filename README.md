# Worktime log

A small Next.js app for clock-in / clock-out. Data is stored in Postgres (e.g. Neon); a cron job can delete rows older than seven days.

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

## Tests

```bash
npm test
```

## Deploy notes

- `vercel.json` may define a cron schedule; adjust path and timing as needed.
- Without a database, local dev can use browser-only storage (see in-app copy).

## License

This repository is public; add a license or terms if you need them.
