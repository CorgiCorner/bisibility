"use client";

import { Button } from "@/components/ui";
import {
  ArrowBendDownRightIcon as ArrowBendDownRight,
  ArrowsClockwiseIcon as ArrowsClockwise,
  CheckIcon as Check,
  CheckCircleIcon as CheckCircle,
  CopyIcon as Copy,
  KeyIcon as Key,
  PlusIcon as Plus,
  ProhibitIcon as Prohibit,
  WarningCircleIcon as WarningCircle,
  WarningOctagonIcon as WarningOctagon,
} from "@phosphor-icons/react";
import type { ActiveMigrationToken, IssuedMigrationToken } from "./cloud-token";
import { TokenMeta } from "./MigrationTokenMeta";

export type MigrationTokenStatus = "none" | "active" | "created" | "error";
export type MigrationTokenPendingAction = "create" | "regenerate" | "revoke";

type MigrationTokenCardProps = {
  activeToken: ActiveMigrationToken | null;
  copied: boolean;
  disabled?: boolean;
  errorMessage: string | null;
  errorTitle?: string;
  issuedToken: IssuedMigrationToken | null;
  onCopy: () => void;
  onGenerate: () => void;
  onRegenerate: () => void;
  onRevoke: () => void;
  pendingAction?: MigrationTokenPendingAction | null;
  sourceLabel?: string;
  status: MigrationTokenStatus;
  transferInstruction?: string;
  workspaceName: string;
};

const primaryButton =
  "inline-flex items-center gap-2 rounded-[10px] bg-accent-solid px-4.5 py-[11px] font-semibold text-[14px] text-primary-contrast transition-colors hover:bg-accent-solid-hover disabled:cursor-not-allowed disabled:bg-bg-sunken disabled:text-fg-muted";
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
  const revoking = pendingAction === "revoke";
  const regenerating = pendingAction === "regenerate";

  return (
    <div className="mt-4.5 flex items-center gap-2.5 border-border-soft border-t pt-4">
      <Button
        disabled={disabled}
        onClick={onRevoke}
        size="sm"
        startIcon={
          revoking ? (
            <ArrowsClockwise aria-hidden className="animate-spin" size={13} />
          ) : (
            <Prohibit aria-hidden size={13} />
          )
        }
        sx={{ color: "var(--red-text)" }}
        type="button"
        variant="secondary"
      >
        {revoking ? "Revoking" : "Revoke token"}
      </Button>
      <Button
        disabled={disabled}
        onClick={onRegenerate}
        size="sm"
        startIcon={
          <ArrowsClockwise
            aria-hidden
            className={regenerating ? "animate-spin" : undefined}
            size={13}
          />
        }
        type="button"
        variant="ghost"
      >
        {regenerating ? "Regenerating" : "Regenerate"}
      </Button>
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
      <Icon aria-hidden className={creating ? "animate-spin" : undefined} size={15} weight="bold" />
      {creating ? "Creating token" : label}
    </button>
  );
}

