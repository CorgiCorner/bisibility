"use client";

import { MigrationReachabilityHint } from "@/components/settings/migration/MigrationReachabilityHint";
import { Button, ConfirmModal } from "@/components/ui";
import {
  ArrowsClockwiseIcon as ArrowsClockwise,
  KeyIcon as Key,
  LockSimpleIcon as LockSimple,
  PlusIcon as Plus,
  WarningCircleIcon as WarningCircle,
  WarningOctagonIcon as WarningOctagon,
} from "@phosphor-icons/react";
import { useState } from "react";
import type { ActiveMigrationToken, IssuedMigrationToken } from "./cloud-token";
import { TokenMeta } from "./MigrationTokenMeta";
import { MigrationTokenTransferDetails } from "./MigrationTokenTransferDetails";

export type MigrationTokenStatus = "none" | "active" | "created" | "error";
export type MigrationTokenPendingAction = "create" | "regenerate" | "revoke";

type MigrationTokenCardProps = {
  activeToken: ActiveMigrationToken | null;
  disabled?: boolean;
  destinationUrl?: string;
  errorMessage: string | null;
  errorTitle?: string;
  issuedToken: IssuedMigrationToken | null;
  onGenerate: () => void;
  onRegenerate: () => void;
  onRevoke: () => void;
  pendingAction?: MigrationTokenPendingAction | null;
  sourceLabel?: string;
  status: MigrationTokenStatus;
  tokenSecurityNote?: string;
  workspaceName: string;
};

const primaryButton =
  "inline-flex items-center gap-2 rounded-control bg-accent-solid px-4.5 py-[11px] font-semibold text-[14px] text-accent-on-solid transition-colors hover:bg-accent-solid-hover disabled:cursor-not-allowed disabled:bg-bg-sunken disabled:text-fg-muted";
function TokenActions({
  disabled,
  onRegenerate,
  onRevoke,
  pendingAction,
}: Readonly<{
  disabled?: boolean;
  onRegenerate: () => void;
  onRevoke: () => void;
  pendingAction?: MigrationTokenPendingAction | null;
}>) {
  const [confirmKind, setConfirmKind] = useState<
    "revokeMigrationToken" | "rollMigrationToken" | null
  >(null);
  const revoking = pendingAction === "revoke";
  const regenerating = pendingAction === "regenerate";

  return (
    <div className="mt-4.5 border-border-soft border-t pt-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <Button
          disabled={disabled && !revoking}
          loading={revoking}
          loadingLabel="Revoking"
          onClick={() => setConfirmKind("revokeMigrationToken")}
          size="sm"
          sx={{ color: "var(--red-text)" }}
          type="button"
          variant="secondary"
        >
          Revoke token
        </Button>
        <Button
          disabled={disabled && !regenerating}
          loading={regenerating}
          loadingLabel="Rolling token"
          onClick={() => setConfirmKind("rollMigrationToken")}
          size="sm"
          type="button"
          variant="ghost"
        >
          Roll token
        </Button>
      </div>
      <ConfirmModal
        kind={confirmKind ?? "revokeMigrationToken"}
        onClose={() => setConfirmKind(null)}
        onConfirm={() => {
          if (confirmKind === "rollMigrationToken") onRegenerate();
          else onRevoke();
          setConfirmKind(null);
        }}
        open={confirmKind !== null}
        showConfirmationToast={false}
      />
    </div>
  );
}

function TokenGenerateButton({
  creating,
  disabled,
  label,
  onGenerate,
  retry = false,
}: Readonly<{
  creating: boolean;
  disabled?: boolean;
  label: string;
  onGenerate: () => void;
  retry?: boolean;
}>) {
  const Icon = retry || creating ? ArrowsClockwise : Plus;

  return (
    <button
      className={`mt-4.5 ${primaryButton}`}
      disabled={disabled}
      onClick={onGenerate}
      type="button"
    >
      <Icon
        aria-hidden
        className={creating ? "animate-spin" : undefined}
        size={15}
        weight="regular"
      />
      {creating ? "Creating token" : label}
    </button>
  );
}

