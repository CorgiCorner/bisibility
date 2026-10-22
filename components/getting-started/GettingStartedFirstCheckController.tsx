"use client";

import { GettingStartedChecklist } from "@/components/getting-started/GettingStartedChecklist";
import { useRankCheckBatchProgress } from "@/components/keywords/use-rank-check-batch-progress";
import { manualPreflightDepth, useRunPreflight } from "@/components/rank-runs/useRunPreflight";
import {
  addManualCompetitor,
  confirmSuggestedCompetitor,
  dismissCompetitorSuggestion,
  skipCompetitorSetup,
} from "@/lib/actions/competitor-set";
import type { RunCheckNowResult } from "@/lib/actions/rankCheck";
import type { CostRateInfo } from "@/lib/cost-estimate/project-estimate";
import { isPublicIdOfType, type PublicIdForPrefix } from "@/lib/db/public-id";
import type { SetupContext, SetupCta } from "@/lib/getting-started/setup-steps";
import type { KeywordRow } from "@/lib/queries/keywords";
import { appPath } from "@/lib/routing/app-path";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

type Props = {
  context: SetupContext;
  now: Date;
  providerRate?: CostRateInfo;
  rows: KeywordRow[];
  runCheckNowAction: (input: unknown) => Promise<RunCheckNowResult>;
};

function FirstCheckController({ context, now, providerRate, rows }: Readonly<Props>) {
  const router = useRouter();
  const initialBatch = context.inFlightBatch;
  const [activeIds, setActiveIds] = useState<
    NonNullable<SetupContext["inFlightBatch"]>["rankCheckIds"]
  >(initialBatch?.rankCheckIds ?? []);
  const t = useTranslations("shared.firstCheck");
  const preflight = useRunPreflight({
    projectId: context.project.publicRef ?? "",
    providerId: providerRate?.providerId,
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
      const keywordIds = context.keywordIds.filter((id): id is PublicIdForPrefix<"kw"> =>
        isPublicIdOfType(id, "kw"),
      );
      if (keywordIds.length !== context.keywordIds.length || !keywordIds.length) return;
      const selectedIds = new Set<string>(keywordIds);
      const selected = rows.filter((row) => selectedIds.has(row.id));
      void preflight.request({
        depth: manualPreflightDepth(selected, undefined, undefined),
        rows: selected,
        title: t("action"),
        spec: { kind: "selected", keywordIds, v: 1 },
      });
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
      <GettingStartedChecklist
        competitorActions={{
          addManualCompetitor,
          confirmSuggestedCompetitor,
          dismissCompetitorSuggestion,
          skipCompetitorSetup,
        }}
        context={liveContext}
        now={now}
        onCta={handleCta}
      />
      {preflight.dialog}
    </>
  );
}

export function GettingStartedFirstCheckController(props: Readonly<Props>) {
  const batch = props.context.inFlightBatch;
  const batchKey = batch ? batch.rankCheckIds.join(":") || `empty:${batch.total}` : "idle";
  return <FirstCheckController key={batchKey} {...props} />;
}