export function MigrationTokenCard({
  activeToken,
  copied,
  disabled,
  errorMessage,
  errorTitle = "Couldn't create token",
  issuedToken,
  onCopy,
  onGenerate,
  onRegenerate,
  onRevoke,
  pendingAction,
  sourceLabel = "self-hosted instance",
  status,
  transferInstruction = "Open Migrate to hosted instance / Transfer, choose Push to hosted instance, and paste this token to start the import.",
  workspaceName,
}: Readonly<MigrationTokenCardProps>) {
  const visibleToken = issuedToken ?? activeToken;
  const creating = pendingAction === "create";

  return (
    <div className="mt-7 overflow-hidden rounded-2xl border border-border bg-bg-elev">
      <div className="flex items-center gap-[13px] border-border-soft border-b p-[20px_22px]">
        <span className="grid h-[42px] w-[42px] flex-none place-items-center rounded-[11px] bg-accent-soft text-accent-text">
          <Key aria-hidden size={21} weight="fill" />
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
            <span className="grid h-[50px] w-[50px] place-items-center rounded-[14px] bg-red/10 text-red-text">
              <WarningOctagon aria-hidden size={26} weight="fill" />
            </span>
            <div className="mt-3.5 text-[14.5px] font-semibold">{errorTitle}</div>
            <p className="mt-1.5 max-w-[400px] text-[13px] leading-[1.55] text-fg-muted">
              {errorMessage ?? "No token was issued. Nothing was exposed."}
            </p>
            <div className="mt-3.5 inline-flex items-center gap-[7px] rounded-lg bg-bg-sunken px-[11px] py-[5px] font-mono text-[11px] text-fg-muted">
              <WarningCircle aria-hidden className="text-red-text" size={13} />
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
            <span className="grid h-[50px] w-[50px] place-items-center rounded-[14px] bg-bg-sunken text-fg-muted">
              <Key aria-hidden size={26} />
            </span>
            <div className="mt-3.5 text-[14.5px] font-semibold">No active token</div>
            <p className="mt-1.5 max-w-[380px] text-[13px] leading-[1.55] text-fg-muted">
              Create a token to start an import. It is shown once, expires automatically, and can
              only be used a single time.
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
            <div className="mb-[9px] font-mono text-[10px] uppercase tracking-[0.6px] text-fg-muted">
              Active migration token
            </div>
            <div className="rounded-xl border border-border bg-bg-sunken p-[15px_16px]">
              <div className="flex items-start gap-2.5">
                <CheckCircle
                  aria-hidden
                  className="mt-px flex-none text-green-text"
                  size={16}
                  weight="fill"
                />
                <div className="min-w-0 flex-1 text-[13px] leading-[1.55] text-fg">
                  A token is active for this project. For security, the raw token was shown only
                  when it was created. Regenerate it if you need to copy a new value.
                </div>
              </div>
            </div>
            <TokenMeta token={visibleToken} workspaceName={workspaceName} />
            <TokenActions
              disabled={disabled}
              onRegenerate={onRegenerate}
              onRevoke={onRevoke}
              pendingAction={pendingAction}
            />
          </div>
        ) : null}
        {status === "created" && visibleToken ? (
          <div>
            <div className="mb-[9px] font-mono text-[10px] uppercase tracking-[0.6px] text-fg-muted">
              Step 1: your migration token
            </div>
            <div className="flex items-center gap-3 rounded-xl border-[1.5px] border-accent bg-bg p-[15px_15px_15px_18px]">
              <Key aria-hidden className="flex-none text-accent-text" size={19} />
              <span className="min-w-0 flex-1 truncate font-mono text-[15px] font-semibold text-fg">
                {issuedToken?.token}
              </span>
              <Button
                disabled={disabled}
                onClick={onCopy}
                startIcon={
                  copied ? (
                    <Check aria-hidden size={14} weight="bold" />
                  ) : (
                    <Copy aria-hidden size={14} />
                  )
                }
                sx={{ flex: "none" }}
                type="button"
                variant="primary"
              >
                Copy
              </Button>
            </div>
            <div className="mt-[9px] flex items-center gap-[7px] font-mono text-[11px] font-semibold text-green-text">
              <CheckCircle aria-hidden size={13} weight="fill" />
              Shown once. Copy it before you leave this page.
            </div>

            <div className="mt-4.5 flex items-start gap-[11px] rounded-xl border border-border bg-bg-elev p-[15px_16px]">
              <ArrowBendDownRight
                aria-hidden
                className="mt-px flex-none text-accent-text"
                size={16}
                weight="bold"
              />
              <span className="flex-1 text-[13px] leading-[1.55] text-fg">
                <strong className="font-semibold">Step 2: paste it into the source.</strong>{" "}
                {transferInstruction}
              </span>
            </div>

            <TokenMeta token={visibleToken} workspaceName={workspaceName} />
            <TokenActions
              disabled={disabled}
              onRegenerate={onRegenerate}
              onRevoke={onRevoke}
              pendingAction={pendingAction}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
