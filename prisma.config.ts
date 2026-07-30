import "dotenv/config";

import { defineConfig } from "prisma/config";

const datasourceUrl =
  process.env.DIRECT_URL ??
  process.env.DATABASE_URL ??
  "postgresql://bisibility:bisibility@localhost:5432/bisibility";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node --experimental-strip-types prisma/seed.ts",
  },
  datasource: { url: datasourceUrl },
});
