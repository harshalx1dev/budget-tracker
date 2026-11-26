# budget tracker

A budget tracker and planner: quick-add and statement import (CSV or PDF), EMIs and recurring items, budgets, goals,
a forecast with safe-to-spend, a wishlist that works out what you can afford and when, savings and investments (SIPs as transfers, fixed deposits, an emergency fund, net worth), optional AI (bring your own
Gemini key), an MCP server for your own agent, offline quick-add and bill reminders. Built with Next.js 16, Drizzle,
Neon Postgres and Better Auth. The plan it was built from is in [PLAN.md](PLAN.md).

## Run it

```powershell
npm install
copy .env.example .env.local   # then fill it in, see below
npm run db:migrate
npm run dev
```

## Environment

| Variable | What it is |
| --- | --- |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Neon pooled string (app) and direct string (migrations) |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | Auth secret and the site's public URL (also shown as the MCP endpoint host) |
| `ENCRYPTION_KEY` | 32 random bytes, base64. Encrypts users' saved AI keys. Never change it once keys are saved |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional Google sign-in |
| `ADMIN_EMAILS` | Comma-separated addresses that are admins. Checked at every server start and at sign-up, so an admin can simply sign up. Admins get `/app/admin`: accounts and usage totals, never anyone's entries |
| `ADMIN_PASSWORD` | Optional. Creates the first admin address with this password at start-up and resets it when this value changes |
| `ADMIN_GEMINI_API_KEY` | Optional. A Gemini key admins use when they have not added their own (higher limits, counted separately) |
| `GEMINI_MODEL`, `GEMINI_BASIC_MODEL` | Optional model overrides for the AI features |
| `VAPID_*`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web-push keys for bill reminders (`npx web-push generate-vapid-keys`). Set `VAPID_SUBJECT` to a contact such as `mailto:you@your-domain` |
| `CRON_SECRET` | Protects `/api/cron/reminders`. The schedule is in `vercel.json` (daily, 09:00 India time) |

Generate a secret with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

## Checks

```powershell
npm test                  # unit tests: parsers, schedules, planner, affordability, grounding, tokens
npm run typecheck; npm run lint; npm run build
npm run check:capture     # service-level checks against the database; they only touch the
npm run check:commitments # dedicated test account (tester@budget.test) and refuse to run without it
npm run check:planner
npm run check:wishlist
npm run check:ai          # uses a fake generator, no Gemini key needed
npm run check:polish
npm run check:savings
npm run check:mcp         # needs a running server: npm run build; npm run start
npm run check:admin       # start the server with ADMIN_EMAILS=hook-admin@budget.test first
```

## Notes

- Money is stored as integer minor units with a currency code. Dates are India time until workspaces get their own timezone.
- Pages are slowest where the database is far away; keep the Neon project near your users.
- The service worker (installable app, offline quick-add, push) runs only in production builds.
