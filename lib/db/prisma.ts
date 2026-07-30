// Must run before any process.env read below - fills runtime env on platforms
// that omit it at request time (no-op where the platform injects env itself).
import "@/lib/deployment/runtime-env.generated";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { databasePoolConfig, databaseSchemaFromUrl } from "./pool-config";
import { withPublicIdWrites } from "./public-id-writes";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: ReturnType<typeof createPrismaClient>;
};

// Keep test, build-discovery, and offline worker imports side-effect free; an actual
// query without a deployment URL still attempts the local development database.
const datasourceUrl =
  process.env.DATABASE_URL ?? "postgresql://bisibility:bisibility@localhost:5432/bisibility";

function createPrismaClient() {
  return withPublicIdWrites(
    new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: datasourceUrl, ...databasePoolConfig(undefined, datasourceUrl) },
        { schema: databaseSchemaFromUrl(datasourceUrl) },
      ),
    }),
  );
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
