import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { requireProjectScope } from "@/lib/actions/_shared";
import { assertInviteMailerReady, deliverInvite } from "@/lib/actions/team-invite-delivery";
import { assertAdminOrOwnerRemains, assertOwnerForAdminTier } from "@/lib/actions/team-rbac";
import { writeAudit } from "@/lib/auth/audit";
import type { Actor } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import { isPublicIdOfType, makePublicId } from "@/lib/db/public-id";
import { assertInviteCreateAllowed, assertInviteResendAllowed } from "./invite-rate-limit";

const INVITE_DAYS = 7;
const memberSelect = { id: true, publicId: true, role: true, userId: true } as const;
const inviteDeliveryInclude = {
  invitedBy: { select: { email: true, name: true } },
  project: { select: { name: true } },
} as const;

type MemberRow = { id: string; publicId: string | null; role: string; userId: string };
type TeamMutationContext = { actor: Actor; auditActorId: string | null };

const inviteExpiresAt = () => new Date(Date.now() + INVITE_DAYS * 86_400_000);
const newInviteToken = () => randomBytes(32).toString("base64url");
const canonicalInviteEmail = (email: string) => email.trim().toLowerCase();

export const hashInviteToken = (raw: string) =>
  `sha256:${createHash("sha256").update(raw).digest("hex")}`;

function auditTarget(projectId: string, targetType: string, targetId: string) {
  return { projectId, targetId, targetType };
}

async function requireTeamManager(context: TeamMutationContext, projectId: string) {
  return requireProjectScope(context.actor, "manage", projectId, { type: "team" });
}

async function findMember(projectId: string, memberId: string): Promise<MemberRow | null> {
  if (!isPublicIdOfType(memberId, "mbr")) return null;
  return prisma.membership.findFirst({
    select: memberSelect,
    where: { projectId, publicId: memberId },
  });
}

function requiredPublicId(value: string | null, prefix: "inv" | "mbr", resource: string) {
  if (!value || !isPublicIdOfType(value, prefix)) {
    throw new Error(`${resource} public ID is not available.`);
  }
  return value;
}

function assertEditableMember(member: MemberRow | null): asserts member is MemberRow {
  if (!member || member.role === "owner") throw new Error("Member is not editable.");
}

export async function inviteTeamMember(
  data: { email: string; projectId: string; role: "admin" | "member" | "viewer" },
  context: TeamMutationContext,
) {
  assertInviteMailerReady();
  const project = await requireTeamManager(context, data.projectId);
  const email = canonicalInviteEmail(data.email);
  const existingMember = await prisma.membership.findFirst({
    select: { id: true },
    where: { projectId: project.id, user: { email: { equals: email, mode: "insensitive" } } },
  });
  if (existingMember) throw new Error("This user is already a member.");
  await assertInviteCreateAllowed(context.actor.id, project.id);

  const rawToken = newInviteToken();
  const expiresAt = inviteExpiresAt();
  const inviteData = {
    expiresAt,
    invitedById: context.actor.id,
    role: data.role,
    token: hashInviteToken(rawToken),
  };
  const invite = await prisma.invite.upsert({
    create: { ...inviteData, email, projectId: project.id, publicId: makePublicId("inv") },
    include: inviteDeliveryInclude,
    update: { ...inviteData, acceptedAt: null },
    where: { projectId_email: { email, projectId: project.id } },
  });
  const result = await deliverInvite(invite, rawToken);
  await writeAudit({
    action: "team.invite.create",
    actorId: context.auditActorId,
    after: { email: invite.email, expiresAt: invite.expiresAt, role: invite.role },
    ...auditTarget(project.id, "invite", requiredPublicId(invite.publicId, "inv", "Invite")),
  });
  return { ...result, id: requiredPublicId(invite.publicId, "inv", "Invite") };
}

