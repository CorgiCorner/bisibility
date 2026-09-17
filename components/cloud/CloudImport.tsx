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
import { useCloudImportActionError } from "@/components/cloud/useCloudImportActionError";
import { type ActionResult, unwrapActionResult } from "@/lib/actions/action-result";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

type CloudImportProps = {
  activeToken: ActiveMigrationToken | null;
  canManage: boolean;
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
  source?: CloudImportSource;
  workspaceName: string;
};

export type CloudImportSource = "instance" | "selfHost";

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
  destinationUrl,
  importJob,
  mintMigrationTokenAction,
  pollJobAction,
  projectId,
  projectReadOnly = false,
  regenerateMigrationTokenAction,
  revokeMigrationTokenAction,
  source = "selfHost",
  workspaceName,
}: Readonly<CloudImportProps>) {
  const router = useRouter();
  const t = useTranslations("cloudImport");
  const presentActionError = useCloudImportActionError();
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
      ? t("token.error.revoke")
      : failedAction === "regenerate"
        ? t("token.error.regenerate")
        : t("token.error.create");
  const sourceLabel = t(source === "selfHost" ? "source.selfHost" : "source.instance");
  const tokenSecurityNote = t(
    source === "selfHost" ? "token.security.cloud" : "token.security.instance",
  );

  if (!canManage) {
    return (
      <section className="mt-5 rounded-card border border-border bg-bg-elev px-5 py-4">
        <p className="m-0 text-[13px] text-fg-muted">{t("token.readOnlyRole")}</p>
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
        setMessage(presentActionError(error));
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
        setMessage(presentActionError(error));
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
        sourceLabel={sourceLabel}
        status={status}
        tokenSecurityNote={tokenSecurityNote}
        workspaceName={workspaceName}
      />
      {projectReadOnly ? (
        <p className="m-0 mt-3 text-[12px] leading-normal text-yellow-text" role="status">
          {t("token.error.writeLocked")}
        </p>
      ) : null}
      <TransferPanel
        hasToken={Boolean(visibleToken)}
        job={job}
        onNewToken={() => runMint(regenerateMigrationTokenAction, "regenerate")}
        projectRef={projectId}
        sourceLabel={sourceLabel}
      />
    </section>
  );
}
