import "server-only";

import { prisma } from "@/lib/db/prisma";
import { NotificationType } from "@/lib/generated/prisma/client";
import { appPath } from "@/lib/routing/app-path";
import { createNotification } from "./create";

export async function notifyProviderNeedsReauth(input: {
  connectionId: string;
  failedAt: Date;
  projectId: string;
  provider: string;
}) {
  const project = await prisma.project.findUnique({
    select: { ownerId: true, publicId: true },
    where: { id: input.projectId },
  });
  if (!project) return;

  const providerLabel = input.provider.toUpperCase();
  const body = `${providerLabel} needs to be reconnected before scheduled analytics sync can resume.`;
  await createNotification(
    project.ownerId,
    input.projectId,
    NotificationType.system,
    "Reconnect analytics provider",
    body,
    {
      href: appPath(project.publicId, "integrations"),
      meta: body,
      provider: input.provider,
    },
    `provider-needs-reauth:${input.connectionId}:${input.failedAt.toISOString()}`,
  );
}
