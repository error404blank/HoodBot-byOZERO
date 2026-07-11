import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Lazily initialised so the module can be imported at build time without
// DATABASE_URL being present. The actual Pool + db are created on first use.
let _pool: Pool | undefined;
let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;

function getPool(): Pool {
  if (!_pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL environment variable is required");
    _pool = new Pool({ connectionString: url });
  }
  return _pool;
}

export function getDb() {
  if (!_db) {
    _db = drizzle(getPool(), { schema });
  }
  return _db;
}

// Convenience proxy so existing code can keep `import { db } from "@/src/db"`
// and call db.select(...) etc. — the proxy forwards every property access to
// the lazily-created Drizzle instance.
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    return (getDb() as Record<string | symbol, unknown>)[prop];
  },
});

export const pool = new Proxy({} as Pool, {
  get(_target, prop) {
    return (getPool() as Record<string | symbol, unknown>)[prop];
  },
});
