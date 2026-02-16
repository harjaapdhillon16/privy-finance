# Privy Finance

AI-native personal finance copilot with encrypted document storage on NOVA, private analysis via NEAR AI, dual authentication (email + NEAR wallet), and a full Next.js dashboard for insights, goals, and chat with your own data.

## Table of Contents
- Overview
- Core Features
- Architecture
- Tech Stack
- Project Structure
- Getting Started
- Environment Variables
- Database
- API Reference
- Document Processing Pipeline
- Privacy and Security
- Deployment
- Troubleshooting
- Current Limitations

## Overview
Privy Finance helps users upload financial statements, parse transactions, generate deep optimization insights, create goal execution plans, and chat with their own financial data.

The application is implemented end-to-end with:
- Next.js 14 App Router + TypeScript
- Supabase for auth, Postgres, and RLS
- `nova-sdk-js` for encrypted file storage on NOVA groups
- NEAR AI Cloud for LLM-based extraction and financial analysis

## Core Features
- Dual authentication:
  - Email/password sign up and login
  - NEAR wallet sign-in/sign-up with signature verification
- Mandatory onboarding modal after first login:
  - Country and currency (searchable lists)
  - Employment type
  - Monthly income and expenses
  - Currency-aware annual income ranges
  - Risk tolerance and primary goals
- Settings page to edit onboarding data later
- Sidebar identity displays onboarding full name (fallback to auth metadata/email)
- Statement upload support:
  - CSV, XLS, XLSX, PDF
- Secure document lifecycle:
  - Upload to NOVA via `nova-sdk-js`
  - Processing status tracking in `nova_documents`
  - Document list page
  - PDF view and file download endpoint
  - Delete endpoint (source delete depends on SDK support)
- Deep optimization dashboard:
  - Trend charts (income/expenses/net)
  - Spending category and merchant charts
  - Insight impact distribution
  - All categorized transactions table from `transaction_summaries.all_transactions`
- Goals page:
  - User-created custom goals
  - “Generate AI Plan” in modal
  - Plan includes milestones, action steps, budget adjustments, risk mitigations
- Talk To My Data chat:
  - Context from transaction summaries, onboarding data, insights, goals
  - Markdown-supported assistant responses
  - Mobile-friendly layout

## Architecture
High-level flow:
1. User uploads financial statement.
2. File is encrypted and uploaded to NOVA (`lib/nova/client.ts`).
3. File metadata is stored in `nova_documents`.
4. Background process route parses and categorizes transactions.
5. Monthly aggregates and full row-level transactions are written into `transaction_summaries`.
6. NEAR AI generates:
   - comprehensive analysis
   - optimization insights
   - goals
7. Results are saved in Supabase (`ai_analyses`, `insights`, `goals`).
8. Dashboard, optimization page, goals page, and chat page consume those datasets.

## Tech Stack
- Framework: Next.js 14 (App Router), React 18, TypeScript
- Styling/UI: Tailwind CSS, Radix UI, Lucide icons
- Data fetching: TanStack React Query
- Auth + DB: Supabase (`@supabase/supabase-js`, auth helpers)
- Wallet auth: `@near-wallet-selector/*`, `near-api-js`, `tweetnacl`
- Encrypted storage: `nova-sdk-js`
- AI: NEAR AI Cloud API (`axios`)
- Parsing:
  - CSV: `papaparse`
  - Excel: `xlsx`
  - PDF text extraction: `pdf-parse`
- Charts: `recharts`
- Markdown rendering in chat: `react-markdown`, `remark-gfm`

## Project Structure
```text
app/
  (auth)/login, signup
  (dashboard)/dashboard/* (overview, transactions, documents, optimization, goals, settings, talk-to-my-data)
  api/
    auth/wallet-signin
    onboarding
    documents, documents/upload, documents/[id], documents/[id]/view, documents/[id]/process
    analysis/latest
    financial
    insights
    optimization
    goals/plan
    chat/data-assistant
components/
  onboarding/OnboardingModal
  upload/DocumentUploadZone
  dashboard/*
  layout/Sidebar, Header
lib/
  nova/*
  near-ai/client.ts
  supabase/*
  utils/*
db/
  schema.sql
  migrations/20260216_onboarding_data.sql
```

## Getting Started
### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment variables
```bash
cp .env.example .env.local
```
Fill `.env.local` with real credentials.

### 3. Set up Supabase schema
Run:
- `db/schema.sql`

If your DB already existed before onboarding table additions, also run:
- `db/migrations/20260216_onboarding_data.sql`

### 4. Start development server
```bash
npm run dev
```

### 5. Validate build and types
```bash
npm run typecheck
npm run lint
npm run build
```

## Environment Variables
Reference: `.env.example`

### Supabase
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### NOVA (`nova-sdk-js`)
- `NOVA_API_KEY`
- `NOVA_ACCOUNT_ID`
- `NOVA_GROUP_PREFIX`
- `NOVA_AUTH_URL`
- `NOVA_MCP_URL`
- `NOVA_RPC_URL`
- `NOVA_CONTRACT_ID`

