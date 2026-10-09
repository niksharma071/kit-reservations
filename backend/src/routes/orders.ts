import { Router } from "express";
import { getOrder, getReservableKits, listOrders } from "../controllers/orderController";
import { reserveKits } from "../controllers/reservationController";

export const ordersRouter = Router();

ordersRouter.get("/", listOrders);
ordersRouter.get("/:orderId", getOrder);
ordersRouter.get("/:orderId/reservable-kits", getReservableKits);
ordersRouter.post("/:orderId/lines/:lineId/reserve", reserveKits);

export default ordersRouter;
