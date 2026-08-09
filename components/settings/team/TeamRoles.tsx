"use client";

import { SettingsSection } from "@/components/settings/SettingsSection";
import { Button } from "@/components/ui";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { cn } from "@/lib/ui/cn";
import {
  CheckCircleIcon as CheckCircle,
  MinusIcon as Minus,
  ShieldCheckIcon as ShieldCheck,
  UserPlusIcon as UserPlus,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { InviteModal } from "./InviteModal";
import { type TeamMemberData, TeamMembersList, type TeamRoleValue } from "./TeamMembersList";
import { type PendingInviteData, PendingInvites } from "./TeamPendingInvites";

type InviteMemberAction = (input: {
  email: string;
  projectId: string;
  role: "admin" | "member" | "viewer";
}) => Promise<{ inviteLink: string }>;
type InviteAction = (input: { inviteId: string; projectId: string }) => Promise<unknown>;
type MemberAction = (input: { memberId: string; projectId: string }) => Promise<unknown>;
type RoleAction = (input: {
  memberId: string;
  projectId: string;
  role: Exclude<TeamRoleValue, "owner">;
}) => Promise<unknown>;

export type TeamRolesProps = {
  canManageTeam?: boolean;
  canTransferOwnership?: boolean;
  domain?: string;
  inviteMember?: InviteMemberAction;
  changeMemberRole?: RoleAction;
  members: readonly TeamMemberData[];
  pendingInvites?: readonly PendingInviteData[];
  projectId?: string;
  removeMember?: MemberAction;
  resendInvite?: InviteAction;
  revokeInvite?: InviteAction;
  transferOwnership?: MemberAction;
};

const rbacRows = [
  { admin: true, cap: "View dashboards & exports", editor: true, owner: true, viewer: true },
  { admin: true, cap: "Add & edit keywords", editor: true, owner: true, viewer: false },
  { admin: true, cap: "Manage alert rules", editor: true, owner: true, viewer: false },
  { admin: true, cap: "Connect providers & API keys", editor: false, owner: true, viewer: false },
  { admin: true, cap: "Invite & manage members", editor: false, owner: true, viewer: false },
  { admin: false, cap: "Billing & delete project", editor: false, owner: true, viewer: false },
] as const;

function PermissionMark({ allowed }: Readonly<{ allowed: boolean }>) {
  const Icon = allowed ? CheckCircle : Minus;

  return (
    <span
      aria-label={allowed ? "Allowed" : "Not allowed"}
      className={cn("grid place-items-center", allowed ? "text-green-text" : "text-fg-muted")}
    >
      <Icon aria-hidden size={15} weight={allowed ? "fill" : "regular"} />
    </span>
  );
}

function RolesMatrix() {
  return (
    <div className="overflow-x-auto rounded-[10px] border border-border bg-bg-elev">
      <div className="min-w-[560px]">
        <div className="grid grid-cols-[minmax(170px,1.4fr)_repeat(4,1fr)] gap-x-2 border-b border-border bg-bg-sunken px-4 py-3 font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted">
          <span>Capability</span>
          <span className="text-center text-accent-text">Owner</span>
          <span className="text-center">Admin</span>
          <span className="text-center">Editor</span>
          <span className="text-center">Viewer</span>
        </div>
        {rbacRows.map((row) => (
          <div
            className="grid grid-cols-[minmax(170px,1.4fr)_repeat(4,1fr)] items-center gap-x-2 border-b border-border-soft px-4 py-3 last:border-b-0"
            key={row.cap}
          >
            <span className="text-[12.5px] text-fg">{row.cap}</span>
            <PermissionMark allowed={row.owner} />
            <PermissionMark allowed={row.admin} />
            <PermissionMark allowed={row.editor} />
            <PermissionMark allowed={row.viewer} />
          </div>
        ))}
        <div className="flex items-center gap-2 border-t border-border-soft px-4 py-3 text-[11.5px] text-fg-muted">
          <ShieldCheck aria-hidden className="shrink-0 text-accent-text" size={14} />
          Owner is unique and transferable. Every role change is written to the audit log.
        </div>
      </div>
    </div>
  );
}

export function TeamRoles({
  canManageTeam = false,
  canTransferOwnership = false,
  changeMemberRole,
  domain = "acme.dev",
  inviteMember,
  members,
  pendingInvites = [],
  projectId,
  removeMember,
  resendInvite,
  revokeInvite,
  transferOwnership,
}: Readonly<TeamRolesProps>) {
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  async function runTeamAction(
    key: string,
    action: () => Promise<unknown> | undefined,
    successMessage?: string,
  ) {
    setPendingAction(key);
    setActionError(null);
    setActionSuccess(null);
    try {
      const result = action();
      if (!result) {
        return;
      }
      await result;
      setActionSuccess(successMessage ?? null);
      router.refresh();
    } catch (error) {
      setActionError(actionErrorMessage(error, "Team change failed."));
    } finally {
      setPendingAction(null);
    }
  }

  function withProject<T extends object>(data: T) {
    if (!projectId) {
      throw new Error("No active project.");
    }
    return { ...data, projectId };
  }

  return (
    <>
      <SettingsSection
        description="Owner, Admin, Editor and Viewer roles. Change a role or remove access anytime."
        contentClassName="space-y-3"
        title="Team"
      >
        <TeamMembersList
          canManageTeam={canManageTeam}
          canTransferOwnership={canTransferOwnership}
          members={members}
          onRemove={(memberId) =>
            void runTeamAction(`remove:${memberId}`, () =>
              removeMember?.(withProject({ memberId })),
            )
          }
          onRoleChange={(memberId, role) =>
            void runTeamAction(`role:${memberId}`, () =>
              changeMemberRole?.(withProject({ memberId, role })),
            )
          }
          onTransferOwnership={(memberId) =>
            void runTeamAction(`transfer:${memberId}`, () =>
              transferOwnership?.(withProject({ memberId })),
            )
          }
          pendingAction={pendingAction}
        />
        {actionError ? (
          <p className="m-0 text-[12px] font-medium text-red-text" role="alert">
            {actionError}
          </p>
        ) : null}
        {canManageTeam ? (
          <Button
            onClick={() => setInviteOpen(true)}
            size="sm"
            startIcon={<UserPlus aria-hidden size={14} weight="bold" />}
            type="button"
            variant="secondary"
          >
            Invite member
          </Button>
        ) : null}
      </SettingsSection>
      <SettingsSection
        description="Pending invitations and what each role can do. Owner can transfer ownership; all changes are audit-logged."
        contentClassName="space-y-3"
        title="Roles and permissions"
      >
        <PendingInvites
          canManageTeam={canManageTeam}
          invites={pendingInvites}
          onResend={(inviteId) =>
            void runTeamAction(
              `resend:${inviteId}`,
              () => resendInvite?.(withProject({ inviteId })),
              `A new invitation was sent to ${
                pendingInvites.find((invite) => invite.id === inviteId)?.email ?? "the recipient"
              }. The previous link no longer works.`,
            )
          }
          onRevoke={(inviteId) =>
            void runTeamAction(`revoke:${inviteId}`, () =>
              revokeInvite?.(withProject({ inviteId })),
            )
          }
          pendingAction={pendingAction}
        />
        {actionSuccess ? (
          <p
            aria-live="polite"
            className="m-0 text-[12px] font-medium text-green-text"
            role="status"
          >
            {actionSuccess}
          </p>
        ) : null}
        <RolesMatrix />
      </SettingsSection>
      {canManageTeam ? (
        <InviteModal
          domain={`${domain}'s project`}
          inviteMember={inviteMember}
          onClose={() => setInviteOpen(false)}
          onInviteSent={() => router.refresh()}
          open={inviteOpen}
          projectId={projectId}
        />
      ) : null}
    </>
  );
}
