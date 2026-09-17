import "server-only";

import { type ApiScope, tierFromScopes } from "@/lib/api/scope-policy";
import { prisma } from "@/lib/db/prisma";
import { requireReadableProject } from "@/lib/queries/_auth";
import { activeApiKeyWhere } from "@/lib/queries/api-key-settings";

export type InstallApiKeySummary = {
  createdAt: Date;
  maskedValue: string;
  scope: ApiScope;
};

export async function getInstallApiKeySummary(
  projectRef: string,
  options: { now?: Date } = {},
): Promise<InstallApiKeySummary | null> {
  const { project } = await requireReadableProject(projectRef);
  const now = options.now ?? new Date();
  const apiKey = await prisma.apiKey.findFirst({
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, prefix: true, scopes: true },
    take: 1,
    where: { projectId: project.id, ...activeApiKeyWhere(now) },
  });

  if (!apiKey) return null;

  return {
    createdAt: apiKey.createdAt,
    maskedValue: `${apiKey.prefix}******`,
    scope: tierFromScopes(apiKey.scopes),
  };
}

export async function getInstallHasKeywordAndCheck(projectRef: string): Promise<boolean> {
  const { project } = await requireReadableProject(projectRef);
  const check = await prisma.rankCheck.findFirst({
    select: { id: true },
    where: {
      keyword: { archivedAt: null, projectId: project.id },
      status: "completed",
    },
  });
  return Boolean(check);
}
