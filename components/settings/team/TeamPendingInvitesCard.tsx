"use client";

import { TeamReadOnlyCard } from "@/components/settings/team/TeamReadOnlyCard";
import { teamCardGeometryClassNames } from "@/components/settings/team/team-card-layout";
import { Button, StatusPill } from "@/components/ui";
import type { PendingInviteData } from "@/lib/queries/team";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { cn } from "@/lib/ui/cn";
import Tooltip from "@mui/material/Tooltip";
import { EnvelopeSimpleIcon as EnvelopeSimple, XIcon as X } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type InviteAction = (input: { inviteId: string; projectId: string }) => Promise<unknown>;

type TeamPendingInvitesCardProps = {
  canManageTeam: boolean;
  invites: readonly PendingInviteData[];
  projectId: string;
  readOnly?: boolean;
  resendInvite: InviteAction;
  revokeInvite: InviteAction;
};

export function TeamPendingInvitesCard({
  canManageTeam,
  invites,
  projectId,
  readOnly = false,
  resendInvite,
  revokeInvite,
}: Readonly<TeamPendingInvitesCardProps>) {
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  async function runInviteAction(
    key: string,
    action: InviteAction,
    invite: PendingInviteData,
    successMessage?: string,
  ) {
    setActionError(null);
    setActionSuccess(null);
    setPendingAction(key);
    try {
      await action({ inviteId: invite.id, projectId });
      setActionSuccess(successMessage ?? null);
      router.refresh();
    } catch (error) {
      setActionError(actionErrorMessage(error, "Invitation change failed."));
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <TeamReadOnlyCard
      className={teamCardGeometryClassNames.pendingInvites}
      description="Sent and not yet accepted."
      frameId="pending-invites"
      title="Pending invites"
    >
      <div className="divide-y divide-border-soft rounded-[10px] border border-border">
        {invites.length === 0 ? (
          <div className="flex items-center gap-3 p-3 text-[12.5px] text-fg-muted">
            <span className="grid h-[34px] w-[34px] place-items-center rounded-[9px] border border-dashed border-border-strong">
              <EnvelopeSimple aria-hidden size={16} />
            </span>
            No pending invites.
          </div>
        ) : null}
        {invites.map((invite) => {
          const pending = pendingAction?.endsWith(invite.id);
          return (
            <div
              className={cn(
                "flex flex-wrap items-center gap-3 p-3",
                invite.expired && "border-l-2 border-l-red bg-red/5",
              )}
              data-expired={invite.expired}
              key={invite.id}
            >
              <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] border border-dashed border-border-strong text-fg-muted">
                <EnvelopeSimple aria-hidden size={16} />
              </span>
              <span className="min-w-[160px] flex-1">
                <span className="block truncate font-mono text-[12.5px] text-fg">
                  {invite.email}
                </span>
                <span className="mt-0.5 block truncate text-[11.5px] text-fg-muted">
                  {invite.role} · {invite.invitedLabel} · {invite.expiresLabel}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-fg-muted">
                  Invited by {invite.invitedByLabel}
                </span>
              </span>
              {invite.expired ? (
                <StatusPill label="Expired" showDot={false} size="sm" status="needs_reauth" />
              ) : null}
              {canManageTeam && !readOnly ? (
                <Button
                  disabled={Boolean(pending)}
                  onClick={() =>
                    void runInviteAction(
                      `resend:${invite.id}`,
                      resendInvite,
                      invite,
                      `A new invitation was sent to ${invite.email}.`,
                    )
                  }
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  Resend
                </Button>
              ) : null}
              {canManageTeam && !readOnly ? (
                <Tooltip title={`Revoke invite for ${invite.email}`}>
                  <button
                    aria-label={`Revoke invite for ${invite.email}`}
                    className="grid h-[30px] w-[30px] place-items-center rounded-lg border border-border-strong bg-bg-elev text-red-text hover:border-red"
                    disabled={Boolean(pending)}
                    onClick={() =>
                      void runInviteAction(`revoke:${invite.id}`, revokeInvite, invite)
                    }
                    type="button"
                  >
                    <X aria-hidden size={14} />
                  </button>
                </Tooltip>
              ) : null}
            </div>
          );
        })}
      </div>
      {actionSuccess ? (
        <p className="m-0 mt-3 text-[11.5px] text-green-text" role="status">
          {actionSuccess}
        </p>
      ) : null}
      {actionError ? (
        <p className="m-0 mt-3 text-[11.5px] text-red-text" role="alert">
          {actionError}
        </p>
      ) : null}
    </TeamReadOnlyCard>
  );
}
