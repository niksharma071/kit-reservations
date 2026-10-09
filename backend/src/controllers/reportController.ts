import { Request, Response } from "express";
import {
  getOrdersNeedingKits as fetchOrdersNeedingKits,
  getReservationsPerMonth as fetchReservationsPerMonth,
} from "../services/reportService";

export async function getOrdersNeedingKits(_req: Request, res: Response): Promise<void> {
  try {
    const orders = await fetchOrdersNeedingKits();
    res.json(orders);
  } catch (err) {
    console.error("GET /api/reports/orders-needing-kits failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function getReservationsPerMonth(_req: Request, res: Response): Promise<void> {
  try {
    const months = await fetchReservationsPerMonth();
    res.json(months);
  } catch (err) {
    console.error("GET /api/reports/reservations-per-month failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
