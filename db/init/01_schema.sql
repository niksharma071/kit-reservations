-- 01_schema.sql
-- Schema for the kits database. Paste table definitions below.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

create table warehouses (
 id uuid primary key default gen_random_uuid(),
 code text not null unique,
 name text not null
);
create table kits (
 id uuid primary key default gen_random_uuid(),
 serial text not null unique,
 warehouse_id uuid not null references warehouses (id),
 batch_code text not null,
 status text not null check (status in ('available', 'held', 'sold')),
 expires_on date not null,
 created_at timestamptz not null default now()
);
create table orders (
 id uuid primary key default gen_random_uuid(),
 reference text not null unique,
 warehouse_id uuid not null references warehouses (id),
 status text not null check (status in ('draft', 'confirmed', 'cancelled')),
 version integer not null default 1 check (version > 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table order_lines (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references orders (id),
 quantity integer not null check (quantity > 0)
);
create table reservations (
 id uuid primary key default gen_random_uuid(),
 kit_id uuid not null references kits (id),
 order_line_id uuid not null references order_lines (id),
 status text not null check (status in ('active', 'released')),
 created_at timestamptz not null default now(),
 released_at timestamptz,
 check ((status = 'released') = (released_at is not null))
);




-- Enforce at most one active reservation per kit.
CREATE UNIQUE INDEX one_active_reservation_per_kit ON reservations (kit_id) WHERE status = 'active';
