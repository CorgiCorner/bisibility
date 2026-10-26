import "server-only";

import { CLOUD_MIGRATION_PACKAGE_VERSIONS } from "@/lib/migration/package-version";
import { latestFinishedMigration } from "@/lib/queries/migration-compatibility";
import packageJson from "@/package.json";
import { checkRateLimit, rateLimitExceeded } from "./ratelimit";
import { resourceResponse } from "./responses";

export async function getCloudImportCompatibility(req: Request) {
  const limit = await checkRateLimit(req, { kind: "anonymous" });
  if (!limit.success) return rateLimitExceeded(limit);
  return resourceResponse(
    {
      app_version: process.env.APP_VERSION?.trim() || packageJson.version,
      latest_migration: await latestFinishedMigration(),
      schema_versions_supported: CLOUD_MIGRATION_PACKAGE_VERSIONS,
    },
    { headers: limit.headers },
  );
}
