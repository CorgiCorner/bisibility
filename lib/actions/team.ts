"use server";

import { writeAudit } from "@/lib/auth/audit";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { makePublicId, parsePublicId } from "@/lib/db/public-id";
import {
  changeTeamMemberRole,
  hashInviteToken,
  inviteTeamMember,
  removeTeamMember,
  resendTeamInvite,
  revokeTeamInvite,
} from "@/lib/team/service";
import { z } from "zod";
import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateSettingsViews,
} from "./_shared";

const id = z.string().trim().min(1).max(120);
const inviteRoleSchema = z.enum(["admin", "member", "viewer"]);
const email = z.string().trim().pipe(z.email("Enter a teammate email."));
const memberSelect = { id: true, publicId: true, role: true, userId: true } as const;

const inviteMemberSchema = z.object({ email, projectId: id, role: inviteRoleSchema });
const acceptInviteSchema = z.object({ token: z.string().trim().min(20).max(256) });
const inviteIdSchema = z.object({ inviteId: id, projectId: id });
const changeMemberRoleSchema = z.object({ memberId: id, projectId: id, role: inviteRoleSchema });
const memberIdSchema = z.object({ memberId: id, projectId: id });

type MemberRow = { id: string; publicId: string | null; role: string; userId: string };

async function auditAndRevalidate(input: Parameters<typeof writeAudit>[0]) {
  await writeAudit(input);
  revalidateSettingsViews();
}

function auditTarget(actorId: string, projectId: string, targetType: string, targetId: string) {
  return { actorId, projectId, targetId, targetType };
}

async function findMember(projectId: string, memberId: string): Promise<MemberRow | null> {
  if (parsePublicId(memberId)?.prefix !== "mbr") return null;
  return prisma.membership.findFirst({
    select: memberSelect,
    where: { projectId, publicId: memberId },
  });
}

function requiredPublicId(value: string | null, prefix: "mbr" | "usr", resource: string) {
  if (!value || parsePublicId(value)?.prefix !== prefix) {
    throw new Error(`${resource} public ID is not available.`);
  }
  return value;
}

export async function inviteMember(input: unknown) {
  const data = parseActionInput(inviteMemberSchema, input);
  const actor = await getActionActor();
  const result = await inviteTeamMember(data, {
    actor,
    auditActorId: actor.id,
  });
  revalidateSettingsViews();
  return result;
}

export async function acceptInvite(input: unknown) {
  const data = parseActionInput(acceptInviteSchema, input);
  const session = await requireSession();
  const [invite, user] = await Promise.all([
    prisma.invite.findUnique({
      include: { project: { select: { publicId: true } } },
      where: { token: hashInviteToken(data.token) },
    }),
    prisma.user.findUnique({ select: { email: true, id: true }, where: { id: session.user.id } }),
  ]);
  if (!invite || invite.acceptedAt || invite.expiresAt <= new Date())
    throw new Error("Invite is invalid or expired.");
  if (user?.email.toLowerCase() !== invite.email.toLowerCase())
    throw new Error("Use the invited email to accept this invite.");
  const role = inviteRoleSchema.safeParse(invite.role);
  if (!role.success) throw new Error("Invite is invalid or expired.");

  const membership = await prisma.$transaction(async (tx) => {
    const existing = await tx.membership.findFirst({
      select: memberSelect,
      where: { projectId: invite.projectId, userId: user.id },
    });
    if (existing) {
      throw new Error("This user is already a member.");
    }
    const member = await tx.membership.create({
      data: {
        projectId: invite.projectId,
        publicId: makePublicId("mbr"),
        role: role.data,
        userId: user.id,
      },
      select: memberSelect,
    });
    const used = await tx.invite.updateMany({
      data: { acceptedAt: new Date() },
      where: { acceptedAt: null, expiresAt: { gt: new Date() }, id: invite.id },
    });
    if (used.count !== 1) throw new Error("Invite is invalid or expired.");
    return member;
  });
  await auditAndRevalidate({
    action: "team.invite.accept",
    after: { email: invite.email, inviteId: invite.publicId, role: membership.role },
    ...auditTarget(
      user.id,
      invite.projectId,
      "membership",
      requiredPublicId(membership.publicId, "mbr", "Membership"),
    ),
  });
  return {
    id: requiredPublicId(membership.publicId, "mbr", "Membership"),
    projectId: invite.project.publicId,
    publicId: invite.project.publicId,
    role: membership.role,
  };
}

export async function revokeInvite(input: unknown) {
  const data = parseActionInput(inviteIdSchema, input);
  const actor = await getActionActor();
  const result = await revokeTeamInvite(data, { actor, auditActorId: actor.id });
  revalidateSettingsViews();
  return result;
}

export async function resendInvite(input: unknown) {
  const data = parseActionInput(inviteIdSchema, input);
  const actor = await getActionActor();
  const result = await resendTeamInvite(data, { actor, auditActorId: actor.id });
  revalidateSettingsViews();
  return result;
}

export async function changeMemberRole(input: unknown) {
  const data = parseActionInput(changeMemberRoleSchema, input);
  const actor = await getActionActor();
  const result = await changeTeamMemberRole(data, { actor, auditActorId: actor.id });
  revalidateSettingsViews();
  return result;
}

export async function removeMember(input: unknown) {
  const data = parseActionInput(memberIdSchema, input);
  const actor = await getActionActor();
  const result = await removeTeamMember(data, { actor, auditActorId: actor.id });
  revalidateSettingsViews();
  return result;
}

export async function transferOwnership(input: unknown) {
  const data = parseActionInput(memberIdSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "manage", data.projectId, {
    requiredRole: "owner",
    type: "ownership",
  });
  const target = await findMember(project.id, data.memberId);
  if (!target || target.userId === actor.id || target.role === "owner")
    throw new Error("Choose another project member to become owner.");

  const result = await prisma.$transaction(async (tx) => {
    await tx.membership.updateMany({
      data: { role: "admin" },
      where: { projectId: project.id, role: "owner" },
    });
    const owner = await tx.membership.update({
      data: { role: "owner" },
      select: { ...memberSelect, user: { select: { publicId: true } } },
      where: { id: target.id },
    });
    await tx.project.update({ data: { ownerId: owner.userId }, where: { id: project.id } });
    return owner;
  });
  await auditAndRevalidate({
    action: "team.ownership.transfer",
    after: { ownerId: result.user.publicId, role: result.role },
    before: { targetRole: target.role },
    ...auditTarget(
      actor.id,
      project.id,
      "membership",
      requiredPublicId(result.publicId, "mbr", "Membership"),
    ),
  });
  return {
    id: requiredPublicId(result.publicId, "mbr", "Membership"),
    ownerId: requiredPublicId(result.user.publicId, "usr", "User"),
  };
}