export async function revokeTeamInvite(
  data: { inviteId: string; projectId: string },
  context: TeamMutationContext,
) {
  const project = await requireTeamManager(context, data.projectId);
  if (!isPublicIdOfType(data.inviteId, "inv")) throw new Error("Invite not found.");
  const invite = await prisma.invite.findFirst({
    where: { acceptedAt: null, projectId: project.id, publicId: data.inviteId },
  });
  if (!invite) throw new Error("Invite not found.");
  await prisma.invite.delete({ where: { id: invite.id } });
  await writeAudit({
    action: "team.invite.revoke",
    actorId: context.auditActorId,
    before: { email: invite.email, role: invite.role },
    ...auditTarget(project.id, "invite", requiredPublicId(invite.publicId, "inv", "Invite")),
  });
  return { id: requiredPublicId(invite.publicId, "inv", "Invite") };
}

export async function resendTeamInvite(
  data: { inviteId: string; projectId: string },
  context: TeamMutationContext,
) {
  assertInviteMailerReady();
  const project = await requireTeamManager(context, data.projectId);
  if (!isPublicIdOfType(data.inviteId, "inv")) throw new Error("Invite not found.");
  const before = await prisma.invite.findFirst({
    include: inviteDeliveryInclude,
    where: { acceptedAt: null, projectId: project.id, publicId: data.inviteId },
  });
  if (!before) throw new Error("Invite not found.");
  await assertInviteResendAllowed(before.id);

  const rawToken = newInviteToken();
  const expiresAt = inviteExpiresAt();
  const invite = await prisma.invite.update({
    data: { expiresAt, token: hashInviteToken(rawToken) },
    include: inviteDeliveryInclude,
    where: { id: before.id },
  });
  const result = await deliverInvite(invite, rawToken);
  await writeAudit({
    action: "team.invite.resend",
    actorId: context.auditActorId,
    after: { email: invite.email, expiresAt: invite.expiresAt, role: invite.role },
    before: { email: before.email, expiresAt: before.expiresAt, role: before.role },
    ...auditTarget(project.id, "invite", requiredPublicId(invite.publicId, "inv", "Invite")),
  });
  return { ...result, id: requiredPublicId(invite.publicId, "inv", "Invite") };
}

export async function changeTeamMemberRole(
  data: { memberId: string; projectId: string; role: "admin" | "member" | "viewer" },
  context: TeamMutationContext,
) {
  const project = await requireTeamManager(context, data.projectId);
  const before = await findMember(project.id, data.memberId);
  assertEditableMember(before);
  assertOwnerForAdminTier(context.actor, project.id, before.role, data.role);
  await assertAdminOrOwnerRemains(project.id, before.role, data.role);

  const member = await prisma.membership.update({
    data: { role: data.role },
    select: memberSelect,
    where: { id: before.id },
  });
  await writeAudit({
    action: "team.member.role_change",
    actorId: context.auditActorId,
    after: { role: member.role },
    before: { role: before.role },
    ...auditTarget(
      project.id,
      "membership",
      requiredPublicId(member.publicId, "mbr", "Membership"),
    ),
  });
  return { id: requiredPublicId(member.publicId, "mbr", "Membership"), role: member.role };
}

export async function removeTeamMember(
  data: { memberId: string; projectId: string },
  context: TeamMutationContext,
) {
  const project = await requireTeamManager(context, data.projectId);
  const member = await findMember(project.id, data.memberId);
  assertEditableMember(member);
  assertOwnerForAdminTier(context.actor, project.id, member.role);
  await assertAdminOrOwnerRemains(project.id, member.role);
  await prisma.membership.delete({ where: { id: member.id } });
  await writeAudit({
    action: "team.member.remove",
    actorId: context.auditActorId,
    before: { role: member.role },
    ...auditTarget(
      project.id,
      "membership",
      requiredPublicId(member.publicId, "mbr", "Membership"),
    ),
  });
  return { id: requiredPublicId(member.publicId, "mbr", "Membership") };
}
