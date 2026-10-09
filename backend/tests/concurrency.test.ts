import { PoolClient } from "pg";
import pool from "../src/db";
import { reserveKits, ReserveKitsResult } from "../src/services/reservationService";

jest.setTimeout(30_000);

type Success = Extract<ReserveKitsResult, { ok: true }>;
type Failure = Extract<ReserveKitsResult, { ok: false }>;

const isSuccess = (r: ReserveKitsResult): r is Success => r.ok;
const isFailure = (r: ReserveKitsResult): r is Failure => !r.ok;

interface Fixture {
  orderId: string;
  lineId: string;
  version: number;
  warehouseId: string;
  serial: string;
  kitId: string;
}

// A confirmed order whose line has room for at least two more reservations, so
// the line quantity is never what rejects a racing request.
const FIND_ORDER_LINE = `
  select o.id as order_id, o.version, o.warehouse_id, ol.id as line_id
  from orders o
  join order_lines ol on ol.order_id = o.id
  where o.status = 'confirmed'
    and (
      select count(*) from reservations r
      where r.order_line_id = ol.id and r.status = 'active'
    ) + 2 <= ol.quantity
  order by ol.quantity desc
  limit 1
`;

// Reservable for that warehouse: available, unexpired, no active reservation.
const FIND_RESERVABLE_KIT = `
  select k.id, k.serial
  from kits k
  where k.warehouse_id = $1
    and k.status = 'available'
    and k.expires_on >= current_date
    and not exists (
      select 1 from reservations r
      where r.kit_id = k.id and r.status = 'active'
    )
  order by k.serial
  limit 1
`;

const COUNT_ACTIVE_FOR_SERIAL = `
  select count(*)::int as count
  from reservations r
  join kits k on k.id = r.kit_id
  where k.serial = $1
    and r.status = 'active'
`;

/** Read fresh fixtures per test: earlier tests change versions and reservations. */
async function loadFixture(): Promise<Fixture> {
  const order = await pool.query<{
    order_id: string;
    version: number;
    warehouse_id: string;
    line_id: string;
  }>(FIND_ORDER_LINE);

  if (order.rows.length === 0) {
    throw new Error("No confirmed order with spare line capacity; re-run npm run db:setup.");
  }
  const o = order.rows[0];

  const kit = await pool.query<{ id: string; serial: string }>(FIND_RESERVABLE_KIT, [
    o.warehouse_id,
  ]);
  if (kit.rows.length === 0) {
    throw new Error("No reservable kit in that warehouse; re-run npm run db:setup.");
  }

  return {
    orderId: o.order_id,
    lineId: o.line_id,
    version: o.version,
    warehouseId: o.warehouse_id,
    serial: kit.rows[0].serial,
    kitId: kit.rows[0].id,
  };
}

// Snapshot/restore so the suite leaves the seeded database as it found it.
let baselineReservationIds: string[] = [];
let baselineOrderVersions: Array<{ id: string; version: number }> = [];

beforeAll(async () => {
  baselineReservationIds = (
    await pool.query<{ id: string }>("select id from reservations")
  ).rows.map((r) => r.id);

  baselineOrderVersions = (
    await pool.query<{ id: string; version: number }>("select id, version from orders")
  ).rows;
});

afterAll(async () => {
  await pool.query("delete from reservations where id <> all($1::uuid[])", [
    baselineReservationIds,
  ]);
  for (const o of baselineOrderVersions) {
    await pool.query("update orders set version = $2 where id = $1", [o.id, o.version]);
  }
  await pool.end();
});

describe("reserveKits concurrency", () => {
  it("same kit, two simultaneous requests, only one wins", async () => {
    const f = await loadFixture();
    const input = {
      orderId: f.orderId,
      lineId: f.lineId,
      serials: [f.serial],
      version: f.version,
    };

    const settled = await Promise.allSettled([reserveKits(input), reserveKits(input)]);

    // Neither call should throw; both report their outcome as a value.
    expect(settled.map((s) => s.status)).toEqual(["fulfilled", "fulfilled"]);
    const results = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));

    const winners = results.filter(isSuccess);
    const losers = results.filter(isFailure);

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);

    // The winner reserved exactly the requested kit and bumped the version.
    expect(winners[0].reservations.map((r) => r.serial)).toEqual([f.serial]);
    expect(winners[0].version).toBe(f.version + 1);

    // The loser is rejected by the optimistic version check, not by the unique
    // index: `select ... for update` on the order row serialises same-order
    // callers, so by the time the loser reads the order the version has moved.
    // The KIT_TAKEN path needs two *different* orders - see the test below.
    expect(losers[0].failure.kind).toBe("ORDER_CHANGED");

    const count = await pool.query<{ count: number }>(COUNT_ACTIVE_FOR_SERIAL, [f.serial]);
    expect(count.rows[0].count).toBe(1);
  });

  it("maps a competing transaction's unique violation to KIT_TAKEN", async () => {
    const f = await loadFixture();

    // Any other line; it only has to satisfy the foreign key.
    const other = await pool.query<{ id: string }>(
      "select id from order_lines where id <> $1 limit 1",
      [f.lineId]
    );

    const blocker: PoolClient = await pool.connect();
    let result: ReserveKitsResult;

    try {
      await blocker.query("BEGIN");

      // Uncommitted, so the service's `exists` check cannot see it: validation
      // passes and the service then blocks on the partial unique index.
      await blocker.query(
        "insert into reservations (kit_id, order_line_id, status) values ($1, $2, 'active')",
        [f.kitId, other.rows[0].id]
      );

      const pending = reserveKits({
        orderId: f.orderId,
        lineId: f.lineId,
        serials: [f.serial],
        version: f.version,
      });

      await new Promise((resolve) => setTimeout(resolve, 1000));
      await blocker.query("COMMIT"); // releases the service's insert into a 23505
      result = await pending;
    } finally {
      blocker.release();
    }

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.failure.kind).toBe("KIT_TAKEN");
    }

    // Rolled back: the kit keeps only the competing reservation, and the
    // order version is untouched.
    const count = await pool.query<{ count: number }>(COUNT_ACTIVE_FOR_SERIAL, [f.serial]);
    expect(count.rows[0].count).toBe(1);

    const version = await pool.query<{ version: number }>(
      "select version from orders where id = $1",
      [f.orderId]
    );
    expect(version.rows[0].version).toBe(f.version);
  });
});
