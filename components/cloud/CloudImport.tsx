"use client";

import {
  type ActiveMigrationToken,
  type CloudImportJobData,
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
import { TransferPanel } from "@/components/cloud/TransferPanel";
import { useCloudImportJobPoll } from "@/components/cloud/use-cloud-import-job";
import { type ActionResult, unwrapActionResult } from "@/lib/actions/action-result";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

type CloudImportProps = {
  activeToken: ActiveMigrationToken | null;
  canManage: boolean;
  copy?: CloudImportCopy;
  destinationUrl?: string;
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
  revokeMigrationTokenAction: (input: RevokeMigrationTokenForm) => Promise<ActionResult<unknown>>;
  workspaceName: string;
};

export type CloudImportCopy = {
  sourceLabel: string;
  tokenSecurityNote: string;
};

const defaultCopy: CloudImportCopy = {
  sourceLabel: "self-hosted instance",
  tokenSecurityNote:
    "The token grants import access to this project only, never your providers or billing. It expires automatically and can be revoked any time before use.",
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
  destinationUrl,
  importJob,
  mintMigrationTokenAction,
  pollJobAction,
  projectId,
  projectReadOnly = false,
  regenerateMigrationTokenAction,
  revokeMigrationTokenAction,
  workspaceName,
}: Readonly<CloudImportProps>) {
  const router = useRouter();
  const [issuedToken, setIssuedToken] = useState<IssuedMigrationToken | null>(null);
  const [message, setMessage] = useState<string | null>(null);
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
  const visibleIssuedToken = tokensInvalidated ? null : issuedToken;
  const visibleActiveToken = tokensInvalidated ? null : activeToken;
  const visibleToken = visibleIssuedToken ?? visibleActiveToken;
  const { job, setJob } = useCloudImportJobPoll({
    active: Boolean(visibleToken),
    initialJob: importJob,
    pollAction: pollJobAction,
    projectId,
  });
  const mintForm = useForm<MintMigrationTokenForm>({
    defaultValues: { projectId, scope: "full" },
    resolver: zodResolver(mintMigrationTokenFormSchema),
  });
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
          Migration controls are available to project admins and owners.
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
      } catch (error) {
        setFailedAction(actionType);
        setMessage(actionErrorMessage(error, "Migration action failed."));
      } finally {
        setPendingAction(null);
      }
    });
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
        router.refresh();
      } catch (error) {
        setFailedAction("revoke");
        setMessage(actionErrorMessage(error, "Migration action failed."));
      } finally {
        setPendingAction(null);
      }
    });
  }

  return (
    <section className="mt-1">
      <MigrationTokenCard
        activeToken={visibleActiveToken}
        disabled={projectReadOnly || isPending || pendingAction !== null}
        destinationUrl={destinationUrl}
        errorMessage={message}
        errorTitle={errorTitle}
        issuedToken={visibleIssuedToken}
        onGenerate={() => runMint(mintMigrationTokenAction, "create")}
        onRegenerate={() => runMint(regenerateMigrationTokenAction, "regenerate")}
        onRevoke={handleRevoke}
        pendingAction={pendingAction}
        sourceLabel={copy.sourceLabel}
        status={status}
        tokenSecurityNote={copy.tokenSecurityNote}
        workspaceName={workspaceName}
      />
      {projectReadOnly ? (
        <p className="m-0 mt-3 text-[12px] leading-normal text-yellow-text" role="status">
          Migration token controls are unavailable while this project is read-only. Return to
          Migration settings to finish or cancel the migration first.
        </p>
      ) : null}
      <TransferPanel
        hasToken={Boolean(visibleToken)}
        job={job}
        onNewToken={() => runMint(regenerateMigrationTokenAction, "regenerate")}
        projectRef={projectId}
        sourceLabel={copy.sourceLabel}
      />
    </section>
  );
}
