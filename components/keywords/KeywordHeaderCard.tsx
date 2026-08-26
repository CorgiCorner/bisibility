"use client";

import { useToast } from "@/components/ui";
import { zodResolver } from "@/lib/forms/zod-resolver";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import { isBudgetExhaustedResult } from "@/lib/rank-check/budget-contract";
import {
  type AddKeywordsMatrixInput,
  type BulkKeywordIdsInput,
  type RunCheckNowInput,
  runCheckNowSchema,
} from "@/lib/schemas/keyword";
import { DEFAULT_SERP_DEPTH, type SerpDepth } from "@/lib/serp/markets";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import {
  type AddKeywordsInput,
  actionErrorMessage,
  type KeywordAction,
  type KeywordDetailActions,
} from "./action-utils";
import { KeywordDetailHeaderChrome } from "./KeywordDetailHeaderChrome";
import { KeywordHeaderActions } from "./KeywordHeaderActions";
import { KeywordMarketSwitcher } from "./KeywordMarketSwitcher";
import { KeywordMarketsDrawer } from "./KeywordMarketsDrawer";
import { exportHistoryCsv } from "./keyword-history-export";

type KeywordHeaderCardProps = KeywordDetailActions & {
  addKeywordsAction: KeywordAction<AddKeywordsInput>;
  addKeywordsMatrixAction?: KeywordAction<AddKeywordsMatrixInput>;
  bulkDeleteAction: KeywordAction<BulkKeywordIdsInput>;
  canCreateKeyword: boolean;
  canUpdateKeyword: boolean;
  costContext?: ProjectCostContext;
  keyword: KeywordRow;
  projectId: string;
  projectMarkets?: ProjectMarketsView;
  targets?: readonly KeywordRow[];
  tagSuggestions?: readonly string[];
};

export function KeywordHeaderCard({
  addKeywordsAction,
  addKeywordsMatrixAction,
  bulkDeleteAction,
  canCreateKeyword,
  canUpdateKeyword,
  costContext,
  keyword,
  projectId,
  projectMarkets,
  runCheckNowAction,
  targets = [keyword],
}: KeywordHeaderCardProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const {
    formState: { isSubmitting },
    handleSubmit,
    register,
  } = useForm<RunCheckNowInput>({
    defaultValues: { keywordId: keyword.id },
    resolver: zodResolver(runCheckNowSchema),
  });
  const effectiveDepth =
    keyword.schedule?.serp_depth ?? keyword.projectSerpDepth ?? DEFAULT_SERP_DEPTH;
  const providerRate = costContext
    ? {
        overrideCents: costContext.costPerCheckCents,
        providerId: costContext.providerId,
      }
    : undefined;

  async function handleRunCheckNow(values: RunCheckNowInput) {
    try {
      const result = await runCheckNowAction(values);
      if (isBudgetExhaustedResult(result)) {
        showToast(result.message, { tint: "red" });
        return;
      }
      showToast(`Check started (Top ${values.depth ?? effectiveDepth})`, { tint: "green" });
      router.refresh();
    } catch (error) {
      showToast(actionErrorMessage(error), { tint: "red" });
    }
  }

  const submitRunCheck = (depth: SerpDepth) =>
    handleSubmit((values) => handleRunCheckNow({ ...values, depth }))();

  return (
    <>
      <KeywordDetailHeaderChrome
        actions={
          <KeywordHeaderActions
            canUpdateKeyword={canUpdateKeyword}
            editing={editing}
            effectiveDepth={effectiveDepth}
            onExport={() => exportHistoryCsv(keyword)}
            onRunCheck={(depth) => submitRunCheck(depth).catch(() => undefined)}
            onToggleEdit={() => setEditing((value) => !value)}
            providerRate={providerRate}
            runPending={isSubmitting}
          />
        }
        dimensionControls={
          <KeywordMarketSwitcher
            addKeywordsAction={addKeywordsAction}
            bulkDeleteAction={bulkDeleteAction}
            canCreateKeyword={canCreateKeyword}
            keyword={keyword}
            projectId={projectId}
            projectMarkets={projectMarkets}
            targets={targets}
          />
        }
        keyword={keyword}
        providerId={costContext?.providerId}
        timeZone={costContext?.timezone ?? "UTC"}
      />
      <input type="hidden" {...register("keywordId")} />
      {canUpdateKeyword && projectMarkets && addKeywordsMatrixAction ? (
        <KeywordMarketsDrawer
          addKeywordsMatrixAction={addKeywordsMatrixAction}
          bulkDeleteAction={bulkDeleteAction}
          canCreateKeyword={canCreateKeyword}
          keyword={keyword}
          onClose={() => setEditing(false)}
          open={editing}
          projectId={projectId}
          projectMarkets={projectMarkets}
          targets={targets}
        />
      ) : null}
    </>
  );
}
