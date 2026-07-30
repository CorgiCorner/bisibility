import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Role } from "@/lib/generated/prisma/client";
import type { ApiScope, AuthenticatedApiKey, PersonalTokenAuth } from "./auth";
import { requireApiPublicId } from "./public-id";
import { errorResponse } from "./responses";

export const PROJECT_HEADER = "x-bisibility-project";

const SCOPE_RANK = { admin: 3, read: 1, write: 2 } satisfies Record<ApiScope, number>;

// Membership roles map onto the same tiers as token scopes so effective
// access is simply the lower of the two.
const ROLE_RANK: Record<Role, number> = {
  admin: SCOPE_RANK.admin,
  auditor: SCOPE_RANK.read,
  member: SCOPE_RANK.write,
  owner: SCOPE_RANK.admin,
  viewer: SCOPE_RANK.read,
};

const TIER_SCOPES: Record<number, readonly ApiScope[]> = {
  1: ["read"],
  2: ["read", "write"],
  3: ["read", "write", "admin"],
};

function tokenRank(scopes: readonly ApiScope[]) {
  return scopes.reduce((rank, scope) => Math.max(rank, SCOPE_RANK[scope]), SCOPE_RANK.read);
}

export function effectiveScopes(tokenScopes: readonly ApiScope[], role: Role): readonly ApiScope[] {
  return TIER_SCOPES[Math.min(tokenRank(tokenScopes), ROLE_RANK[role])];
}

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

export type PersonalProjectScope = {
  auth: AuthenticatedApiKey;
  role: Role;
};

type ResolveErrorContext = {
  headers: Headers;
  instance: string;
};

function projectSelectionRequired(ctx: ResolveErrorContext) {
  return errorResponse(
    "bad_request",
    `This personal token has access to multiple projects. Pass the target project via the ${PROJECT_HEADER} header or the "project" query parameter.`,
    400,
    { headers: ctx.headers, instance: ctx.instance },
  );
}

function projectNotFound(ctx: ResolveErrorContext) {
  return errorResponse("not_found", "Project not found.", 404, {
    headers: ctx.headers,
    instance: ctx.instance,
  });
}

/**
 * Intersects personal-token and membership scopes; missing membership returns 404.
 */
export async function resolvePersonalProjectScope(
  req: Request,
  url: URL,
  path: string[],
  auth: PersonalTokenAuth,
  ctx: ResolveErrorContext,
): Promise<PersonalProjectScope | { response: Response }> {
  const explicit =
    path[0] === "projects" && path[1]
      ? path[1]
      : (req.headers.get(PROJECT_HEADER) ?? url.searchParams.get("project"));
  let projectRef = explicit;
  if (!projectRef) {
    if (auth.memberships.length !== 1) {
      return { response: projectSelectionRequired(ctx) };
    }
    projectRef = auth.memberships[0].projectId;
  }

  const project = explicit
    ? await prisma.project.findUnique({
        select: projectSelect,
        where: { publicId: requireApiPublicId(projectRef, "prj") },
      })
    : await prisma.project.findUnique({ select: projectSelect, where: { id: projectRef } });
  if (!project) {
    return { response: projectNotFound(ctx) };
  }

  const membership = auth.memberships.find((entry) => entry.projectId === project.id);
  if (!membership) {
    return { response: projectNotFound(ctx) };
  }

  return {
    auth: {
      apiKey: {
        id: auth.token.id,
        name: auth.token.name,
        prefix: auth.token.prefix,
        projectId: project.id,
        scopes: effectiveScopes(auth.token.scopes, membership.role),
      },
      project,
    },
    role: membership.role,
  };
}
