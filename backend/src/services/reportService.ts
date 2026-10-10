import pool from "../db";

/* ------------------------------------------------------------------ *
 * Report 1: confirmed orders that still need kits
 * ------------------------------------------------------------------ */

export interface OrderNeedingKits {
  order_id: string;
  reference: string;
  needed: number;
}


const SELECT_ORDERS_NEEDING_KITS = `
  select
    o.id as order_id,
    o.reference,
    (sum(ol.quantity) - coalesce(sum(lr.active_count), 0))::int as needed
  from orders o
  join order_lines ol on ol.order_id = o.id
  left join (
    select order_line_id, count(*)::int as active_count
    from reservations
    where status = 'active'
    group by order_line_id
  ) lr on lr.order_line_id = ol.id
  where o.status = 'confirmed'
  group by o.id, o.reference
  having sum(ol.quantity) - coalesce(sum(lr.active_count), 0) > 0
  order by needed desc, o.reference asc
`;

export async function getOrdersNeedingKits(): Promise<OrderNeedingKits[]> {
  const result = await pool.query<OrderNeedingKits>(SELECT_ORDERS_NEEDING_KITS);
  return result.rows;
}

/* ------------------------------------------------------------------ *
 * Report 2: reservations per month, last 6 months, India time
 * ------------------------------------------------------------------ */

export interface ReservationsPerMonth {
  month: string; // 'YYYY-MM'
  count: number;
}


const SELECT_RESERVATIONS_PER_MONTH = `
  select
  to_char(m.month_start, 'YYYY-MM') as month,
  count(r.id)::int as count
from generate_series(
       date_trunc('month', now() at time zone 'Asia/Kolkata') - interval '5 months',
       date_trunc('month', now() at time zone 'Asia/Kolkata'),
       interval '1 month'
     ) as m(month_start)
left join reservations r
  on date_trunc('month', r.created_at at time zone 'Asia/Kolkata') = m.month_start
group by m.month_start
order by m.month_start;
`;

/** Counts every reservation in the month it was created, active or released. */
export async function getReservationsPerMonth(): Promise<ReservationsPerMonth[]> {
  const result = await pool.query<ReservationsPerMonth>(SELECT_RESERVATIONS_PER_MONTH);
  return result.rows;
}
