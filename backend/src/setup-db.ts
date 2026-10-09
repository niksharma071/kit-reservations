import fs from "fs";
import path from "path";
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

// src/ -> backend/ -> project root
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

const SQL_FILES = ["db/init/01_schema.sql", "db/init/02_seed.sql"];

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString });
  let failed = false;

  try {
    for (const relativePath of SQL_FILES) {
      const filePath = path.join(PROJECT_ROOT, relativePath);

      let sql: string;
      try {
        sql = fs.readFileSync(filePath, "utf8");
      } catch (err) {
        console.error(`Could not read ${relativePath}: ${(err as Error).message}`);
        failed = true;
        break;
      }

      if (!sql.trim()) {
        console.log(`Skipping ${relativePath} (empty)`);
        continue;
      }

      console.log(`Running ${relativePath} ...`);
      try {
        await pool.query(sql);
        console.log(`  done: ${relativePath}`);
      } catch (err) {
        const pgErr = err as Error & { position?: string; detail?: string; hint?: string };
        console.error(`  failed: ${relativePath}`);
        console.error(`  ${pgErr.message}`);
        if (pgErr.detail) console.error(`  detail: ${pgErr.detail}`);
        if (pgErr.hint) console.error(`  hint: ${pgErr.hint}`);
        if (pgErr.position) {
          const offset = Number(pgErr.position);
          const line = sql.slice(0, offset).split("\n").length;
          console.error(`  at ${relativePath}:${line}`);
        }
        failed = true;
        break;
      }
    }
  } finally {
    await pool.end();
  }

  if (failed) {
    console.error("Database setup failed.");
    process.exit(1);
  }

  console.log("Database setup complete.");
}

main().catch((err) => {
  console.error("Unexpected error during database setup:");
  console.error(err);
  process.exit(1);
});
