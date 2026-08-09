import "server-only";

import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { createProjectSchema, domainSchema } from "@/lib/schemas/project";
import { projectAuditResource } from "./audit-resources";
import type { ApiContext, PersonalApiContext } from "./context";
import { forbidden, projectMatches } from "./context";
import { decodeCursor, encodeCursor, parseLimit, splitPage } from "./pagination";
import { createProjectRecord } from "./project-service";
import { requireApiPublicId } from "./public-id";
import { ProjectLimitExceededError } from "./resource-limits";
import { projectResource } from "./resources";
import { errorResponse, listResponse, resourceResponse } from "./responses";
import { objectBody, parseApiInput, readJsonBody } from "./surface";

const projectSelect = {
  createdAt: true,
  domain: true,
  id: true,
  name: true,
  ownerId: true,
  publicId: true,
  updatedAt: true,
  writeMode: true,
} as const;

const apiCreateProjectSchema = createProjectSchema.extend({ domain: domainSchema });

const projectPatchSchema = createProjectSchema
  .pick({ domain: true, name: true })
  .extend({ domain: domainSchema })
  .partial()
  .refine((value) => value.domain !== undefined || value.name !== undefined, {
    message: "domain or name is required.",
  });

export function listProjects(ctx: ApiContext) {
  return listResponse([projectResource(ctx.auth.project)], null, { headers: ctx.headers });
}

// Personal-token variant: every project the user is a member of, paginated.
export async function listProjectsForUser(ctx: PersonalApiContext) {
  const limit = parseLimit(ctx.url, 50, 200);
  const cursor = decodeCursor(ctx.url.searchParams.get("cursor"), "prj");

  const projects = await prisma.project.findMany({
    orderBy: [{ createdAt: "desc" }, { publicId: "desc" }],
    select: projectSelect,
    take: limit + 1,
    where: {
      members: { some: { userId: ctx.auth.user.id } },
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: new Date(cursor.t) } },
              { createdAt: new Date(cursor.t), publicId: { lt: cursor.public_id } },
            ],
          }
        : {}),
    },
  });
  const { nextCursor, page } = splitPage(projects, limit, (project) =>
    encodeCursor(
      {
        publicId: requireApiPublicId(project.publicId ?? "", "prj"),
        timestamp: project.createdAt,
      },
      "prj",
    ),
  );

  return listResponse(page.map(projectResource), nextCursor, { headers: ctx.headers });
}

// Personal-token variant of project creation; the router has already checked
// the token's write tier. Project keys keep the 403 in createProject below.
export async function createProjectForUser(ctx: PersonalApiContext) {
  const body = await readJsonBody(ctx);
  const data = parseApiInput(apiCreateProjectSchema, objectBody(body));
  try {
    const project = await createProjectRecord(data, ctx.auth.user.id);
    return resourceResponse(projectResource(project), { headers: ctx.headers, status: 201 });
  } catch (error) {
    if (!(error instanceof ProjectLimitExceededError)) throw error;
    return errorResponse("forbidden", "Project limit reached for this account.", 403, {
      headers: ctx.headers,
      instance: ctx.instance,
    });
  }
}

export function getProject(ctx: ApiContext, projectId: string) {
  if (!projectMatches(ctx.auth, projectId)) {
    return forbidden(ctx, "API key is not scoped to this project.");
  }

  return resourceResponse(projectResource(ctx.auth.project), { headers: ctx.headers });
}

export async function createProject(ctx: ApiContext) {
  return forbidden(ctx, "Project-scoped API keys cannot create projects.");
}

export async function updateProject(ctx: ApiContext, projectId: string) {
  if (!projectMatches(ctx.auth, projectId))
    return forbidden(ctx, "API key is not scoped to this project.");

  const body = await readJsonBody(ctx);
  const data = parseApiInput(projectPatchSchema, objectBody(body));
  const before = await prisma.project.findUnique({
    select: projectSelect,
    where: { id: ctx.auth.project.id },
  });
  if (!before) return forbidden(ctx, "API key is not scoped to this project.");

  const updated = await prisma.project.update({
    data: { domain: data.domain, name: data.name },
    select: projectSelect,
    where: { id: before.id },
  });

  await writeAudit({
    action: "project.update",
    actorId: ctx.actorId ?? null,
    after: projectAuditResource(updated),
    before: projectAuditResource(before),
    projectId: before.id,
    targetId: requireApiPublicId(before.publicId ?? "", "prj"),
    targetType: "project",
  });

  return resourceResponse(projectResource(updated), { headers: ctx.headers });
}

export async function deleteProject(ctx: ApiContext, projectId: string) {
  if (!projectMatches(ctx.auth, projectId))
    return forbidden(ctx, "API key is not scoped to this project.");

  const before = await prisma.project.findUnique({
    select: projectSelect,
    where: { id: ctx.auth.project.id },
  });
  if (!before) return forbidden(ctx, "API key is not scoped to this project.");
  await prisma.$transaction(async (tx) => {
    await writeAudit(
      {
        action: "project.delete",
        actorId: ctx.actorId ?? null,
        before: projectAuditResource(before),
        projectId: before.id,
        targetId: requireApiPublicId(before.publicId ?? "", "prj"),
        targetType: "project",
      },
      tx,
    );
    await tx.project.delete({ where: { id: before.id } });
  });

  return resourceResponse(projectResource(before), { headers: ctx.headers });
}

export { getProjectDefaults, updateProjectDefaults } from "./project-defaults";
