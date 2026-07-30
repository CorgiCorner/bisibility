import "server-only";

import { prisma } from "@/lib/db/prisma";
import { createUserDateTimeFormatter, type DateTimePreferences } from "@/lib/format/user-datetime";
import { requireReadableProject } from "./_auth";

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
  options: { preferences?: DateTimePreferences } = {},
): Promise<IngestHookListItem[]> {
  const { project } = await requireReadableProject(projectId);
  const dateTime = createUserDateTimeFormatter(options.preferences);
  const hooks = await prisma.ingestHook.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      createdAt: true,
      disabled: true,
      label: true,
      lastUsedAt: true,
      publicId: true,
    },
    where: { projectId: project.id },
  });

  return hooks.map((hook) => ({
    createdLabel: labelFromDate("created", hook.createdAt, dateTime),
    disabled: hook.disabled,
    id: hook.publicId,
    label: hook.label,
    lastUsedLabel: labelFromDate("last used", hook.lastUsedAt, dateTime),
  }));
}
