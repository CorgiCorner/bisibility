import "server-only";

import { type Actor, authorize } from "@/lib/auth/authorize";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { parsePublicId } from "@/lib/db/public-id";
import { asProjectRef, type ProjectRef } from "@/lib/routing/app-path";
import { notFound } from "next/navigation";
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

  return {
    id: session.user.id,
    memberships: user?.memberships ?? [],
    role: user?.role ?? null,
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
