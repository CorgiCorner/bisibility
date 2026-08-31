import "server-only";

import { type ApiScope, tierFromScopes } from "@/lib/api/scope-policy";
import { prisma } from "@/lib/db/prisma";
import { createUserDateTimeFormatter, type DateFormatPreference } from "@/lib/format/user-datetime";
import { requireReadableProject } from "@/lib/queries/_auth";
import { activeApiKeyWhere } from "@/lib/queries/api-key-settings";
import { getRequestProjectDefaults } from "@/lib/queries/workspace-request-data";

export type InstallApiKeySummary = {
  createdLabel: string;
  maskedValue: string;
  scopeLabel: string;
};

// Keep the query layer independent while matching the Settings scope labels.
function apiKeyScopeLabel(scope: ApiScope) {
  if (scope === "read") return "Read only";
  if (scope === "write") return "Read and write";
  return "Full access";
}

export async function getInstallApiKeySummary(
  projectRef: string,
  options: { dateFormat?: DateFormatPreference; now?: Date } = {},
): Promise<InstallApiKeySummary | null> {
  const { project } = await requireReadableProject(projectRef);
  const now = options.now ?? new Date();
  const [apiKey, defaults] = await Promise.all([
    prisma.apiKey.findFirst({
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, prefix: true, scopes: true },
      take: 1,
      where: { projectId: project.id, ...activeApiKeyWhere(now) },
    }),
    getRequestProjectDefaults(project.id),
  ]);

  if (!apiKey) return null;

  const dateTime = createUserDateTimeFormatter({
    dateFormat: options.dateFormat,
    timezone: defaults?.timezone ?? "UTC",
  });

  return {
    createdLabel: `created ${dateTime.formatDate(apiKey.createdAt)}`,
    maskedValue: `${apiKey.prefix}******`,
    scopeLabel: apiKeyScopeLabel(tierFromScopes(apiKey.scopes)),
  };
}
