import "server-only";

import { prisma } from "@/lib/db/prisma";
import { readDemoConfig } from "@/lib/demo/config";
import { loadConfiguredDemoActor } from "@/lib/demo/identity";

type StreamSession = { session: { id: string }; user: { id: string } };

// Never use React request caches here: a stream may outlive its session or membership.
export async function canReadStream(session: StreamSession, projectId: string) {
  if (readDemoConfig().kind !== "disabled" && !(await loadConfiguredDemoActor(session.user.id))) {
    return false;
  }
  const active = await prisma.session.findFirst({
    select: { id: true },
    where: {
      expiresAt: { gt: new Date() },
      id: session.session.id,
      userId: session.user.id,
      user: { is: { deactivatedAt: null, memberships: { some: { projectId } } } },
    },
  });
  return active !== null;
}
