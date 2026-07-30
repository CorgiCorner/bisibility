import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { ProjectWriteMode } from "@/lib/deployment/project-write-mode";
import { ProviderStatus, type Role } from "@/lib/generated/prisma/client";
import { asProjectRef, type ProjectRef } from "@/lib/routing/app-path";
import { cache } from "react";
import { getQueryActor } from "./_auth";
import { deriveWorkspaceState, type WorkspaceDataState } from "./workspace-state";

export type WorkspacePlan = "free" | "pro";

export type WorkspaceSummary = {
  /** Public project ID for client navigation and action inputs. */
  id: string;
  /** Alias kept for established route helpers. */
  publicId: ProjectRef;
  writeMode: ProjectWriteMode;
  name: string;
  domain: string;
  keywordCount: number;
  isSample: boolean;
  latestCompletedRankCheckAt: Date | null;
  state?: WorkspaceDataState;
  role: Role;
  plan: WorkspacePlan;
};

/** Workspace plan is derived from provider connectivity until it has a dedicated column. */
const perRequestCache: typeof cache = typeof cache === "function" ? cache : (fn) => fn;

export const listWorkspaces = perRequestCache(async (): Promise<WorkspaceSummary[]> => {
  const actor = await getQueryActor();
  const projectIds = (actor.memberships ?? []).map((m) => m.projectId);
  if (projectIds.length === 0) {
    return [];
  }

  const roleByProject = new Map((actor.memberships ?? []).map((m) => [m.projectId, m.role]));
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      _count: { select: { keywords: true } },
      domain: true,
      id: true,
      isSample: true,
      keywords: {
        select: {
          rankChecks: {
            orderBy: { checkedAt: "desc" },
            select: { checkedAt: true },
            take: 1,
            where: { status: "completed" },
          },
        },
        where: { rankChecks: { some: { status: "completed" } } },
      },
      name: true,
      providerConnections: {
        select: { id: true },
        where: { status: ProviderStatus.connected },
      },
      publicId: true,
      writeMode: true,
    },
    where: { id: { in: projectIds } },
  });

  return projects.map((project) => {
    const latestCompletedRankCheckAt =
      project.keywords
        .flatMap((keyword) => keyword.rankChecks.map((check) => check.checkedAt))
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

    return {
      domain: project.domain,
      id: asProjectRef(project.publicId),
      isSample: project.isSample,
      keywordCount: project._count.keywords,
      latestCompletedRankCheckAt,
      name: project.name,
      plan: project.providerConnections.length > 0 ? "pro" : "free",
      publicId: asProjectRef(project.publicId),
      role: roleByProject.get(project.id) ?? "viewer",
      writeMode: project.writeMode,
      state: deriveWorkspaceState({
        hasCompletedCheck: Boolean(latestCompletedRankCheckAt),
        keywordCount: project._count.keywords,
      }),
    };
  });
});
