import { PoolClient } from "pg";
import pool from "../db";

const PG_UNIQUE_VIOLATION = "23505";

export interface ReserveKitsInput {
  orderId: string;
  lineId: string;
  serials: string[];
  version: number;
}

export interface KitFailure {
  serial: string;
  reason: string;
}

export interface CreatedReservation {
  id: string;
  kit_id: string;
  serial: string;
  status: string;
  created_at: string;
}

/** Discriminated union so the controller owns status codes and the service owns SQL. */
export type ReserveKitsFailure =
  | { kind: "ORDER_NOT_FOUND" }
  | { kind: "ORDER_NOT_CONFIRMED"; status: string }
  | { kind: "ORDER_CHANGED"; currentVersion: number }
  | { kind: "LINE_NOT_FOUND" }
  | { kind: "QUANTITY_EXCEEDED"; quantity: number; alreadyReserved: number; requested: number }
  | { kind: "KITS_UNAVAILABLE"; failures: KitFailure[] }
  | { kind: "KIT_TAKEN" };

export type ReserveKitsResult =
  | { ok: true; reservations: CreatedReservation[]; version: number }
  | { ok: false; failure: ReserveKitsFailure };

interface OrderRow {
  status: "draft" | "confirmed" | "cancelled";
  version: number;
  warehouse_id: string;
}

interface OrderLineRow {
  quantity: number;
}

interface KitCheckRow {
  serial: string;
  id: string | null;
  warehouse_id: string | null;
  status: string | null;
  expired: boolean | null;
  has_active_reservation: boolean | null;
}

// warehouse_id is needed to validate kits in step 4.
const SELECT_ORDER_FOR_UPDATE = `
  select status, version, warehouse_id
  from orders
  where id = $1
  for update
`;

const SELECT_ORDER_LINE_FOR_UPDATE = `
  select quantity
  from order_lines
  where id = $1
    and order_id = $2
  for update
`;

const COUNT_ACTIVE_RESERVATIONS = `
  select count(*)::int as count
  from reservations
  where order_line_id = $1
    and status = 'active'
`;

// One round trip for every requested serial; the left join keeps unknown
// serials in the result so they can be reported rather than silently dropped.
const CHECK_KITS = `
  select
    s.serial,
    k.id,
    k.warehouse_id,
    k.status,
    (k.expires_on < current_date) as expired,
    exists (
      select 1
      from reservations r
      where r.kit_id = k.id
        and r.status = 'active'
    ) as has_active_reservation
  from unnest($1::text[]) as s(serial)
  left join kits k on k.serial = s.serial
`;

const INSERT_RESERVATIONS = `
  insert into reservations (kit_id, order_line_id, status)
  select t.kit_id, $2, 'active'
  from unnest($1::uuid[]) as t(kit_id)
  returning id, kit_id, status, created_at
`;

const BUMP_ORDER_VERSION = `
  update orders
  set version = version + 1,
      updated_at = now()
  where id = $1
  returning version
`;

function reasonFor(row: KitCheckRow, orderWarehouseId: string): string | null {
  if (!row.id) return "Kit not found";
  if (row.warehouse_id !== orderWarehouseId) return "Kit belongs to a different warehouse";
  if (row.status !== "available") return `Kit is '${row.status}', not available`;
  if (row.expired) return "Kit has expired";
  if (row.has_active_reservation) return "Kit already has an active reservation";
  return null;
}

export async function reserveKits(input: ReserveKitsInput): Promise<ReserveKitsResult> {
  const { orderId, lineId, serials, version } = input;
  const client: PoolClient = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Lock the order and check it is reservable and unchanged.
    const orderResult = await client.query<OrderRow>(SELECT_ORDER_FOR_UPDATE, [orderId]);
    const order = orderResult.rows[0];

    if (!order) {
      await client.query("ROLLBACK");
      return { ok: false, failure: { kind: "ORDER_NOT_FOUND" } };
    }

    if (order.status !== "confirmed") {
      await client.query("ROLLBACK");
      return { ok: false, failure: { kind: "ORDER_NOT_CONFIRMED", status: order.status } };
    }

    if (order.version !== version) {
      await client.query("ROLLBACK");
      return { ok: false, failure: { kind: "ORDER_CHANGED", currentVersion: order.version } };
    }

    // 2. Lock the order line.
    const lineResult = await client.query<OrderLineRow>(SELECT_ORDER_LINE_FOR_UPDATE, [
      lineId,
      orderId,
    ]);
    const line = lineResult.rows[0];

    if (!line) {
      await client.query("ROLLBACK");
      return { ok: false, failure: { kind: "LINE_NOT_FOUND" } };
    }

    // 3. Reserving these kits must not exceed the line quantity.
    const countResult = await client.query<{ count: number }>(COUNT_ACTIVE_RESERVATIONS, [lineId]);
    const alreadyReserved = countResult.rows[0].count;

    if (alreadyReserved + serials.length > line.quantity) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        failure: {
          kind: "QUANTITY_EXCEEDED",
          quantity: line.quantity,
          alreadyReserved,
          requested: serials.length,
        },
      };
    }

    // 4. Every serial must be reservable, or none are.
    const checkResult = await client.query<KitCheckRow>(CHECK_KITS, [serials]);
    const bySerial = new Map(checkResult.rows.map((row) => [row.serial, row]));

    const failures: KitFailure[] = [];
    const kitIds: string[] = [];

    for (const serial of serials) {
      const row = bySerial.get(serial);
      if (!row) {
        failures.push({ serial, reason: "Kit not found" });
        continue;
      }
      const reason = reasonFor(row, order.warehouse_id);
      if (reason) {
        failures.push({ serial, reason });
      } else {
        kitIds.push(row.id as string);
      }
    }

    if (failures.length > 0) {
      await client.query("ROLLBACK");
      return { ok: false, failure: { kind: "KITS_UNAVAILABLE", failures } };
    }

    // 5. Insert the reservations.
    const insertResult = await client.query<{
      id: string;
      kit_id: string;
      status: string;
      created_at: string;
    }>(INSERT_RESERVATIONS, [kitIds, lineId]);

    const serialByKitId = new Map(
      checkResult.rows.filter((r) => r.id).map((r) => [r.id as string, r.serial])
    );

    const reservations: CreatedReservation[] = insertResult.rows.map((row) => ({
      id: row.id,
      kit_id: row.kit_id,
      serial: serialByKitId.get(row.kit_id) ?? "",
      status: row.status,
      created_at: row.created_at,
    }));

    // 6. Bump the order version so concurrent clients see the change.
    const versionResult = await client.query<{ version: number }>(BUMP_ORDER_VERSION, [orderId]);

    await client.query("COMMIT");

    return { ok: true, reservations, version: versionResult.rows[0].version };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {
      /* connection may already be unusable */
    });

    // The partial unique index on reservations (kit_id) where status='active'
    // is what makes concurrent reservation of the same kit safe.
    if ((err as { code?: string }).code === PG_UNIQUE_VIOLATION) {
      return { ok: false, failure: { kind: "KIT_TAKEN" } };
    }

    throw err;
  } finally {
    client.release();
  }
}
