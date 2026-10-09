import { Request, Response } from "express";
import { isUuid } from "../lib/validation";
import {
  reserveKits as reserveKitsTransaction,
  ReserveKitsFailure,
} from "../services/reservationService";

interface ReserveKitsBody {
  serials?: unknown;
  version?: unknown;
}

type ParsedBody = { serials: string[]; version: number };

/** Validates the request body shape before any DB work. */
function parseBody(body: ReserveKitsBody): { ok: true; value: ParsedBody } | { ok: false; error: string } {
  const { serials, version } = body ?? {};

  if (!Array.isArray(serials) || serials.length === 0) {
    return { ok: false, error: "'serials' must be a non-empty array of kit serials." };
  }

  if (!serials.every((s): s is string => typeof s === "string" && s.trim().length > 0)) {
    return { ok: false, error: "'serials' must contain only non-empty strings." };
  }

  const duplicates = serials.filter((s, i) => serials.indexOf(s) !== i);
  if (duplicates.length > 0) {
    return {
      ok: false,
      error: `'serials' contains duplicates: ${[...new Set(duplicates)].join(", ")}.`,
    };
  }

  if (typeof version !== "number" || !Number.isInteger(version)) {
    return { ok: false, error: "'version' must be an integer." };
  }

  return { ok: true, value: { serials, version } };
}

/** Maps a service failure onto its HTTP response. */
function respondToFailure(res: Response, failure: ReserveKitsFailure): void {
  switch (failure.kind) {
    case "ORDER_NOT_FOUND":
      res.status(404).json({ error: "Order not found" });
      return;
    case "LINE_NOT_FOUND":
      res.status(404).json({ error: "Order line not found" });
      return;
    case "ORDER_NOT_CONFIRMED":
      res.status(400).json({
        error: "Only confirmed orders can be reserved",
        status: failure.status,
      });
      return;
    case "ORDER_CHANGED":
      res.status(409).json({
        error: "ORDER_CHANGED",
        message: "This order was changed, please reload",
        currentVersion: failure.currentVersion,
      });
      return;
    case "QUANTITY_EXCEEDED":
      res.status(400).json({
        error: "QUANTITY_EXCEEDED",
        message:
          `Order line needs ${failure.quantity} kit(s) and already has ` +
          `${failure.alreadyReserved} reserved; cannot reserve ${failure.requested} more.`,
        quantity: failure.quantity,
        alreadyReserved: failure.alreadyReserved,
        requested: failure.requested,
      });
      return;
    case "KITS_UNAVAILABLE":
      res.status(400).json({ error: "KITS_UNAVAILABLE", failures: failure.failures });
      return;
    case "KIT_TAKEN":
      res.status(409).json({
        error: "KIT_TAKEN",
        message: "One of these kits was just reserved by someone else, please reload",
      });
      return;
  }
}

export async function reserveKits(
  req: Request<{ orderId: string; lineId: string }>,
  res: Response
): Promise<void> {
  const { orderId, lineId } = req.params;

  if (!isUuid(orderId)) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  if (!isUuid(lineId)) {
    res.status(404).json({ error: "Order line not found" });
    return;
  }

  const parsed = parseBody(req.body as ReserveKitsBody);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  try {
    const result = await reserveKitsTransaction({
      orderId,
      lineId,
      serials: parsed.value.serials,
      version: parsed.value.version,
    });

    if (!result.ok) {
      respondToFailure(res, result.failure);
      return;
    }

    res.status(200).json({ reservations: result.reservations, version: result.version });
  } catch (err) {
    console.error(`POST /api/orders/${orderId}/lines/${lineId}/reserve failed:`, err);
    res.status(500).json({ error: "Internal server error" });
  }
}
