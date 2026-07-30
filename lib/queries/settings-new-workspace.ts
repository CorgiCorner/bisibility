import "server-only";

import { prisma } from "@/lib/db/prisma";
import { parsePublicId } from "@/lib/db/public-id";
import { createUserDateTimeFormatter, type DateTimePreferences } from "@/lib/format/user-datetime";
import { requireReadableProject } from "./_auth";
import { activeApiKeyWhere } from "./api-key-settings";
import { initials } from "./settings-members";
import type { NewWorkspaceSettings } from "./settings-types";

function labelFromDate(
  prefix: string,
  date: Date | null | undefined,
  dateTime: ReturnType<typeof createUserDateTimeFormatter>,
) {
  return date ? `${prefix} ${dateTime.formatDate(date)}` : `${prefix} never`;
}

function requiredPublicId(value: string | null, prefix: "key", resource: string) {
  if (!value || parsePublicId(value)?.prefix !== prefix) {
    throw new Error(`${resource} public ID is not available.`);
  }
  return value;
}

export async function getNewWorkspaceSettings(
  projectId: string,
  options: { now?: Date; preferences?: DateTimePreferences } = {},
): Promise<NewWorkspaceSettings> {
  const { project } = await requireReadableProject(projectId);
  const dateTime = createUserDateTimeFormatter(options.preferences);
  const now = options.now ?? new Date();
  const fullProject = await prisma.project.findUnique({
    include: {
      _count: { select: { members: true } },
      apiKeys: { orderBy: { createdAt: "desc" }, take: 1, where: activeApiKeyWhere(now) },
      members: { include: { user: true }, orderBy: { createdAt: "asc" }, take: 1 },
    },
    where: { id: project.id },
  });
  if (!fullProject) throw new Error("Project not found.");
  const devKey = fullProject.apiKeys[0];
  const owner = fullProject.members[0]?.user;
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  return {
    devKey: devKey
      ? {
          createdLabel: `${labelFromDate("created", devKey.createdAt, dateTime)}${devKey.lastUsedAt ? "" : " · never used"}`,
          id: requiredPublicId(devKey.publicId, "key", "API key"),
          isNew: devKey.createdAt >= oneDayAgo,
          maskedValue: devKey.prefix,
          name: devKey.name,
        }
      : null,
    memberCount: fullProject._count.members,
    owner: {
      email: owner?.email ?? "",
      initials: owner ? initials(owner.name) : "",
      name: owner?.name ?? "",
    },
    workspace: {
      domain: fullProject.domain,
      name: fullProject.name,
      projectId: fullProject.publicId,
    },
  };
}
