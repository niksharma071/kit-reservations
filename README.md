# Kit Reservations

A full-stack app for reserving kits against customer orders, with database-enforced concurrency control.

**Stack:** TypeScript, Node/Express, PostgreSQL, React (Vite), Tailwind CSS.

## Project structure

```
backend/            Express API in TypeScript
  src/
    index.ts        App entry: middleware, /health, mounts routers
    db.ts           pg Pool built from DATABASE_URL
    setup-db.ts     Runs the SQL files in db/init against the database
    routes/         URL -> controller mapping only, no logic
    controllers/    HTTP only: read params/body, validate, call a service, send JSON
    services/       All SQL and business logic; returns typed results, never touches req/res
    lib/            Shared helpers (uuid validation)
  tests/            Jest + ts-jest, runs against the real database

db/init/
  01_schema.sql     Tables, constraints, and the partial unique index
  02_seed.sql       Seed data: 3 warehouses, 360 kits, 7 orders, 8 lines, 15 reservations

frontend/           React + Vite + TypeScript + Tailwind
  src/
    api.ts          Axios instance (baseURL /api) + typed endpoint functions
    ui.ts           Shared Tailwind class strings (cards, buttons, badges, tables)
    App.tsx         Routes
    pages/          OrdersListPage, OrderDetailPage, ReportsPage
    components/     ReserveModal
```

Every backend route follows the same three layers: **router → controller → service**.

## Prerequisites

- **Node.js and npm** (developed on Node 22.12, npm 11.16)
- **PostgreSQL** running locally (developed against PostgreSQL 18). The schema runs
  `CREATE EXTENSION IF NOT EXISTS pgcrypto`, so the database user needs permission to
  create an extension — on a standard local install, the default superuser does.

`psql` is **not** required: `npm run db:setup` executes the SQL files through `pg`.

## Setup

1. **Create the database.**

   ```sh
   createdb kits
   ```

2. **Configure the connection.**

   ```sh
   cd backend
   cp .env.example .env
   ```

   Then set `DATABASE_URL` in `backend/.env`, editing the credentials to match your
   Postgres install:

   ```
   DATABASE_URL=postgres://postgres:postgres@localhost:5432/kits
   ```

3. **Install dependencies and load the schema and seed data.**

   ```sh
   npm install
   npm run db:setup
   ```

   This runs `db/init/01_schema.sql` and then `db/init/02_seed.sql`.

   > **This expects an empty database.** It does not drop anything, so re-running it
   > against existing tables fails on the first `create table` and exits non-zero.
   > Each file runs inside a single transaction, so a failed run changes nothing.
   > To get a clean seed, drop the tables first and then re-run it:
   >
   > ```sql
   > drop table if exists reservations, order_lines, orders, kits, warehouses cascade;
   > ```

4. **Start the backend.**

   ```sh
   npm run dev
   ```

   It listens on <http://localhost:4000>. Check it:

   ```sh
   curl http://localhost:4000/health
   # {"status":"ok"}
   ```

5. **Start the frontend** in a second terminal.

   ```sh
   cd ../frontend
   npm install
   npm run dev
   ```

   It serves <http://localhost:5173>. Vite proxies `/api` to `http://localhost:4000`
   (see `frontend/vite.config.ts`), so the browser only ever talks to its own origin
   during development.

## Frontend pages

| Route | Page | What it does |
| --- | --- | --- |
| `/` | Orders list | Orders as cards (reference, status badge, created date), a status filter (All / draft / confirmed / cancelled), and load-more pagination against the reported total. Links to each order and to Reports. |
| `/orders/:orderId` | Order detail | Order header plus each line as `X of N reserved` with a per-line **Reserve** button. The button is disabled, with the reason shown, when the order is not confirmed or the line is already full. |
| `/reports` | Reports | Two tables: orders needing kits, and reservations per month. |

### Reserve modal

Opened from a line's Reserve button. It loads the order's reservable kits and offers
three selection modes:

- **First N** — the first N serials from the reservable list (already sorted by serial)
- **Last N** — the last N serials
- **Manual** — serials typed or pasted, one per line or comma-separated

The selected serials and their count are shown before submitting. Each backend
response is surfaced distinctly: success, `ORDER_CHANGED` (shows a message and
refetches the order so the version is no longer stale), `KITS_UNAVAILABLE` (lists
each serial with its reason — nothing was reserved, it is all-or-none),
`QUANTITY_EXCEEDED`, `KIT_TAKEN`, and a generic message for anything else.

## Running tests

```sh
cd backend
npm test
```

Jest with `ts-jest`, run via `jest --runInBand`.

**The tests execute against the real database** named in `DATABASE_URL` — there is no
separate test database or fixture harness. They need a seeded database containing a
confirmed order with spare line capacity and at least one reservable kit; if there
isn't one, the suite fails with a message telling you to re-run `npm run db:setup`.

The suite snapshots every reservation id and order version in `beforeAll` and restores
them in `afterAll`, so a run leaves the data as it found it.

`tests/concurrency.test.ts` covers two races:

1. **Same-order race** — two simultaneous `reserveKits` calls for the same kit on the
   same order. Exactly one succeeds; the loser gets `ORDER_CHANGED`, because the
   `SELECT ... FOR UPDATE` on the order serializes the two transactions and the second
   one then reads a version that has moved. The database ends with exactly one active
   reservation for that kit.