### NEAR AI
- `NEAR_AI_API_KEY`
- `NEXT_PUBLIC_NEAR_AI_ENDPOINT`
- `NEAR_AI_TEE_ENABLED`
- `NEAR_AI_PDF_CHUNK_CONCURRENCY`
- `NEAR_AI_PDF_CHUNK_MAX_ATTEMPTS`
- `NEAR_AI_NAME_CLEAN_CONCURRENCY`
- `NEAR_AI_MAX_TRANSACTION_AMOUNT`
- `PROCESSING_MAX_TRANSACTION_ABS`

### NEAR Wallet / App
- `NEXT_PUBLIC_NEAR_NETWORK`
- `NEXT_PUBLIC_NEAR_WALLET_URL`
- `NEXT_PUBLIC_NEAR_HELPER_URL`
- `NEXT_PUBLIC_APP_URL`
- `NODE_ENV`

## Database
Main tables:
- `users`: app-level auth profile
- `onboarding_data`: JSON onboarding payload (`data_of_user`)
- `user_profiles`: normalized profile fields
- `financial_data`: financial snapshot and derived values
- `nova_documents`: NOVA file metadata + processing lifecycle fields
- `transaction_summaries`: monthly aggregates + `all_transactions` JSONB
- `ai_analyses`: detailed model output + attestation metadata
- `insights`: action recommendations
- `goals`, `goal_progress`: user goals and progress logs

Security:
- RLS enabled on all user-facing tables
- per-table ownership policies (`auth.uid()` scoped)
- `updated_at` triggers on mutable tables

## API Reference
Auth and onboarding:
- `POST /api/auth/wallet-signin`
- `GET /api/onboarding`
- `POST /api/onboarding`

Documents:
- `GET /api/documents`
- `POST /api/documents/upload`
- `GET /api/documents/:id`
- `DELETE /api/documents/:id`
- `GET /api/documents/:id/view`
- `POST /api/documents/:id/process`

Analytics and planning:
- `GET /api/analysis/latest`
- `GET /api/financial`
- `GET /api/insights`
- `GET /api/optimization`
- `POST /api/goals/plan`

Chat:
- `POST /api/chat/data-assistant`

## Document Processing Pipeline
Implemented in `app/api/documents/[id]/process/route.ts`.

Behavior:
- Fetches NOVA document metadata.
- Downloads encrypted file from NOVA.
- Parses by type:
  - CSV/XLS/XLSX: parser pipeline in `lib/utils/csv-parser.ts`
  - PDF:
    - extract text
    - chunk to max 2000 characters
    - parallel LLM extraction per chunk
    - parallel LLM transaction name cleanup
- Aggregates by month.
- Upserts `transaction_summaries` including `all_transactions`.
- Reads full 12-month context for richer analysis.
- Runs NEAR AI for:
  - comprehensive analysis
  - optimization insights
  - goal generation
- Persists `ai_analyses`, `insights`, `goals`.
- Updates `nova_documents` processing fields:
  - `processing_status`
  - `transaction_count`
  - `date_range_start/end`
  - `total_income/total_expenses`
  - `processed_at`

Reliability:
- LLM failures fallback to deterministic analysis/insight/goal generators so processing can still complete.

Performance:
- Batch-parallel chunk processing controlled by:
  - `NEAR_AI_PDF_CHUNK_CONCURRENCY`
  - `NEAR_AI_NAME_CLEAN_CONCURRENCY`

## Privacy and Security
- Files are encrypted at rest in NOVA groups.
- Wallet auth uses signature verification against on-chain access keys.
- Sensitive app data is protected by Supabase RLS.
- API middleware enforces in-memory IP rate limiting.
- Chat context is built from user-owned rows only.

## Deployment
### Docker
Use:
- `Dockerfile`
- `docker-compose.yml`

Run:
```bash
docker compose up --build
```

Notes:
- Dockerfile targets Node 20 Alpine and expects Next standalone output (`.next/standalone`).
- Add `output: 'standalone'` in `next.config.mjs` for production Docker builds.
- Pass required env vars into container environment.

### Vercel
No repo-level `vercel.json` is required currently. Standard Next.js deployment works if all environment variables are configured in project settings.

## Troubleshooting
### `getaddrinfo ENOTFOUND api.nova-sdk.com`
This project uses `nova-sdk-js` directly (on-chain group + upload/retrieve flow), not the old `api.nova-sdk.com` endpoint. Ensure NOVA env vars are set exactly as in `.env.example`.

### Wallet sign-in error: invalid nonce length
The wallet sign flow sends a 32-byte nonce and verifies using NEP-413 hashing. If errors persist, clear session/cookies and reconnect wallet.

### PDF parsing/import errors from `pdf-parse`
The parser uses `require('pdf-parse/lib/pdf-parse.js')` to avoid test fixture path issues from default imports. Reinstall deps if lockfile drift occurred.

### No insights shown after upload
Check:
- `nova_documents.processing_status`
- `nova_documents.processing_error`
- server logs for NEAR AI failures (fallback still generates baseline outputs)

## Current Limitations
- NOVA source-side delete depends on SDK/runtime method availability. App record delete always works; source delete may return “not supported” in some SDK versions.
- Middleware rate limiter is in-memory. For distributed deployments, move this to Redis/Upstash.
- NEAR AI latency can be high for large PDFs due to chunk extraction.

## License
Private project. Add a license file if you plan to open source.
