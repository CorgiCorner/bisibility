"use client";

import { GettingStartedChecklist } from "@/components/getting-started/GettingStartedChecklist";
import { RunChecksConfirmationModal } from "@/components/keywords/grid/RunChecksConfirmationModal";
import { useRunChecksModal } from "@/components/keywords/grid/useRunChecksModal";
import { useRankCheckBatchProgress } from "@/components/keywords/use-rank-check-batch-progress";
import type { RunCheckNowResult } from "@/lib/actions/rankCheck";
import type { CostRateInfo } from "@/lib/cost-estimate/project-estimate";
import type { SetupContext, SetupCta } from "@/lib/getting-started/setup-steps";
import type { KeywordRow } from "@/lib/queries/keywords";
import { appPath } from "@/lib/routing/app-path";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  context: SetupContext;
  now: Date;
  providerRate?: CostRateInfo;
  rows: KeywordRow[];
  runCheckNowAction: (input: unknown) => Promise<RunCheckNowResult>;
};

function FirstCheckController({
  context,
  now,
  providerRate,
  rows,
  runCheckNowAction,
}: Readonly<Props>) {
  const router = useRouter();
  const initialBatch = context.inFlightBatch;
  const [activeIds, setActiveIds] = useState<
    NonNullable<SetupContext["inFlightBatch"]>["rankCheckIds"]
  >(initialBatch?.rankCheckIds ?? []);
  const modal = useRunChecksModal({
    onSettled: () => router.refresh(),
    projectId: context.project.publicRef ?? "",
    providerRate,
    rows,
    runCheckNowAction,
  });

  const progress = useRankCheckBatchProgress({
    initialCompleted: initialBatch?.completed,
    onTerminal: (result) => {
      setActiveIds((current) => current.filter((id) => id !== result.rankCheckId));
      router.refresh();
    },
    projectId: context.project.publicRef ?? "",
    rankCheckIds: activeIds,
    total: initialBatch?.total ?? 0,
  });

  const liveContext: SetupContext = initialBatch
    ? {
        ...context,
        inFlightBatch: {
          completed: progress.completed,
          rankCheckIds: activeIds,
          total: initialBatch.total,
        },
      }
    : context;

  function handleCta(cta: SetupCta) {
    if (cta.id === "run_first_check") {
      modal.request(context.keywordIds);
      return;
    }
    if (cta.id === "add_keywords") {
      router.push(`${appPath(context.project.publicRef ?? "", "rank-tracker")}?add=1`);
      return;
    }
    if (cta.id === "connect_source") {
      router.push(appPath(context.project.publicRef ?? "", "integrations"));
      return;
    }
    router.push("/setup");
  }

  return (
    <>
      <GettingStartedChecklist context={liveContext} now={now} onCta={handleCta} />
      <RunChecksConfirmationModal
        flow={modal.flow}
        onClose={modal.close}
        onConfirm={() => void modal.confirm()}
        onRetry={modal.retry}
        projectId={context.project.publicRef ?? ""}
        providerRate={providerRate}
        rows={rows}
      />
    </>
  );
}

export function GettingStartedFirstCheckController(props: Readonly<Props>) {
  const batch = props.context.inFlightBatch;
  const batchKey = batch ? batch.rankCheckIds.join(":") || `empty:${batch.total}` : "idle";
  return <FirstCheckController key={batchKey} {...props} />;
}