2. **Cross-transaction race** — a competing transaction holds an *uncommitted* active
   reservation for the same kit, so the service's existence check cannot see it and
   proceeds to `INSERT`, which blocks on the partial unique index. When the competitor
   commits, the insert fails as a unique violation and surfaces as `KIT_TAKEN`, with
   the transaction rolled back and the order version untouched.

## Environment variables

Backend only; set in `backend/.env`.

| Variable | Required | Description | Example |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string. The server throws on startup if it is missing. | `postgres://postgres:postgres@localhost:5432/kits` |
| `PORT` | No | Port for the Express server. Defaults to `4000`. | `4000` |

The frontend needs no environment variables; its API base path is `/api`, resolved by
the Vite dev proxy.

## API endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Liveness check. Returns `{ "status": "ok" }`. |
| `GET` | `/api/orders` | A page of orders, newest first. Optional `status` filter (`draft`/`confirmed`/`cancelled`) plus `limit` (default 10) and `offset` (default 0). Returns `{ orders, total, limit, offset }`, where `total` counts all matches so a client can tell whether more exist. |
| `GET` | `/api/orders/:orderId` | One order with its `version` and its lines, each carrying `reserved_count` (active reservations only). 404 if the order does not exist. |
| `GET` | `/api/orders/:orderId/reservable-kits` | Kits that can be reserved for the order: in the order's warehouse, `available`, not expired, and with no active reservation. Ordered by serial. 400 if the order is not confirmed, 404 if it does not exist. |
| `POST` | `/api/orders/:orderId/lines/:lineId/reserve` | Reserves kits for one line. Body: `{ serials: string[], version: number }`. All-or-none in a single transaction. Returns the created reservations and the new order version, or one of `ORDER_CHANGED` (409), `KITS_UNAVAILABLE` (400), `QUANTITY_EXCEEDED` (400), `KIT_TAKEN` (409). |
| `GET` | `/api/reports/orders-needing-kits` | Confirmed orders whose lines are not fully reserved. Returns `[{ order_id, reference, needed }]`, where `needed` is total line quantity minus active reservations, filtered to a shortfall above zero. |
| `GET` | `/api/reports/reservations-per-month` | Reservation counts for the last 6 months, bucketed in `Asia/Kolkata`. Returns `[{ month, count }]` as `YYYY-MM`, oldest first, including months with a count of `0`. Counts reservations by creation month regardless of status. |

## Architecture and concurrency

The core requirement is correctness when two people reserve at the same time. All of
the work for a reservation happens in **one transaction on a single pooled client**
(`BEGIN` … `COMMIT`, with `ROLLBACK` on every failure path and `client.release()` in a
`finally`), so a reservation is all-or-none: if any requested serial is unusable,
nothing is written. See `backend/src/services/reservationService.ts`.

Three mechanisms sit on top of each other, each covering what the others cannot.

**1. A partial unique index — the database-level backstop.**

```sql
CREATE UNIQUE INDEX one_active_reservation_per_kit
  ON reservations (kit_id) WHERE status = 'active';
```

Because it is partial, a kit may accumulate any number of `released` reservations but
only ever one `active` one. This is what makes double-booking impossible even between
two *different* orders, where no shared row lock exists to serialize them. Postgres
raises `23505`, which the service maps to `KIT_TAKEN`. Application checks alone could
not close this gap: between reading "is this kit free?" and inserting, another
transaction can commit.

**2. Pessimistic row locks — `SELECT ... FOR UPDATE`.**

The transaction locks the order row first, then the order-line row. Two requests
against the same order therefore run one after the other rather than interleaving.
Without this, both could read the same `reserved_count`, each conclude there is room,
and together over-fill a line past its quantity.

**3. Optimistic locking — the `version` column.**

`orders.version` starts at 1 and increments on every successful reserve. The client
sends the version it last saw; if it no longer matches, the request is rejected with
`ORDER_CHANGED` and the UI refetches instead of acting on a stale view. This catches
the case the row locks cannot: a client that read the order minutes ago and is working
from numbers that have since moved.

The three layers are visible in the same request path: the version check rejects stale
clients, the row locks order concurrent clients, and the unique index is the final
guarantee if both are somehow passed.

### Trade-offs

- **Raw SQL rather than an ORM.** The locking is the point of this app, and
  `FOR UPDATE`, partial indexes and the `23505` mapping are all clearer, and easier to
  review, written directly in SQL than expressed through an abstraction.
- **Parameterized queries wherever input reaches SQL.** The order and reservation
  services pass every value as a `$n` placeholder. The two report queries use literal
  SQL because they take no input at all — no user value reaches them, and their only
  constants are the `Asia/Kolkata` timezone and the 6-month window.
- **The frontend is deliberately minimal.** Plain React with `useState`/`useEffect`,
  no state-management library or data-fetching layer, and Tailwind utility classes
  collected in `src/ui.ts` rather than a component library or custom design system.
- **Timezone handled in SQL, not JavaScript.** The monthly report converts
  `created_at` to `Asia/Kolkata` before grouping, and date-only columns are returned as
  `YYYY-MM-DD` strings via `to_char`, so a `Date` → UTC conversion in the browser
  cannot shift a date across a day boundary.
