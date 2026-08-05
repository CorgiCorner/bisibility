import "server-only";

import { type Actor, authorize } from "@/lib/auth/authorize";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { parsePublicId } from "@/lib/db/public-id";
import { asProjectRef, type ProjectRef } from "@/lib/routing/app-path";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

// Collapse repeated RSC session and membership reads per request without caching
// per-query authorization or auditing; plain runtimes use identity.
const perRequestCache: typeof cache = typeof cache === "function" ? cache : (fn) => fn;

export const getQuerySession = perRequestCache(requireSession);

export const getQueryActor = perRequestCache(async (): Promise<Actor> => {
  const session = await getQuerySession();
  const user = await prisma.user.findUnique({
    select: {
      memberships: {
        orderBy: { createdAt: "asc" },
        select: { projectId: true, role: true },
      },
      role: true,
    },
    where: { id: session.user.id },
  });

  // single primary - null means the row is gone, not a lagging replica; revisit before adding read replicas.
  // A session whose user row is gone is not an actor with no memberships - treating it as one
  // renders "not found" on every project and hides the real cause. End the session instead.
  if (!user) {
    try {
      await prisma.session.deleteMany({ where: { userId: session.user.id } });
    } catch {
      console.error("[auth] Failed to clean up a session for a missing account.");
    }
    redirect("/login");
  }

  return {
    id: session.user.id,
    memberships: user.memberships,
    role: user.role,
  };
});

const loadReadableProject = perRequestCache(async (projectId: string) => {
  if (parsePublicId(projectId)?.prefix !== "prj") {
    throw new Error("Project not found.");
  }

  const actor = await getQueryActor();
  const project = await prisma.project.findFirst({
    select: {
      budgetCapCents: true,
      domain: true,
      id: true,
      isSample: true,
      name: true,
      ownerId: true,
      publicId: true,
      trackingScope: true,
      writeMode: true,
    },
    where: { publicId: projectId },
  });
  if (!project) {
    throw new Error("Project not found.");
  }

  return { actor, project };
});

export async function requireReadableProject(projectId: string) {
  const { actor, project } = await loadReadableProject(projectId);
  authorize(actor, "read", { projectId: project.id, type: "project" });
  return { actor, project };
}

export const resolveProjectAccess = perRequestCache(
  async (
    ref: string,
  ): Promise<{
    isSample: boolean;
    projectId: string;
    publicId: ProjectRef;
    mode: "member";
  }> => {
    // A ref that is not a project publicId is a construction bug, not a permission problem.
    // Short-circuit before the query so the 404 that reaches the user means "no access".
    if (parsePublicId(ref)?.prefix !== "prj") {
      notFound();
    }

    const actor = await getQueryActor();
    const project = await prisma.project.findUnique({
      select: { id: true, isSample: true, publicId: true },
      where: { publicId: ref },
    });
    if (!project || !actor.memberships?.some((membership) => membership.projectId === project.id)) {
      notFound();
    }

    return {
      isSample: project.isSample,
      mode: "member",
      projectId: project.id,
      publicId: asProjectRef(project.publicId),
    };
  },
);
