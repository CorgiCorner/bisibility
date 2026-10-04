import "server-only";

import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id-resources";
import { assertProjectWritable } from "@/lib/deployment/project-write-mode";
import type { AgentReport } from "@/lib/generated/prisma/client";
import {
  type AgentReportInput,
  type AgentReportResource,
  type AgentReportSummary,
  agentReportIdSchema,
  agentReportListSchema,
  agentReportSchema,
} from "./model";

function resource(row: AgentReport): AgentReportResource {
  const { body, provenance, kind, title } = agentReportSchema.parse({
    body: row.body,
    provenance: row.provenance,
    kind: row.kind,
    title: row.title,
  });
  return {
    id: row.publicId,
    body,
    provenance,
    kind,
    title,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createAgentReport(
  input: AgentReportInput & { projectId: string; actorId?: string | null },
) {
  const { projectId, actorId, ...payload } = input;
  const data = agentReportSchema.parse(payload);
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { id: true, writeMode: true },
  });
  assertProjectWritable(project);
  return resource(
    await prisma.agentReport.create({
      data: { ...data, projectId, publicId: makePublicId("agr"), createdById: actorId ?? null },
    }),
  );
}

export async function listAgentReports(input: {
  projectId: string;
  kind?: string;
  limit?: number;
  before?: string;
}): Promise<AgentReportSummary[]> {
  const { kind, limit, before } = agentReportListSchema.parse(input);
  const rows = await prisma.agentReport.findMany({
    where: {
      projectId: input.projectId,
      ...(kind ? { kind } : {}),
      ...(before ? { createdAt: { lt: new Date(before) } } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { publicId: "desc" }],
    take: limit,
    select: { publicId: true, kind: true, title: true, createdAt: true },
  });
  return rows.map((row) => ({
    id: row.publicId,
    kind: row.kind,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getAgentReport(input: { projectId: string; reportId: string }) {
  const publicId = agentReportIdSchema.parse(input.reportId);
  const row = await prisma.agentReport.findFirst({
    where: { projectId: input.projectId, publicId },
  });
  return row ? resource(row) : null;
}

export function findAgentReport(input: { projectId: string; publicId: string }) {
  return getAgentReport({ projectId: input.projectId, reportId: input.publicId });
}

export async function listAgentReportPage(input: {
  projectId: string;
  kind?: string;
  limit?: number;
  after?: { id: string; createdAt: string };
}) {
  const { kind, limit } = agentReportListSchema.parse(input);
  const rows = await prisma.agentReport.findMany({
    where: {
      projectId: input.projectId,
      ...(kind ? { kind } : {}),
      ...(input.after
        ? {
            OR: [
              { createdAt: { lt: new Date(input.after.createdAt) } },
              { createdAt: new Date(input.after.createdAt), publicId: { lt: input.after.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { publicId: "desc" }],
    take: limit + 1,
    select: { publicId: true, kind: true, title: true, createdAt: true },
  });
  return {
    hasMore: rows.length > limit,
    reports: rows.slice(0, limit).map((row) => ({
      id: row.publicId,
      kind: row.kind,
      title: row.title,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}
