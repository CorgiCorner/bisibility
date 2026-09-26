import { SOURCES_BY_SURFACE } from "@/lib/provider-usage/surface";
import { Prisma } from "./store/sql";

/** Keep legacy grouping aligned with the authenticated source mapping. */
export const legacySourceSurfaceSql = Prisma.sql`CASE WHEN source IN (${Prisma.join(
  SOURCES_BY_SURFACE.programmatic,
)}) THEN 'programmatic' ELSE 'app' END`;
