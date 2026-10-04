"use client";

import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import type { ProviderActionHandlers, ProviderTrafficSyncResult } from "@/lib/integrations/types";
import { appPath } from "@/lib/routing/app-path";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";

function resultState(result: ProviderTrafficSyncResult) {
  const succeeded = result.runs.filter((run) =>
    ["succeeded_with_data", "succeeded_empty"].includes(run.status),
  ).length;
  if (succeeded > 0) {
    if (succeeded < result.runs.length) return "partial";
    return result.keywordSnapshots + result.pageSnapshots > 0 ? "updated" : "empty";
  }
  if (result.runs.some((run) => run.status === "skipped_needs_reauth")) return "reconnect";
  if (result.runs.some((run) => run.status === "deferred_rate_limit")) return "rateLimited";
  return result.runs.some((run) => run.status === "failed") ? "failed" : "unavailable";
}

export function KeywordTrafficSync({
  canSync = false,
  connected,
  projectRef,
  syncAction,
}: Readonly<{
  canSync?: boolean;
  connected: boolean;
  projectRef: string;
  syncAction?: ProviderActionHandlers["syncProjectTraffic"];
}>) {
  const t = useTranslations("projectRankTracker.keywordDetail.traffic.sync");
  const router = useRouter();
  const { readOnly, readOnlyReason } = useProjectWriteMode();
  const inFlight = useRef(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ReturnType<typeof resultState> | null>(null);

  function sync() {
    if (!canSync || !connected || readOnly || !syncAction || pending || inFlight.current) return;
    inFlight.current = true;
    setResult(null);
    startTransition(async () => {
      try {
        setResult(resultState(await syncAction({ projectId: projectRef })));
        router.refresh();
      } catch {
        setResult("failed");
      } finally {
        inFlight.current = false;
      }
    });
  }

  const messages = {
    updated: t("updated"),
    empty: t("empty"),
    partial: t("partial"),
    failed: t("failed"),
    reconnect: t("reconnect"),
    rateLimited: t("rateLimited"),
    unavailable: t("unavailable"),
  };
  const needsAttention = result && !["updated", "empty"].includes(result);
  return (
    <Card className="rounded-card" size="lg">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-60">
          <SectionTitle>{t("title")}</SectionTitle>
          <p className="m-0 mt-1 text-[12px] leading-5 text-fg-muted">{t("scope")}</p>
        </div>
        {canSync && connected && syncAction ? (
          <Button
            disabled={readOnly}
            loading={pending}
            loadingLabel={t("pending")}
            onClick={sync}
            size="sm"
            startIcon={<ArrowClockwiseIcon aria-hidden size={15} weight="regular" />}
            title={readOnlyReason ?? t("hint")}
            variant="secondary"
          >
            {t("action")}
          </Button>
        ) : null}
      </div>
      {connected ? (
        <p className="mb-0 mt-2 text-[12px] leading-5 text-fg-muted">{t("hint")}</p>
      ) : null}
      {result ? (
        <p
          className="mb-0 mt-3 text-[13px] leading-5 text-fg"
          role={needsAttention ? "alert" : "status"}
        >
          {messages[result]}
        </p>
      ) : null}
      {!connected || needsAttention ? (
        <Link
          className="mt-2 inline-flex text-[12px] font-semibold text-accent-text hover:underline"
          href={appPath(projectRef, "integrations")}
        >
          {t("integrations")}
        </Link>
      ) : null}
    </Card>
  );
}
