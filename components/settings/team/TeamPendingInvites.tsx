"use client";

import { Button } from "@/components/ui";
import { cn } from "@/lib/ui/cn";
import Tooltip from "@mui/material/Tooltip";
import { EnvelopeSimpleIcon as EnvelopeSimple, XIcon as X } from "@phosphor-icons/react";
import type { TeamRoleValue } from "./TeamMembersList";

type TeamRoleLabel = "Admin" | "Editor" | "Owner" | "Viewer";

export type PendingInviteData = {
  email: string;
  expiresLabel: string;
  expired?: boolean;
  id: string;
  invitedByLabel?: string;
  invitedLabel: string;
  role: TeamRoleLabel;
  roleValue?: Exclude<TeamRoleValue, "owner">;
};

export type PendingInvitesProps = {
  canManageTeam: boolean;
  invites: readonly PendingInviteData[];
  onResend: (inviteId: string) => void;
  onRevoke: (inviteId: string) => void;
  pendingAction: string | null;
};

const iconButtonClass =
  "grid h-[30px] w-[30px] place-items-center rounded-lg border border-border-strong bg-bg-elev text-red-text hover:border-red disabled:cursor-not-allowed disabled:opacity-45";

export function PendingInvites({
  canManageTeam,
  invites,
  onResend,
  onRevoke,
  pendingAction,
}: Readonly<PendingInvitesProps>) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-border bg-bg-elev">
      <div className="flex items-center justify-between gap-3 border-b border-border-soft px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[13.5px] font-semibold">Pending invites</span>
          <span className="inline-grid min-w-[18px] place-items-center rounded-full bg-accent-soft px-1.5 py-0.5 font-mono text-[10px] font-semibold text-accent-text">
            {invites.length}
          </span>
        </div>
      </div>
      {invites.length > 0 ? (
        invites.map((invite) => (
          <div
            className={cn(
              "flex flex-wrap items-center gap-3 border-b border-border-soft p-3 last:border-b-0",
              invite.expired && "border-l-2 border-l-red bg-red/5",
            )}
            data-expired={Boolean(invite.expired)}
            key={invite.id}
          >
            <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] border border-dashed border-border-strong text-fg-muted">
              <EnvelopeSimple aria-hidden size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-[12.5px] text-fg">{invite.email}</span>
              <span className="mt-0.5 block truncate font-mono text-[11.5px] text-fg-muted">
                {invite.role} / {invite.invitedLabel} / {invite.expiresLabel}
              </span>
              {invite.invitedByLabel ? (
                <span className="mt-0.5 block truncate text-[11.5px] text-fg-muted">
                  Invited by {invite.invitedByLabel}
                </span>
              ) : null}
            </span>
            {canManageTeam ? (
              <Button
                disabled={pendingAction === `resend:${invite.id}`}
                aria-label={`Resend invite for ${invite.email}`}
                onClick={() => onResend(invite.id)}
                size="sm"
                type="button"
                variant="secondary"
              >
                Resend
              </Button>
            ) : null}
            {canManageTeam ? (
              <Tooltip title={`Revoke invite for ${invite.email}`}>
                <span className="inline-grid">
                  <button
                    aria-label={`Revoke invite for ${invite.email}`}
                    className={iconButtonClass}
                    disabled={pendingAction === `revoke:${invite.id}`}
                    onClick={() => onRevoke(invite.id)}
                    type="button"
                  >
                    <X aria-hidden size={14} />
                  </button>
                </span>
              </Tooltip>
            ) : null}
          </div>
        ))
      ) : (
        <div className="flex items-center gap-3 p-3 text-[12.5px] text-fg-muted">
          <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] border border-dashed border-border-strong text-fg-muted">
            <EnvelopeSimple aria-hidden size={16} />
          </span>
          No pending invites. Use Invite member to add a teammate.
        </div>
      )}
    </div>
  );
}
