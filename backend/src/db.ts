import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
}

export const pool = new Pool({ connectionString });

export default pool;
