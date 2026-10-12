import "dotenv/config";

import { defineConfig } from "prisma/config";

const datasourceUrl =
  process.env.DIRECT_URL ??
  process.env.DATABASE_URL ??
  "postgresql://bisibility:bisibility@localhost:5432/bisibility";

export default defineConfig({
  schema: "prisma/schema",
  migrations: {
    path: process.env.BISIBILITY_MIGRATIONS_PATH ?? "prisma/migrations",
    seed: "node --experimental-transform-types --import ./lib/temporal/register-loader.mjs prisma/seed.ts",
  },
  datasource: { url: datasourceUrl },
});
