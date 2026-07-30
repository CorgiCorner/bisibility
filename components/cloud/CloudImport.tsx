"use client";

import {
  type ActiveMigrationToken,
  type CloudImportJobData,
  type CloudImportPackageFile,
  type IssuedMigrationToken,
  type MintMigrationTokenForm,
  mintMigrationTokenFormSchema,
  type RevokeMigrationTokenForm,
  revokeMigrationTokenFormSchema,
} from "@/components/cloud/cloud-token";
import {
  MigrationTokenCard,
  type MigrationTokenPendingAction,
  type MigrationTokenStatus,
} from "@/components/cloud/MigrationTokenCard";
import { PackageTransferPanel } from "@/components/cloud/PackageTransferPanel";
import { TransferPanel } from "@/components/cloud/TransferPanel";
import { useCloudImportJobPoll } from "@/components/cloud/use-cloud-import-job";
import { type ActionResult, unwrapActionResult } from "@/lib/actions/action-result";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { LockSimpleIcon as LockSimple } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { useForm } from "react-hook-form";

type CloudImportProps = {
  activeToken: ActiveMigrationToken | null;
  canManage: boolean;
  copy?: CloudImportCopy;
  enableMigrationHoldAction: (input: { projectId: string }) => Promise<unknown>;
  exportPackageAction: (input: { projectId: string }) => Promise<CloudImportPackageFile>;
  importJob: CloudImportJobData;
  mintMigrationTokenAction: (
    input: MintMigrationTokenForm,
  ) => Promise<ActionResult<IssuedMigrationToken>>;
  pollJobAction: (input: { projectId: string }) => Promise<CloudImportJobData>;
  projectId: string;
  projectReadOnly?: boolean;
  regenerateMigrationTokenAction: (
    input: MintMigrationTokenForm,
  ) => Promise<ActionResult<IssuedMigrationToken>>;
  releaseMigrationHoldAction: (input: { projectId: string }) => Promise<unknown>;
  revokeMigrationTokenAction: (input: RevokeMigrationTokenForm) => Promise<ActionResult<unknown>>;
  workspaceName: string;
};

export type CloudImportCopy = {
  sourceLabel: string;
  tokenSecurityNote: string;
  transferInstruction: string;
};

const defaultCopy: CloudImportCopy = {
  sourceLabel: "self-hosted instance",
  tokenSecurityNote:
    "The token grants import access to this workspace only, never your providers or billing. It expires automatically and can be revoked any time before use.",
  transferInstruction:
    "Open Migrate to Cloud / Transfer, choose Push to Cloud, and paste this token to start the import.",
};

function migrationTokenStatus(
  message: string | null,
  issuedToken: IssuedMigrationToken | null,
  activeToken: ActiveMigrationToken | null,
): MigrationTokenStatus {
  if (message) return "error";
  if (issuedToken) return "created";
  return activeToken ? "active" : "none";
}

