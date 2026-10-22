import type { Prisma } from "@/lib/generated/prisma/client";
import { asProjectRef } from "@/lib/routing/app-path";
import { projectRunAiPath } from "@/lib/routing/project-runs-path";
import { aiRunState } from "./ai-run-state";
import type { ProjectRunAi } from "./project-run";
import type { ProjectRunsPresentationProject } from "./project-runs-presentation";

export const aiRunSelect = {
  id: true,
  publicId: true,
  state: true,
  createdAt: true,
  plannedAt: true,
  finishedAt: true,
} satisfies Prisma.AiTrackingRunSelect;
export type AiRunRecord = Prisma.AiTrackingRunGetPayload<{ select: typeof aiRunSelect }>;
export type AiRunSummary = {
  runId: string;
  total: number;
  completed: number;
  startedAt: Date | null;
  known: number;
  costCents: string | null;
  reason?: string | null;
};

export function aiProjectRun(
  row: AiRunRecord,
  project: ProjectRunsPresentationProject,
  summary?: AiRunSummary,
): ProjectRunAi {
  const reason = summary?.reason ?? null;
  const policy = aiRunState(row.state, row.finishedAt, reason);
  const total = summary?.total ?? 0;
  const known = summary?.known ?? 0;
  const amount =
    summary?.costCents === null || summary?.costCents === undefined
      ? null
      : Number(summary.costCents);
  return {
    id: row.publicId,
    kind: "ai",
    lifecycle: policy.lifecycle,
    attention: policy.attention,
    cost: {
      actualCents: amount,
      estimatedCents: null,
      state: total > 0 && known === total ? "confirmed" : known > 0 ? "partial" : "unknown",
    },
    capabilities: { cancel: false, pause: false, resume: false, retry: false, viewDetails: true },
    details: { state: row.state, reason },
    href: projectRunAiPath(asProjectRef(project.publicId), row.publicId),
    project: {
      name: project.name,
      publicId: project.publicId as ProjectRunAi["project"]["publicId"],
    },
    scope: { kind: "ai", description: null },
    progress: { completed: summary?.completed ?? 0, total, unit: "samples" },
    timestamps: {
      createdAt: row.createdAt.toISOString(),
      startedAt: summary?.startedAt?.toISOString() ?? null,
      finishedAt: row.finishedAt?.toISOString() ?? null,
      plannedFor: row.plannedAt?.toISOString() ?? null,
    },
    title: { kind: "ai" },
  };
}
