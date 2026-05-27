# Server

Express API for the 1MasterDashboard. Runs locally for dev and on Render
in production. Houses all server-only concerns: Plaid integration, token
encryption, persistent storage, support-ticket email, GL data endpoints.

## Local dev

```sh
cp .env.example .env       # fill in what you need
npm install
npm run dev                # nodemon + ts-node on $PORT (default 3001)
```

The frontend (`/`, CRA app) picks up the server when `REACT_APP_API_URL`
is set in the frontend's `.env`. Leave it unset to run the frontend in
static demo mode (no server required).

## Windows local-dev caveat — `better-sqlite3`

`better-sqlite3` is a native module and needs build tools to compile on
Windows. If `npm install` fails with `gyp ERR! not ok`:

- **Easiest:** install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
  with the "Desktop development with C++" workload selected, then `npm install` again.
- **Alternative:** develop in WSL (Ubuntu) where prebuilt binaries Just Work.
- **Or skip local server:** the frontend's static demo mode (without
  `REACT_APP_API_URL`) doesn't need the server at all.

Render builds in a Linux container so the native compile succeeds there
without intervention.

## Environment variables

See `.env.example` for the full list with documentation. The big ones:

| Var | Why |
| --- | --- |
| `TOKEN_ENCRYPTION_KEY` | 32-byte hex key for encrypting Plaid access_tokens at rest. Required in prod. |
| `PLAID_CLIENT_ID` / `PLAID_SECRET` | When unset, all `/api/plaid/*` endpoints return realistic mock data so the frontend flow is testable without credentials. |
| `PLAID_ENV` | `sandbox` for dev, `development` for early customers (100-item cap), `production` for paid scale. |
| `DATABASE_PATH` | Defaults to `./database.sqlite`. On Render, point at a persistent disk mount. |

## Database

SQLite via `better-sqlite3`. Schema lives in `src/db.ts` and runs as an
idempotent migration on every boot. To swap to Render Postgres later,
write a `pg`-backed alternative behind the same prepared-statement
exports — the query surface is small.

Current tables:

- `plaid_items` — one row per connected bank, stores encrypted
  `access_token` + Plaid item metadata + sync cursor.
- `bank_transactions` — normalized transactions from Plaid (or from
  manual upload), keyed by `plaid_txn_id`.

## Plaid endpoints

All under `/api/plaid/*`. Tenant-scoped via `tenantConfig.tenant.id`
(when real auth lands, swap that for the session's tenant_id).

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/plaid/status` | Is Plaid configured? (frontend uses to show/hide Connect button) |
| POST | `/api/plaid/link-token` | Creates a Plaid Link token — frontend opens Plaid Link with it |
| POST | `/api/plaid/exchange` | Swaps `public_token` for `access_token`, stores encrypted |
| GET | `/api/plaid/items` | Lists connected accounts (no tokens in response) |
| POST | `/api/plaid/items/:id/sync` | Pulls latest transactions via `/transactions/sync` (cursor-paginated) |
| DELETE | `/api/plaid/items/:id` | Disconnects (calls Plaid `/item/remove` + local delete) |
| POST | `/api/plaid/webhook` | Plaid webhook receiver — currently logs + marks status |
| GET | `/api/bank-transactions?me_start=&me_end=` | Bank transactions in an ME range (used to populate the Bank/GL tab) |

### Mock mode

If `PLAID_CLIENT_ID` and `PLAID_SECRET` aren't set, the service layer
returns fake-but-realistic responses. You can run the full
button-click → exchange → sync → table-populated flow against a server
with no Plaid credentials. The frontend doesn't know the difference.

When you're ready to go live:

1. Sign up at https://dashboard.plaid.com → grab Sandbox keys
2. Set `PLAID_CLIENT_ID` + `PLAID_SECRET` + `PLAID_ENV=sandbox` in `.env`
3. Restart. Connect to Bank button now opens real Plaid Link with
   sandbox credentials (`user_good` / `pass_good`).
