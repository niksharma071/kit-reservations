import { Request, Response } from "express";
import { isUuid } from "../lib/validation";
import {
  ORDER_STATUSES,
  OrderStatus,
  getOrderWithLines as fetchOrderWithLines,
  getReservableKits as fetchReservableKits,
  listOrders as fetchOrders,
} from "../services/orderService";

const DEFAULT_LIMIT = 10;
const DEFAULT_OFFSET = 0;

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** Express allows repeated query keys; only a single scalar is accepted here. */
function readSingle(raw: unknown, name: string): Parsed<string | undefined> {
  if (raw === undefined) return { ok: true, value: undefined };
  if (typeof raw === "string") return { ok: true, value: raw };
  return { ok: false, error: `'${name}' must be given at most once.` };
}

function parseNonNegativeInt(raw: unknown, name: string, fallback: number): Parsed<number> {
  const single = readSingle(raw, name);
  if (!single.ok) return single;
  if (single.value === undefined) return { ok: true, value: fallback };

  // Rejects "-1", "1.5", "1e3", "" and anything non-numeric.
  if (!/^\d+$/.test(single.value)) {
    return { ok: false, error: `'${name}' must be a non-negative integer.` };
  }

  const value = Number(single.value);
  if (!Number.isSafeInteger(value)) {
    return { ok: false, error: `'${name}' is too large.` };
  }

  return { ok: true, value };
}

function parseStatus(raw: unknown): Parsed<OrderStatus | undefined> {
  const single = readSingle(raw, "status");
  if (!single.ok) return single;
  if (single.value === undefined) return { ok: true, value: undefined };

  if (!(ORDER_STATUSES as readonly string[]).includes(single.value)) {
    return { ok: false, error: `'status' must be one of: ${ORDER_STATUSES.join(", ")}.` };
  }

  return { ok: true, value: single.value as OrderStatus };
}

export async function listOrders(req: Request, res: Response): Promise<void> {
  const status = parseStatus(req.query.status);
  if (!status.ok) {
    res.status(400).json({ error: status.error });
    return;
  }

  const limit = parseNonNegativeInt(req.query.limit, "limit", DEFAULT_LIMIT);
  if (!limit.ok) {
    res.status(400).json({ error: limit.error });
    return;
  }

  const offset = parseNonNegativeInt(req.query.offset, "offset", DEFAULT_OFFSET);
  if (!offset.ok) {
    res.status(400).json({ error: offset.error });
    return;
  }

  try {
    const { orders, total } = await fetchOrders({
      status: status.value,
      limit: limit.value,
      offset: offset.value,
    });

    res.json({ orders, total, limit: limit.value, offset: offset.value });
  } catch (err) {
    console.error("GET /api/orders failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function getOrder(
  req: Request<{ orderId: string }>,
  res: Response
): Promise<void> {
  const { orderId } = req.params;

  if (!isUuid(orderId)) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  try {
    const result = await fetchOrderWithLines(orderId);

    if (!result.ok) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    res.json({ order: result.order });
  } catch (err) {
    console.error(`GET /api/orders/${orderId} failed:`, err);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function getReservableKits(
  req: Request<{ orderId: string }>,
  res: Response
): Promise<void> {
  const { orderId } = req.params;

  if (!isUuid(orderId)) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  try {
    const result = await fetchReservableKits(orderId);

    if (!result.ok) {
      switch (result.failure.kind) {
        case "ORDER_NOT_FOUND":
          res.status(404).json({ error: "Order not found" });
          return;
        case "ORDER_NOT_CONFIRMED":
          res.status(400).json({
            error: `Only confirmed orders can have reservations; order is '${result.failure.status}'.`,
          });
          return;
      }
    }

    res.json({ kits: result.kits });
  } catch (err) {
    console.error(`GET /api/orders/${orderId}/reservable-kits failed:`, err);
    res.status(500).json({ error: "Internal server error" });
  }
}
