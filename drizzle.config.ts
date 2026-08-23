import { defineConfig } from "drizzle-kit";

/**
 * Migrations versionadas em arquivo.
 *
 * A versão anterior garantia o schema com `CREATE TABLE IF NOT EXISTS` e
 * introspecção `PRAGMA` a **cada requisição**. Isso escondia divergência entre
 * o que o código esperava e o que o banco tinha, e não sabia remover nem
 * renomear coluna. Aqui o schema tem histórico e é aplicado por comando.
 */
export default defineConfig({
  out: "./server/db/migrations",
  schema: "./server/db/schema/index.ts",
  dialect: "sqlite",
  casing: "snake_case",
});
