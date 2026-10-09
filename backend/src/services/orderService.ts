import pool from "../db";

export const ORDER_STATUSES = ["draft", "confirmed", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/* ------------------------------------------------------------------ *
 * Reservable kits for an order
 * ------------------------------------------------------------------ */

export interface ReservableKit {
  id: string;
  serial: string;
  batch_code: string;
  expires_on: string;
}

export type ReservableKitsFailure =
  | { kind: "ORDER_NOT_FOUND" }
  | { kind: "ORDER_NOT_CONFIRMED"; status: OrderStatus };

export type ReservableKitsResult =
  | { ok: true; kits: ReservableKit[] }
  | { ok: false; failure: ReservableKitsFailure };

interface OrderWarehouseRow {
  warehouse_id: string;
  status: OrderStatus;
}

const SELECT_ORDER_WAREHOUSE = `
  select warehouse_id, status
  from orders
  where id = $1
`;

// expires_on is a date; to_char keeps it a calendar date instead of letting the
// Date -> UTC ISO conversion in JSON.stringify shift it by a day.
const SELECT_RESERVABLE_KITS = `
  select
    k.id,
    k.serial,
    k.batch_code,
    to_char(k.expires_on, 'YYYY-MM-DD') as expires_on
  from kits k
  where k.warehouse_id = $1
    and k.status = 'available'
    and k.expires_on >= current_date
    and not exists (
      select 1
      from reservations r
      where r.kit_id = k.id
        and r.status = 'active'
    )
  order by k.serial asc
`;

export async function getReservableKits(orderId: string): Promise<ReservableKitsResult> {
  const orderResult = await pool.query<OrderWarehouseRow>(SELECT_ORDER_WAREHOUSE, [orderId]);
  const order = orderResult.rows[0];

  if (!order) {
    return { ok: false, failure: { kind: "ORDER_NOT_FOUND" } };
  }

  if (order.status !== "confirmed") {
    return { ok: false, failure: { kind: "ORDER_NOT_CONFIRMED", status: order.status } };
  }

  const kitsResult = await pool.query<ReservableKit>(SELECT_RESERVABLE_KITS, [
    order.warehouse_id,
  ]);

  return { ok: true, kits: kitsResult.rows };
}

/* ------------------------------------------------------------------ *
 * Order list (one page, order-level fields only)
 * ------------------------------------------------------------------ */

export interface OrderSummary {
  id: string;
  reference: string;
  status: OrderStatus;
  warehouse_id: string;
  created_at: Date;
}

export interface ListOrdersParams {
  status?: OrderStatus;
  limit: number;
  offset: number;
}

export interface ListOrdersResult {
  orders: OrderSummary[];
  total: number;
}

// A null $1 means "no status filter", so one statement serves both cases.
const SELECT_ORDERS_PAGE = `
  select id, reference, status, warehouse_id, created_at
  from orders
  where ($1::text is null or status = $1)
  order by created_at desc
  limit $2
  offset $3
`;

// Counted separately from the page: a window count returns no row at all once
// the offset runs past the end, which would hide the real total.
const COUNT_ORDERS = `
  select count(*)::int as total
  from orders
  where ($1::text is null or status = $1)
`;

export async function listOrders(params: ListOrdersParams): Promise<ListOrdersResult> {
  const { status = null, limit, offset } = params;

  const [page, count] = await Promise.all([
    pool.query<OrderSummary>(SELECT_ORDERS_PAGE, [status, limit, offset]),
    pool.query<{ total: number }>(COUNT_ORDERS, [status]),
  ]);

  return { orders: page.rows, total: count.rows[0].total };
}

/* ------------------------------------------------------------------ *
 * Order detail with lines and reserved counts
 * ------------------------------------------------------------------ */

export interface OrderLineWithReserved {
  id: string;
  quantity: number;
  reserved_count: number;
}

export interface OrderDetail {
  id: string;
  reference: string;
  status: OrderStatus;
  warehouse_id: string;
  version: number;
  created_at: Date;
  lines: OrderLineWithReserved[];
}

export type OrderDetailFailure = { kind: "ORDER_NOT_FOUND" };

export type OrderDetailResult =
  | { ok: true; order: OrderDetail }
  | { ok: false; failure: OrderDetailFailure };

interface OrderDetailRow {
  id: string;
  reference: string;
  status: OrderStatus;
  warehouse_id: string;
  version: number;
  created_at: Date;
}

const SELECT_ORDER_DETAIL = `
  select id, reference, status, warehouse_id, version, created_at
  from orders
  where id = $1
`;

// The status filter sits in the ON clause, not WHERE, so a line with no active
// reservations still returns a row with reserved_count 0.
const SELECT_ORDER_LINES = `
  select
    ol.id,
    ol.quantity,
    count(r.id)::int as reserved_count
  from order_lines ol
  left join reservations r
    on r.order_line_id = ol.id
   and r.status = 'active'
  where ol.order_id = $1
  group by ol.id, ol.quantity
  order by ol.id
`;

export async function getOrderWithLines(orderId: string): Promise<OrderDetailResult> {
  const orderResult = await pool.query<OrderDetailRow>(SELECT_ORDER_DETAIL, [orderId]);
  const order = orderResult.rows[0];

  if (!order) {
    return { ok: false, failure: { kind: "ORDER_NOT_FOUND" } };
  }

  const linesResult = await pool.query<OrderLineWithReserved>(SELECT_ORDER_LINES, [orderId]);

  return { ok: true, order: { ...order, lines: linesResult.rows } };
}
