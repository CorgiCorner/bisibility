import "server-only";

import { checkRateLimit, rateLimitExceeded } from "@/lib/api/ratelimit";
import { resourceResponse } from "@/lib/api/responses";
import { CLOUD_MIGRATION_PACKAGE_VERSION } from "@/lib/migration/package-version";
import { latestFinishedMigration } from "@/lib/queries/migration-compatibility";
import packageJson from "@/package.json";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SCHEMA_VERSIONS_SUPPORTED = [CLOUD_MIGRATION_PACKAGE_VERSION] as const;

function packageVersion() {
  return process.env.APP_VERSION?.trim() || packageJson.version;
}

export async function GET(req: NextRequest) {
  const limit = await checkRateLimit(req, { kind: "anonymous" });
  if (!limit.success) {
    return rateLimitExceeded(limit);
  }

  return resourceResponse(
    {
      app_version: packageVersion(),
      latest_migration: await latestFinishedMigration(),
      schema_versions_supported: SCHEMA_VERSIONS_SUPPORTED,
    },
    { headers: limit.headers },
  );
}
