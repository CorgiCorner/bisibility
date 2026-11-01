import "server-only";

import { prisma } from "@/lib/db/prisma";
import { NotificationType } from "@/lib/generated/prisma/client";
import { appPath } from "@/lib/routing/app-path";
import { createNotification } from "./create";

type ReauthReason = "permission" | "scope";

// Reconnecting does not restore a revoked property grant, so that case names the real fix.
function reauthCopy(providerLabel: string, reason?: ReauthReason) {
  if (reason === "permission") {
    return {
      body: `${providerLabel} can no longer read the selected property. Grant the connected account access to it, or reconnect and choose another property, before scheduled analytics sync can resume.`,
      title: "Check analytics property access",
    };
  }
  return {
    body:
      reason === "scope"
        ? `${providerLabel} needs to be reconnected with the requested permissions approved before scheduled analytics sync can resume.`
        : `${providerLabel} needs to be reconnected before scheduled analytics sync can resume.`,
    title: "Reconnect analytics provider",
  };
}

export async function notifyProviderNeedsReauth(input: {
  connectionId: string;
  failedAt: Date;
  projectId: string;
  provider: string;
  reason?: ReauthReason;
}) {
  const project = await prisma.project.findUnique({
    select: { ownerId: true, publicId: true },
    where: { id: input.projectId },
  });
  if (!project) return;

  const { body, title } = reauthCopy(input.provider.toUpperCase(), input.reason);
  await createNotification(
    project.ownerId,
    input.projectId,
    NotificationType.system,
    title,
    body,
    {
      href: appPath(project.publicId, "providers"),
      meta: body,
      provider: input.provider,
    },
    `provider-needs-reauth:${input.connectionId}:${input.failedAt.toISOString()}`,
  );
}
