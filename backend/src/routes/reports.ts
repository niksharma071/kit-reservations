import { Router } from "express";
import {
  getOrdersNeedingKits,
  getReservationsPerMonth,
} from "../controllers/reportController";

export const reportsRouter = Router();

reportsRouter.get("/orders-needing-kits", getOrdersNeedingKits);
reportsRouter.get("/reservations-per-month", getReservationsPerMonth);

export default reportsRouter;
