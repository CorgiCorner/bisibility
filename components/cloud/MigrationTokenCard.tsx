"use client";

import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { ArrowsClockwiseIcon as ArrowsClockwise } from "@phosphor-icons/react/dist/csr/ArrowsClockwise";
import { KeyIcon as Key } from "@phosphor-icons/react/dist/csr/Key";
import { LockSimpleIcon as LockSimple } from "@phosphor-icons/react/dist/csr/LockSimple";
import { PlusIcon as Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/dist/csr/WarningCircle";
import { WarningOctagonIcon as WarningOctagon } from "@phosphor-icons/react/dist/csr/WarningOctagon";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { ActiveMigrationToken, IssuedMigrationToken } from "./cloud-token";
import { LocalizedCloudDestinationReachabilityHint } from "./LocalizedCloudDestinationReachabilityHint";
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
  const t = useTranslations("cloudImport.token");
  const [confirmKind, setConfirmKind] = useState<
    "revokeMigrationToken" | "rollMigrationToken" | null
  >(null);
  const revoking = pendingAction === "revoke";
  const regenerating = pendingAction === "regenerate";

  return (
    <div className="mt-4.5 border-border border-t pt-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <Button
          disabled={disabled && !revoking}
          loading={revoking}
          loadingLabel={t("revoking")}
          onClick={() => setConfirmKind("revokeMigrationToken")}
          size="sm"
          style={{ "--control-color": "var(--red-text)" }}
          type="button"
          variant="secondary"
        >
          {t("revoke")}
        </Button>
        <Button
          disabled={disabled && !regenerating}
          loading={regenerating}
          loadingLabel={t("regenerating")}
          onClick={() => setConfirmKind("rollMigrationToken")}
          size="sm"
          type="button"
          variant="ghost"
        >
          {t("roll")}
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
  const t = useTranslations("cloudImport.token");
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
      {creating ? t("creating") : label}
    </button>
  );
}

export function MigrationTokenCard({
  activeToken,
  disabled,
  destinationUrl,
  errorMessage,
  errorTitle,
  issuedToken,
  onGenerate,
  onRegenerate,
  onRevoke,
  pendingAction,
  sourceLabel,
  status,
  tokenSecurityNote,
  workspaceName,
}: Readonly<MigrationTokenCardProps>) {
  const t = useTranslations("cloudImport.token");
  const visibleToken = issuedToken ?? activeToken;
  const creating = pendingAction === "create";

  return (
    <div className="mt-7 overflow-hidden rounded-card border border-border bg-bg-elev">
      <div className="flex items-center gap-[13px] border-border border-b p-[20px_22px]">
        <span className="grid h-[42px] w-[42px] flex-none place-items-center rounded-control bg-accent-soft text-accent-solid">
          <Key aria-hidden size={21} weight="regular" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold">{t("header")}</div>
          <div className="mt-0.5 text-[12.5px] text-fg-muted">
            {t.rich("authorizes", {
              project: workspaceName,
              source: sourceLabel ?? t("defaultSource"),
              workspace: (chunks) => <strong className="font-semibold text-fg">{chunks}</strong>,
            })}
          </div>
        </div>
      </div>

      <div className="p-5.5">
        {status === "error" ? (
          <div className="flex flex-col items-center px-4 pt-3.5 pb-1.5 text-center">
            <span className="grid h-[50px] w-[50px] place-items-center rounded-card bg-red/10 text-red-text">
              <WarningOctagon aria-hidden size={26} weight="regular" />
            </span>
            <div className="mt-3.5 text-[14.5px] font-semibold">
              {errorTitle ?? t("error.create")}
            </div>
            <p className="mt-1.5 max-w-[400px] text-[13px] leading-[1.55] text-fg-muted">
              {errorMessage ?? t("noTokenIssued")}
            </p>
            <div className="mt-3.5 inline-flex items-center gap-[7px] rounded-control bg-bg-sunken px-[11px] py-[5px] font-sans tabular-nums text-[11px] text-fg-muted">
              <WarningCircle aria-hidden className="text-red-text" size={13} weight="regular" />
              {t("actionFailedCode")}
            </div>
            <TokenGenerateButton
              creating={creating}
              disabled={disabled}
              label={t("tryAgain")}
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
            <div className="mt-3.5 text-[14.5px] font-semibold">{t("noneTitle")}</div>
            <p className="mt-1.5 max-w-[400px] text-[13px] leading-[1.55] text-fg-muted">
              {t("noneDescription")}
            </p>
            <TokenGenerateButton
              creating={creating}
              disabled={disabled}
              label={t("create")}
              onGenerate={onGenerate}
            />
          </div>
        ) : null}
        {status === "active" && visibleToken ? (
          <div>
            <div className="text-[14.5px] font-semibold">{t("activeTitle")}</div>
            <p className="mt-1.5 text-[13px] leading-[1.55] text-fg-muted">
              {t("activeDescription")}
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
            <LocalizedCloudDestinationReachabilityHint
              surface="destination"
              targetOrigin={destinationUrl}
            />
          </div>
        ) : null}
      </div>
      {tokenSecurityNote && status !== "error" && (status === "none" || !visibleToken) ? (
        <div className="flex items-start gap-[9px] border-border border-t bg-bg-sunken px-[22px] py-3.5 text-[12px] leading-[1.5] text-fg-muted">
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
