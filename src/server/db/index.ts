import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export { schema };
export type DB = PostgresJsDatabase<typeof schema>;

const g = globalThis as unknown as { __db?: DB };

// Lazy: importing this module (e.g. during `next build`) never opens a connection.
function getDb(): DB {
  return (g.__db ??= drizzle(postgres(process.env.DATABASE_URL!, { max: 5, prepare: false }), { schema, casing: "snake_case" }));
}

export const db = new Proxy({} as DB, { get: (_, p) => Reflect.get(getDb(), p) });
