# Privy Finance

End-to-end Next.js 14 implementation of Privy Finance with:

- Supabase (auth + relational data + RLS)
- Nova encrypted document storage (`nova-sdk-js` adapter)
- NEAR AI Cloud TEE analysis pipeline
- Dual authentication (email/password + NEAR wallet signature)

## Stack

- Next.js 14 App Router + TypeScript
- Tailwind CSS + Radix UI primitives
- React Query state/data fetching
- Supabase (`@supabase/auth-helpers-nextjs`, `@supabase/supabase-js`)
- NEAR wallet selector + `near-api-js`
- `nova-sdk-js` (`NovaSdk` upload/retrieve API)

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Create local env file:

```bash
cp .env.example .env.local
```

3. Fill in real credentials in `.env.local`.

4. Run database schema in Supabase SQL editor:

- `db/schema.sql`
- If your project already exists, apply onboarding-only migration:
  - `db/migrations/20260216_onboarding_data.sql`

5. Start dev server:

```bash
npm run dev
```

## Validation

```bash
npm run typecheck
npm run lint
npm run build
```

## Project Structure

- `app/(auth)` login/signup flows
- `app/(dashboard)` authenticated dashboard + transactions + optimization + goals + settings
- `app/api/*` route handlers (wallet auth, uploads, processing, analysis, insights, financial)
- `contexts/AuthContext.tsx` dual auth context
- `lib/nova/*` Nova encrypted storage adapter and upload logic
- `lib/near-ai/*` NEAR AI client + JSON parsing helpers
- `lib/supabase/*` browser/server/admin clients
- `lib/utils/csv-parser.ts` statement parsing
- `db/schema.sql` full schema + RLS + triggers

## Notes

- NOVA requires a real account id (`NOVA_ACCOUNT_ID`, e.g. `alice.nova-sdk.near`) plus `NOVA_API_KEY`.
- Uploads are written to per-user NOVA groups using `NOVA_GROUP_PREFIX` + user id.
- New users are required to complete a modal onboarding flow and data is stored in `onboarding_data.data_of_user`.
- The current CSV parser supports `.csv` statements. XLS/XLSX/PDF are accepted by upload UI but parser currently throws unsupported format unless converted to CSV before processing.
- Document processing calls NEAR AI first; if unavailable, the API falls back to deterministic local analysis + insight generation so workflow still completes.
- Middleware applies API rate limiting in-memory by IP (stateless deployments should replace this with Redis/Upstash).

## Deployment

- Vercel config: `vercel.json`
- Docker: `Dockerfile` + `docker-compose.yml`
