import "server-only";

import { getTeamAccessFor } from "@/lib/queries/team";
import {
  changeTeamMemberRole,
  inviteTeamMember,
  removeTeamMember,
  resendTeamInvite as resendTeamInviteRecord,
  revokeTeamInvite as revokeTeamInviteRecord,
} from "@/lib/team/service";
import { z } from "zod";
import { type ApiContext, apiMutationContext, requireApiActor } from "./context";
import { paginateArray } from "./pagination";
import { listResponse, resourceResponse } from "./responses";
import {
  objectBody,
  parseApiInput,
  readJsonBody,
  runDomain,
  scopedProject,
  snakeizeKeys,
} from "./surface";

const inviteSchema = z.object({
  email: z.string().trim().max(320).pipe(z.email()),
  projectId: z.string().trim().min(1).max(120),
  role: z.enum(["admin", "member", "viewer"]),
});
const memberRoleSchema = z.object({ role: z.enum(["admin", "member", "viewer"]) });

export async function listTeamMembers(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;

  const view = await runDomain(() => getTeamAccessFor(requireApiActor(ctx), projectId));
  const { nextCursor, page } = paginateArray(ctx.url, view.members);

  return listResponse(page.map(snakeizeKeys), nextCursor, { headers: ctx.headers });
}

export async function listTeamInvites(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;

  const view = await runDomain(() => getTeamAccessFor(requireApiActor(ctx), projectId));
  const { nextCursor, page } = paginateArray(ctx.url, view.pendingInvites);

  return listResponse(page.map(snakeizeKeys), nextCursor, { headers: ctx.headers });
}

export async function createTeamInvite(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;

  const body = await readJsonBody(ctx);
  const input = parseApiInput(inviteSchema, { ...objectBody(body), project_id: projectId });
  const invite = await runDomain(() => inviteTeamMember(input, apiMutationContext(ctx)));

  return resourceResponse(snakeizeKeys(invite), { headers: ctx.headers, status: 201 });
}

export async function revokeTeamInvite(ctx: ApiContext, inviteId: string, projectId?: string) {
  if (projectId) {
    const scoped = scopedProject(ctx, projectId);
    if (scoped) return scoped;
  }

  const result = await runDomain(() =>
    revokeTeamInviteRecord(
      { inviteId, projectId: projectId ?? ctx.auth.project.publicId },
      apiMutationContext(ctx),
    ),
  );

  return resourceResponse(snakeizeKeys(result), { headers: ctx.headers });
}

export async function updateTeamMemberRole(ctx: ApiContext, memberId: string, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;
  const body = parseApiInput(memberRoleSchema, await readJsonBody(ctx));
  const result = await runDomain(() =>
    changeTeamMemberRole(
      { memberId, projectId: ctx.auth.project.publicId, role: body.role },
      apiMutationContext(ctx),
    ),
  );
  return resourceResponse(snakeizeKeys(result), { headers: ctx.headers });
}

export async function deleteTeamMember(ctx: ApiContext, memberId: string, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;
  const result = await runDomain(() =>
    removeTeamMember({ memberId, projectId: ctx.auth.project.publicId }, apiMutationContext(ctx)),
  );
  return resourceResponse(snakeizeKeys(result), { headers: ctx.headers });
}

export async function resendTeamInvite(ctx: ApiContext, inviteId: string, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;
  const result = await runDomain(() =>
    resendTeamInviteRecord(
      { inviteId, projectId: ctx.auth.project.publicId },
      apiMutationContext(ctx),
    ),
  );
  return resourceResponse(snakeizeKeys(result), { headers: ctx.headers });
}
