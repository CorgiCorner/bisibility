import { prisma } from "@/lib/db/prisma";
import { isPublicIdOfType } from "@/lib/db/public-id-resources";
export function resolveTrackingConnection(projectId: string, publicId: string) {
  if (!isPublicIdOfType(publicId, "conn")) throw new Error("Provider connection not found.");
  return prisma.providerConnection.findFirst({
    where: { projectId, publicId },
    select: { id: true, publicId: true, provider: true, enabled: true, status: true },
  });
}