export function CloudImport({
  activeToken,
  canManage,
  copy = defaultCopy,
  enableMigrationHoldAction,
  exportPackageAction,
  importJob,
  mintMigrationTokenAction,
  pollJobAction,
  projectId,
  projectReadOnly = false,
  regenerateMigrationTokenAction,
  releaseMigrationHoldAction,
  revokeMigrationTokenAction,
  workspaceName,
}: Readonly<CloudImportProps>) {
  const router = useRouter();
  const [issuedToken, setIssuedToken] = useState<IssuedMigrationToken | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [tokensInvalidated, setTokensInvalidated] = useState(false);
  const [failedAction, setFailedAction] = useState<MigrationTokenPendingAction | null>(null);
  const [pendingAction, setPendingAction] = useState<MigrationTokenPendingAction | null>(null);
  const [isPending, startTransition] = useTransition();
  // A refreshed active token must clear the local invalidation mask; render-time
  // synchronization avoids an effect.
  const [syncedActiveTokenId, setSyncedActiveTokenId] = useState(activeToken?.id ?? null);
  const activeTokenId = activeToken?.id ?? null;
  if (activeTokenId !== syncedActiveTokenId) {
    setSyncedActiveTokenId(activeTokenId);
    setTokensInvalidated(false);
  }
  const handleTerminal = useCallback(() => setIsTransferring(false), []);
  const { job, refresh, setJob } = useCloudImportJobPoll({
    active: isTransferring,
    initialJob: importJob,
    onTerminal: handleTerminal,
    pollAction: pollJobAction,
    projectId,
  });
  const mintForm = useForm<MintMigrationTokenForm>({
    defaultValues: { projectId, scope: "full" },
    resolver: zodResolver(mintMigrationTokenFormSchema),
  });
  const visibleIssuedToken = tokensInvalidated ? null : issuedToken;
  const visibleActiveToken = tokensInvalidated ? null : activeToken;
  const visibleToken = visibleIssuedToken ?? visibleActiveToken;
  const status = migrationTokenStatus(message, visibleIssuedToken, visibleActiveToken);
  const errorTitle =
    failedAction === "revoke"
      ? "Couldn't revoke token"
      : failedAction === "regenerate"
        ? "Couldn't regenerate token"
        : "Couldn't create token";

  if (!canManage) {
    return (
      <section className="mt-5 rounded-[14px] border border-border bg-bg-elev px-5 py-4">
        <p className="m-0 text-[13px] text-fg-muted">
          Migration controls are available to workspace admins and owners.
        </p>
      </section>
    );
  }

  function runMint(
    action: (input: MintMigrationTokenForm) => Promise<ActionResult<IssuedMigrationToken>>,
    actionType: Exclude<MigrationTokenPendingAction, "revoke">,
  ) {
    setMessage(null);
    setFailedAction(null);
    setCopied(false);
    setPendingAction(actionType);
    const parsed = mintMigrationTokenFormSchema.safeParse(mintForm.getValues());
    if (!parsed.success) {
      setPendingAction(null);
      return;
    }
    startTransition(async () => {
      try {
        const result = unwrapActionResult(await action(parsed.data));
        setIssuedToken(result);
        setTokensInvalidated(false);
        setJob(result.importJob);
        setIsTransferring(false);
      } catch (error) {
        setFailedAction(actionType);
        setMessage(actionErrorMessage(error, "Cloud migration action failed."));
      } finally {
        setPendingAction(null);
      }
    });
  }

  function handleCopy() {
    if (visibleIssuedToken?.token) {
      void navigator.clipboard?.writeText(visibleIssuedToken.token);
      setCopied(true);
    }
  }

  function handleRevoke() {
    const tokenId = visibleToken?.id;
    setMessage(null);
    setFailedAction(null);
    setPendingAction("revoke");
    const parsed = revokeMigrationTokenFormSchema.safeParse({ projectId, tokenId });
    if (!parsed.success) {
      setPendingAction(null);
      return;
    }
    startTransition(async () => {
      try {
        unwrapActionResult(await revokeMigrationTokenAction(parsed.data));
        setIssuedToken(null);
        setTokensInvalidated(true);
        setCopied(false);
        setIsTransferring(false);
        router.refresh();
      } catch (error) {
        setFailedAction("revoke");
        setMessage(actionErrorMessage(error, "Cloud migration action failed."));
      } finally {
        setPendingAction(null);
      }
    });
  }

  return (
    <section className="mt-1">
      <MigrationTokenCard
        activeToken={visibleActiveToken}
        copied={copied}
        disabled={projectReadOnly || isPending || pendingAction !== null}
        errorMessage={message}
        errorTitle={errorTitle}
        issuedToken={visibleIssuedToken}
        onCopy={handleCopy}
        onGenerate={() => runMint(mintMigrationTokenAction, "create")}
        onRegenerate={() => runMint(regenerateMigrationTokenAction, "regenerate")}
        onRevoke={handleRevoke}
        pendingAction={pendingAction}
        sourceLabel={copy.sourceLabel}
        status={status}
        transferInstruction={copy.transferInstruction}
        workspaceName={workspaceName}
      />
      {projectReadOnly ? (
        <p className="m-0 mt-3 text-[12px] leading-normal text-yellow" role="status">
          Migration token controls are unavailable while this project is read-only. Return to
          Migration settings to finish or cancel the migration first.
        </p>
      ) : null}
      <PackageTransferPanel
        disabled={isPending || pendingAction !== null}
        exportPackageAction={exportPackageAction}
        onStatusRefresh={refresh}
        onTransferSuccess={() => {
          setIssuedToken(null);
          setTokensInvalidated(true);
          setCopied(false);
          router.refresh();
        }}
        onTransferEnd={async () => {
          setIsTransferring(false);
          try {
            await releaseMigrationHoldAction({ projectId });
            router.refresh();
          } catch (error) {
            setMessage(
              actionErrorMessage(
                error,
                "Transfer ended, but read-only mode could not be released. Retry from migration settings.",
              ),
            );
          }
        }}
        onTransferStart={async () => {
          try {
            await enableMigrationHoldAction({ projectId });
            setIsTransferring(true);
            router.refresh();
            return true;
          } catch (error) {
            setMessage(actionErrorMessage(error, "Read-only mode could not be enabled."));
            return false;
          }
        }}
        projectId={projectId}
        rawToken={visibleIssuedToken?.token ?? null}
      />
      <TransferPanel
        job={job}
        onNewToken={() => runMint(regenerateMigrationTokenAction, "regenerate")}
        projectRef={projectId}
        sourceLabel={copy.sourceLabel}
      />
      <div className="mt-[18px] flex items-start gap-[9px] text-[12px] leading-[1.5] text-fg-faint">
        <LockSimple aria-hidden className="mt-px flex-none text-green" size={14} />
        <span>{copy.tokenSecurityNote}</span>
      </div>
    </section>
  );
}
