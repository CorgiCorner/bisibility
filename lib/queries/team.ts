import "server-only";

import { getProjectRole } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import { isPublicIdOfType } from "@/lib/db/public-id";
import type { Role } from "@/lib/generated/prisma/client";
import { requireReadableProject } from "./_auth";

export type TeamRoleLabel = "Admin" | "Editor" | "Owner" | "Viewer";
export type TeamRoleValue = "admin" | "member" | "owner" | "viewer";

export type TeamMemberData = {
  color: "accent" | "blue" | "purple";
  email: string;
  id: string;
  initials: string;
  name: string;
  role: TeamRoleLabel;
  roleValue: TeamRoleValue;
};

export type PendingInviteData = {
  email: string;
  expiresLabel: string;
  expired: boolean;
  id: string;
  invitedByLabel: string;
  invitedLabel: string;
  role: TeamRoleLabel;
  roleValue: Exclude<TeamRoleValue, "owner">;
};

export type TeamAccessView = {
  canManageTeam: boolean;
  canTransferOwnership: boolean;
  members: TeamMemberData[];
  pendingInvites: PendingInviteData[];
};

const roleRank = {
  viewer: 0,
  auditor: 0.5,
  member: 1,
  admin: 2,
  owner: 3,
} satisfies Record<Role, number>;

function roleValue(role: Role): TeamRoleValue {
  return role === "auditor" ? "viewer" : role;
}

function roleLabel(role: Role): TeamRoleLabel {
  if (role === "owner") {
    return "Owner";
  }
  if (role === "admin") {
    return "Admin";
  }
  if (role === "viewer" || role === "auditor") {
    return "Viewer";
  }
  return "Editor";
}

function initials(name: string, email: string) {
  const source = name.trim() || email.trim();
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function memberColor(index: number): "accent" | "blue" | "purple" {
  if (index === 0) {
    return "accent";
  }
  return index % 2 === 0 ? "purple" : "blue";
}

function inviterLabel(inviter: { email: string; name: string }) {
  const name = inviter.name.trim();
  return name && name !== inviter.email ? `${name} (${inviter.email})` : inviter.email;
}

function relativeDateLabel(prefix: "expires" | "invited", date: Date, now: Date) {
  const diffMs = date.getTime() - now.getTime();
  const past = diffMs < 0;
  const absMs = Math.abs(diffMs);
  const days = Math.floor(absMs / 86_400_000);
  const hours = Math.max(1, Math.floor(absMs / 3_600_000));
  const value = days > 0 ? `${days}d` : `${hours}h`;

  if (prefix === "expires") {
    return past ? `expired ${value} ago` : `expires in ${value}`;
  }

  return past ? `invited ${value} ago` : "invited just now";
}

function requiredPublicId(value: string | null, prefix: "inv" | "mbr", resource: string) {
  if (!value || !isPublicIdOfType(value, prefix)) {
    throw new Error(`${resource} public ID is not available.`);
  }
  return value;
}

export async function getTeamAccess(projectId: string): Promise<TeamAccessView> {
  const { actor, project } = await requireReadableProject(projectId);
  const now = new Date();
  const [members, pendingInvites] = await Promise.all([
    prisma.membership.findMany({
      include: { user: { select: { email: true, name: true } } },
      orderBy: { createdAt: "asc" },
      where: { projectId: project.id },
    }),
    prisma.invite.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        createdAt: true,
        email: true,
        expiresAt: true,
        publicId: true,
        invitedBy: { select: { email: true, name: true } },
        role: true,
      },
      where: { acceptedAt: null, projectId: project.id },
    }),
  ]);
  const actorRole = getProjectRole(actor, project.id);

  return {
    canManageTeam: Boolean(actorRole && roleRank[actorRole] >= roleRank.admin),
    canTransferOwnership: actorRole === "owner",
    members: members.map((member, index) => ({
      color: memberColor(index),
      email: member.user.email,
      id: requiredPublicId(member.publicId, "mbr", "Membership"),
      initials: initials(member.user.name, member.user.email),
      name: member.user.name,
      role: roleLabel(member.role),
      roleValue: roleValue(member.role),
    })),
    pendingInvites: pendingInvites.map((invite) => ({
      email: invite.email,
      expiresLabel: relativeDateLabel("expires", invite.expiresAt, now),
      expired: invite.expiresAt <= now,
      id: requiredPublicId(invite.publicId, "inv", "Invite"),
      invitedByLabel: inviterLabel(invite.invitedBy),
      invitedLabel: relativeDateLabel("invited", invite.createdAt, now),
      role: roleLabel(invite.role),
      roleValue: roleValue(invite.role) as Exclude<TeamRoleValue, "owner">,
    })),
  };
}
