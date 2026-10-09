import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import ordersRouter from "./routes/orders";
import reportsRouter from "./routes/reports";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/orders", ordersRouter);
app.use("/api/reports", reportsRouter);

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
