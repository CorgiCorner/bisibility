"use client";

import { TeamReadOnlyCard } from "@/components/settings/team/TeamReadOnlyCard";
import { teamCardGeometryClassNames } from "@/components/settings/team/team-card-layout";
import { useTeamActionError } from "@/components/settings/team/useTeamActionError";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { Tooltip } from "@/components/ui/Tooltip";
import type { PendingInviteData } from "@/lib/queries/team";
import { cn } from "@/lib/ui/cn";
import { EnvelopeSimpleIcon as EnvelopeSimple } from "@phosphor-icons/react/dist/csr/EnvelopeSimple";
import { XIcon as X } from "@phosphor-icons/react/dist/csr/X";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

type InviteAction = (input: {
  inviteId: string;
  projectId: string;
}) => Promise<unknown | { message: string; status: "error" }>;

type TeamPendingInvitesCardProps = {
  canManageTeam: boolean;
  invites: readonly PendingInviteData[];
  now: string;
  projectId: string;
  readOnly?: boolean;
  resendInvite: InviteAction;
  revokeInvite: InviteAction;
};

export function TeamPendingInvitesCard({
  canManageTeam,
  invites,
  now,
  projectId,
  readOnly = false,
  resendInvite,
  revokeInvite,
}: Readonly<TeamPendingInvitesCardProps>) {
  const router = useRouter();
  const presentActionError = useTeamActionError();
  const t = useTranslations("projectSettingsTeam");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  function relativeLabel(value: string, kind: "expires" | "invited") {
    const difference = new Date(value).getTime() - new Date(now).getTime();
    const past = difference < 0;
    const absolute = Math.abs(difference);
    const days = Math.floor(absolute / 86_400_000);
    const count = days > 0 ? days : Math.max(1, Math.floor(absolute / 3_600_000));
    const unit = days > 0 ? "day" : "hour";

    if (kind === "expires") {
      return past
        ? t("pending.expiredAgo", { count, unit })
        : t("pending.expiresIn", { count, unit });
    }
    return past ? t("pending.invitedAgo", { count, unit }) : t("pending.invitedNow");
  }

  function roleLabel(invite: PendingInviteData) {
    if (invite.roleValue === "admin") return t("members.role.admin");
    if (invite.roleValue === "member") return t("members.role.editor");
    return t("members.role.viewer");
  }

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
      const result = await action({ inviteId: invite.id, projectId });
      if (
        typeof result === "object" &&
        result !== null &&
        "status" in result &&
        result.status === "error" &&
        "message" in result &&
        typeof result.message === "string"
      ) {
        setActionError(presentActionError(result.message, t("errors.action")));
        return;
      }
      setActionSuccess(successMessage ?? null);
      router.refresh();
    } catch (error) {
      setActionError(presentActionError(error, t("errors.action")));
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <TeamReadOnlyCard
      className={teamCardGeometryClassNames.pendingInvites}
      description={t("pending.description")}
      frameId="pending-invites"
      title={t("pending.title")}
    >
      <div className="divide-y divide-border rounded-control border border-border">
        {invites.length === 0 ? (
          <div className="flex items-center gap-3 p-3 text-[12.5px] text-fg-muted">
            <span className="grid h-8.5 w-[34px] place-items-center rounded-control border border-dashed border-border">
              <EnvelopeSimple aria-hidden size={16} weight="regular" />
            </span>
            {t("pending.empty")}
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
              <span className="grid h-8.5 w-[34px] shrink-0 place-items-center rounded-control border border-dashed border-border text-fg-muted">
                <EnvelopeSimple aria-hidden size={16} weight="regular" />
              </span>
              <span className="min-w-[160px] flex-1">
                <span className="block truncate font-sans tabular-nums text-[12.5px] text-fg">
                  {invite.email}
                </span>
                <span className="mt-0.5 block truncate text-[11.5px] text-fg-muted">
                  {t("pending.details", {
                    expires: relativeLabel(invite.expiresAt, "expires"),
                    invited: relativeLabel(invite.invitedAt, "invited"),
                    role: roleLabel(invite),
                  })}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-fg-muted">
                  {t("pending.invitedBy", { inviter: invite.invitedByLabel })}
                </span>
              </span>
              {invite.expired ? (
                <StatusPill
                  label={t("pending.expired")}
                  showDot={false}
                  size="sm"
                  status="needs_reauth"
                />
              ) : null}
              {canManageTeam && !readOnly ? (
                <Button
                  disabled={Boolean(pending)}
                  onClick={() =>
                    void runInviteAction(
                      `resend:${invite.id}`,
                      resendInvite,
                      invite,
                      t("pending.resendSuccess", { email: invite.email }),
                    )
                  }
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  {t("pending.resend")}
                </Button>
              ) : null}
              {canManageTeam && !readOnly ? (
                <Tooltip content={t("pending.revokeFor", { email: invite.email })}>
                  <button
                    aria-label={t("pending.revokeFor", { email: invite.email })}
                    className="grid h-[30px] w-[30px] place-items-center rounded-control border border-border-control bg-bg-elev text-red-text hover:border-red"
                    disabled={Boolean(pending)}
                    onClick={() =>
                      void runInviteAction(`revoke:${invite.id}`, revokeInvite, invite)
                    }
                    type="button"
                  >
                    <X aria-hidden size={14} weight="regular" />
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
