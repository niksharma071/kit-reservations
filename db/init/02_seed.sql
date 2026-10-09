-- 02_seed.sql
-- Seed data for the kits database. Paste INSERT statements below.
insert into warehouses (code, name) values
 ('WH-AMD', 'Ahmedabad'),
 ('WH-MUM', 'Mumbai'),
 ('WH-DEL', 'Delhi');
-- 360 kits: 120 per warehouse, across 6 batches. Batch B-2025-11 has already expired.
-- Every 17th kit is held and every 29th is sold; the rest are available.
insert into kits (serial, warehouse_id, batch_code, status, expires_on)
select
 'KIT-' || lpad(n::text, 6, '0'),
 (select id from warehouses
 where code = (array['WH-AMD', 'WH-MUM', 'WH-DEL'])[((n - 1) % 3) + 1]),
 (array['B-2025-11', 'B-2026-01', 'B-2026-03',
 'B-2026-05', 'B-2026-07', 'B-2026-09'])[(((n - 1) / 3) % 6) + 1],
 case when n % 17 = 0 then 'held' when n % 29 = 0 then 'sold' else 'available' end,
 case (((n - 1) / 3) % 6)
 when 0 then current_date - 10
 else current_date + (60 * (((n - 1) / 3) % 6))
 end
from generate_series(1, 360) as n;
insert into orders (reference, warehouse_id, status, created_at, updated_at)
select o.reference, w.id, o.status, now() - o.age, now() - o.age
from (values
 ('ORD-1001', 'WH-AMD', 'confirmed', interval '2 days'),
 ('ORD-1002', 'WH-AMD', 'confirmed', interval '130 days'),
 ('ORD-1003', 'WH-MUM', 'confirmed', interval '20 days'),
 ('ORD-1004', 'WH-MUM', 'draft', interval '1 day'),
 ('ORD-1005', 'WH-DEL', 'confirmed', interval '9 days'),
 ('ORD-1006', 'WH-DEL', 'cancelled', interval '40 days'),
 ('ORD-1007', 'WH-AMD', 'confirmed', interval '160 days')
) as o (reference, warehouse_code, status, age)
join warehouses w on w.code = o.warehouse_code;
insert into order_lines (order_id, quantity)
select o.id, l.quantity
from (values
 ('ORD-1001', 20), ('ORD-1001', 5),
 ('ORD-1002', 10),
 ('ORD-1003', 15),
 ('ORD-1004', 8),
 ('ORD-1005', 30),
 ('ORD-1006', 4),
 ('ORD-1007', 3)
) as l (reference, quantity)
join orders o on o.reference = l.reference;
-- Existing reservations over the last 6 months (some months have none).
-- ORD-1007: 3 active. ORD-1002: 4 active and 2 released. ORD-1005: 6 active.
with reservable as (
 select k.id, w.code as warehouse_code,
 row_number() over (partition by w.code order by k.serial) as rn
 from kits k
 join warehouses w on w.id = k.warehouse_id
 where k.status = 'available' and k.expires_on >= current_date
),
picks as (
 select 'ORD-1007' as reference, 'WH-AMD' as warehouse_code,
 1 as first_rn, 3 as last_rn, interval '150 days' as age
 union all select 'ORD-1002', 'WH-AMD', 4, 9, interval '120 days'
 union all select 'ORD-1005', 'WH-DEL', 1, 6, interval '3 days'
)
insert into reservations (kit_id, order_line_id, status, created_at, released_at)
select
 r.id,
 ol.id,
 case when p.reference = 'ORD-1002' and r.rn > 7 then 'released' else 'active' end,
 now() - p.age,
 case when p.reference = 'ORD-1002' and r.rn > 7 then now() - p.age + interval '1 day' end
from picks p
join reservable r on r.warehouse_code = p.warehouse_code and r.rn between p.first_rn and p.last_rn
join orders o on o.reference = p.reference
join order_lines ol on ol.order_id = o.id;
update orders set version = 2 where reference in ('ORD-1002', 'ORD-1005', 'ORD-1007');