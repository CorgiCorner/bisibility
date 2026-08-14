import "server-only";

import { prisma } from "@/lib/db/prisma";
import { createUserDateTimeFormatter, type DateFormatPreference } from "@/lib/format/user-datetime";
import { requireReadableProject } from "./_auth";
import { getRequestProjectDefaults } from "./workspace-request-data";

export type IngestHookListItem = {
  createdLabel: string;
  disabled: boolean;
  id: string;
  label: string;
  lastUsedLabel: string;
};

function labelFromDate(
  prefix: string,
  date: Date | null | undefined,
  dateTime: ReturnType<typeof createUserDateTimeFormatter>,
) {
  if (!date) {
    return `${prefix} never`;
  }
  return `${prefix} ${dateTime.formatDate(date)}`;
}

export async function getIngestHooks(
  projectId: string,
  options: { dateFormat?: DateFormatPreference } = {},
): Promise<IngestHookListItem[]> {
  const { project } = await requireReadableProject(projectId);
  const [defaults, hooks] = await Promise.all([
    getRequestProjectDefaults(project.id),
    prisma.ingestHook.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        createdAt: true,
        disabled: true,
        label: true,
        lastUsedAt: true,
        publicId: true,
      },
      where: { projectId: project.id },
    }),
  ]);
  const dateTime = createUserDateTimeFormatter({
    dateFormat: options.dateFormat,
    timezone: defaults?.timezone ?? "UTC",
  });

  return hooks.map((hook) => ({
    createdLabel: labelFromDate("created", hook.createdAt, dateTime),
    disabled: hook.disabled,
    id: hook.publicId,
    label: hook.label,
    lastUsedLabel: labelFromDate("last used", hook.lastUsedAt, dateTime),
  }));
}