export function MigrationTokenCard({
  activeToken,
  disabled,
  destinationUrl,
  errorMessage,
  errorTitle = "Couldn't create token",
  issuedToken,
  onGenerate,
  onRegenerate,
  onRevoke,
  pendingAction,
  sourceLabel = "self-hosted instance",
  status,
  tokenSecurityNote,
  workspaceName,
}: Readonly<MigrationTokenCardProps>) {
  const visibleToken = issuedToken ?? activeToken;
  const creating = pendingAction === "create";

  return (
    <div className="mt-7 overflow-hidden rounded-card border border-border bg-bg-elev">
      <div className="flex items-center gap-[13px] border-border-soft border-b p-[20px_22px]">
        <span className="grid h-[42px] w-[42px] flex-none place-items-center rounded-control bg-accent-soft text-accent-solid">
          <Key aria-hidden size={21} weight="regular" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold">Migration token</div>
          <div className="mt-0.5 text-[12.5px] text-fg-muted">
            Authorizes one {sourceLabel} to push its export into{" "}
            <strong className="font-semibold text-fg">{workspaceName}</strong>.
          </div>
        </div>
      </div>

      <div className="p-5.5">
        {status === "error" ? (
          <div className="flex flex-col items-center px-4 pt-3.5 pb-1.5 text-center">
            <span className="grid h-[50px] w-[50px] place-items-center rounded-card bg-red/10 text-red-text">
              <WarningOctagon aria-hidden size={26} weight="regular" />
            </span>
            <div className="mt-3.5 text-[14.5px] font-semibold">{errorTitle}</div>
            <p className="mt-1.5 max-w-[400px] text-[13px] leading-[1.55] text-fg-muted">
              {errorMessage ?? "No token was issued. Nothing was exposed."}
            </p>
            <div className="mt-3.5 inline-flex items-center gap-[7px] rounded-control bg-bg-sunken px-[11px] py-[5px] font-mono text-[11px] text-fg-muted">
              <WarningCircle aria-hidden className="text-red-text" size={13} weight="regular" />
              token_action_failed
            </div>
            <TokenGenerateButton
              creating={creating}
              disabled={disabled}
              label="Try again"
              onGenerate={onGenerate}
              retry
            />
          </div>
        ) : null}
        {status !== "error" && (status === "none" || !visibleToken) ? (
          <div className="flex flex-col items-center px-4 pt-3.5 pb-1.5 text-center">
            <span className="grid h-[50px] w-[50px] place-items-center rounded-card bg-bg-sunken text-fg-muted">
              <Key aria-hidden size={26} weight="regular" />
            </span>
            <div className="mt-3.5 text-[14.5px] font-semibold">No active token</div>
            <p className="mt-1.5 max-w-[400px] text-[13px] leading-[1.55] text-fg-muted">
              Create a token to start an import. It is shown once, expires in 60 minutes, and is
              consumed after a successful import.
            </p>
            <TokenGenerateButton
              creating={creating}
              disabled={disabled}
              label="Create migration token"
              onGenerate={onGenerate}
            />
          </div>
        ) : null}
        {status === "active" && visibleToken ? (
          <div>
            <div className="text-[14.5px] font-semibold">Active token exists</div>
            <p className="mt-1.5 text-[13px] leading-[1.55] text-fg-muted">
              Its value is hidden. Roll the token if you need to copy one.
            </p>
            <TokenMeta token={visibleToken} workspaceName={workspaceName} />
            <TokenActions
              disabled={disabled}
              onRegenerate={onRegenerate}
              onRevoke={onRevoke}
              pendingAction={pendingAction}
            />
          </div>
        ) : null}
        {status === "created" && issuedToken ? (
          <div>
            <MigrationTokenTransferDetails
              destinationUrl={destinationUrl}
              token={issuedToken}
              workspaceName={workspaceName}
            />
            <TokenActions
              disabled={disabled}
              onRegenerate={onRegenerate}
              onRevoke={onRevoke}
              pendingAction={pendingAction}
            />
          </div>
        ) : null}
        {destinationUrl && status !== "error" && status !== "created" ? (
          <div className="mt-4.5">
            <MigrationReachabilityHint surface="destination" targetOrigin={destinationUrl} />
          </div>
        ) : null}
      </div>
      {tokenSecurityNote && status !== "error" && (status === "none" || !visibleToken) ? (
        <div className="flex items-start gap-[9px] border-border-soft border-t bg-bg-sunken px-[22px] py-3.5 text-[12px] leading-[1.5] text-fg-muted">
          <LockSimple
            aria-hidden
            className="mt-px flex-none text-green-text"
            size={14}
            weight="regular"
          />
          <span>{tokenSecurityNote}</span>
        </div>
      ) : null}
    </div>
  );
}
