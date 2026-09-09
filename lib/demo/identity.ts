import "server-only";

import { prisma } from "@/lib/db/prisma";
import { demoIdentityAllowed } from "./auth-policy";
import { readOnlyDemoConfig } from "./config";

export async function loadDemoIdentity() {
  const config = readOnlyDemoConfig();
  if (!config) return null;
  const user = await prisma.user.findUnique({
    where: { publicId: config.userPublicId },
    include: { memberships: { include: { project: { select: { publicId: true } } } } },
  });
  return demoIdentityAllowed(user, config.projectPublicId) ? user : null;
}
