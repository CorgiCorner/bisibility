import "server-only";

import {
  type AgentReportResource,
  type AgentReportSummary,
  agentReportListSchema,
  externalAgentReportSchema,
} from "@/lib/agent-reports/model";
import {
  createAgentReport,
  getAgentReport,
  listAgentReportPage,
} from "@/lib/agent-reports/service";
import { AuthorizationError, authorize } from "@/lib/auth/authorize";
import { assertProjectWritable } from "@/lib/deployment/project-write-mode";
import { projectContextSchema } from "@/lib/project-context/model";
import { getProjectContext, saveProjectContext } from "@/lib/project-context/service";
import { type ApiContext, notFound, requireApiActor } from "./context";
import { ApiForbiddenError, ApiInputError } from "./errors";
import { decodeCursor, encodeCursor } from "./pagination";
import { requireApiPublicId } from "./public-id";
import { listResponse, resourceResponse } from "./responses";
import { objectBody, scopedProject, snakeizeKeys } from "./surface";

function access(ctx: ApiContext, mutation: boolean) {
  try {
    authorize(requireApiActor(ctx), mutation ? "update" : "read", {
      projectId: ctx.auth.project.id,
      type: "project",
    });
  } catch (error) {
    if (error instanceof AuthorizationError) throw new ApiForbiddenError(error.message);
    throw error;
  }
  if (mutation) assertProjectWritable(ctx.auth.project);
}

async function boundedBody(ctx: ApiContext) {
  const raw = await ctx.req.text();
  if (new TextEncoder().encode(raw).byteLength > 320 * 1024)
    throw new ApiInputError("Request body exceeds 320 KiB.");
  return JSON.parse(raw);
}

function reportResponse(report: AgentReportResource | AgentReportSummary) {
  const { createdAt, ...rest } = report;
  // Analysis JSON belongs to the report producer, including its key casing.
  return { ...rest, created_at: createdAt };
}

export async function projectContextRoute(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;
  access(ctx, ctx.method === "PATCH");
  if (ctx.method === "GET")
    return resourceResponse(snakeizeKeys(await getProjectContext(ctx.auth.project.id)), {
      headers: ctx.headers,
    });
  const raw = await boundedBody(ctx);
  const { agent_rules, ...fields } = objectBody(raw);
  const input = projectContextSchema.parse({ ...fields, agentRules: agent_rules });
  return resourceResponse(snakeizeKeys(await saveProjectContext(ctx.auth.project.id, input)), {
    headers: ctx.headers,
  });
}

export async function agentReportsRoute(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;
  access(ctx, ctx.method === "POST");
  if (ctx.method === "POST") {
    const input = externalAgentReportSchema.parse(await boundedBody(ctx));
    const report = await createAgentReport({
      ...input,
      projectId: ctx.auth.project.id,
      actorId: ctx.actorId,
    });
    return resourceResponse(reportResponse(report), { headers: ctx.headers, status: 201 });
  }
  const input = agentReportListSchema.parse({
    kind: ctx.url.searchParams.get("kind") ?? undefined,
    limit: ctx.url.searchParams.get("limit") ?? undefined,
  });
  const cursor = decodeCursor(ctx.url.searchParams.get("cursor"), "agr");
  const after = cursor
    ? await getAgentReport({ projectId: ctx.auth.project.id, reportId: cursor.public_id })
    : null;
  if (
    cursor &&
    (!after || after.createdAt !== cursor.t || (input.kind && after.kind !== input.kind))
  ) {
    throw new ApiInputError(
      "Cursor does not match this project and report kind.",
      "invalid_cursor",
    );
  }
  const result = await listAgentReportPage({
    ...input,
    projectId: ctx.auth.project.id,
    after: after ?? undefined,
  });
  const last = result.reports.at(-1);
  const nextCursor =
    result.hasMore && last
      ? encodeCursor({ publicId: last.id, timestamp: new Date(last.createdAt) }, "agr")
      : null;
  return listResponse(result.reports.map(reportResponse), nextCursor, { headers: ctx.headers });
}

export async function agentReportRoute(ctx: ApiContext, projectId: string, reportId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;
  requireApiPublicId(reportId, "agr");
  access(ctx, false);
  const report = await getAgentReport({ projectId: ctx.auth.project.id, reportId });
  return report
    ? resourceResponse(reportResponse(report), { headers: ctx.headers })
    : notFound(ctx, "Agent report not found.");
}
