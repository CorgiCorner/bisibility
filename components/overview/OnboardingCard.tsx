"use client";

import {
  KeywordSuggestionDrawer,
  type SuggestionCostContext,
} from "@/components/keywords/import/KeywordSuggestionDrawer";
import type { ImportTopQueriesAction } from "@/components/onboarding/steps/KeywordTopQueryImport";
import {
  type GettingStartedCapabilities,
  type GettingStartedProgress,
  gettingStartedActiveIndex,
} from "@/components/overview/getting-started";
import {
  ConnectStage,
  KeywordsStage,
  OptionsFooter,
  StagePanel,
} from "@/components/overview/OnboardingStages";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { StepDots } from "@/components/ui";
import type { TopQuerySuggestion } from "@/lib/keyword-suggest/sanitize-top-queries";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import { asProjectRef } from "@/lib/routing/app-path";
import { DEFAULT_SERP_DEPTH } from "@/lib/serp/markets";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type AddKeywordsAction = (input: {
  projectId: string;
  keywords: string[];
}) => Promise<unknown>;

export type OnboardingCardProps = {
  addKeywordsAction?: AddKeywordsAction;
  capabilities: GettingStartedCapabilities;
  costContext?: ProjectCostContext;
  importTopQueriesAction?: ImportTopQueriesAction;
  progress: GettingStartedProgress;
};

type DrawerData = { hidden: TopQuerySuggestion[]; suggestions: TopQuerySuggestion[] };

function suggestionCostContext(costContext?: ProjectCostContext): SuggestionCostContext {
  return {
    cronExpression: costContext?.cronExpression ?? null,
    depth: costContext?.depth ?? DEFAULT_SERP_DEPTH,
    deviceCount: costContext?.deviceCount ?? 1,
    frequency: costContext?.rawFrequency ?? "daily",
    locationCount: costContext?.locationCount ?? 1,
    overrideCents: costContext?.costPerCheckCents ?? null,
    providerId: costContext?.providerId ?? null,
  };
}

export function OnboardingCard({
  addKeywordsAction,
  capabilities,
  costContext,
  importTopQueriesAction,
  progress,
}: Readonly<OnboardingCardProps>) {
  const router = useRouter();
  const { readOnly } = useProjectWriteMode();
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<DrawerData | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerNonce, setDrawerNonce] = useState(0);

  const projectRef = progress.projectRef ?? asProjectRef(progress.projectId);
  const stage = gettingStartedActiveIndex(progress);
  const displayedStage = stage === 0 ? 3 : stage;
  const canImportQueries =
    progress.hasAnalyticsSource &&
    Boolean(importTopQueriesAction) &&
    Boolean(addKeywordsAction) &&
    !readOnly;

  async function openSuggestions() {
    if (!importTopQueriesAction || pending) return;
    setFeedback(null);
    setPending(true);
    try {
      const result = await importTopQueriesAction({ limit: 50, projectId: projectRef });
      if ("reason" in result) {
        setFeedback(
          result.reason === "no_source"
            ? "No Search Console source is connected."
            : "Google authorization has expired. Reconnect it under Integrations.",
        );
        return;
      }
      const suggestions = result.suggestions ?? result.queries.map((query) => ({ query }));
      if (suggestions.length === 0) {
        setFeedback("No queries observed yet - new Search Console properties can take a few days.");
        return;
      }
      setDrawer({ hidden: result.hidden ?? [], suggestions });
      setDrawerNonce((value) => value + 1);
      setDrawerOpen(true);
    } catch (error) {
      setFeedback(actionErrorMessage(error, "Could not load Search Console queries."));
    } finally {
      setPending(false);
    }
  }

  async function confirmSuggestions(queries: string[]) {
    setDrawerOpen(false);
    if (queries.length === 0 || !addKeywordsAction) return;
    setPending(true);
    try {
      await addKeywordsAction({ keywords: queries, projectId: projectRef });
      // The card is state-driven: refreshing re-reads progress and morphs it to step 3.
      router.refresh();
    } catch (error) {
      setFeedback(actionErrorMessage(error, "Could not add the selected keywords."));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-6">
      <StepDots
        className="flex items-center gap-2.5"
        currentIndex={displayedStage - 1}
        items={[1, 2, 3]}
        label={
          <span className="font-mono text-[10px] uppercase tracking-[0.6px] text-fg-muted">
            Step {displayedStage} of 3
          </span>
        }
      />
      {stage === 1 ? (
        <ConnectStage
          capabilities={capabilities}
          gscOAuthConfigured={progress.gscOAuthConfigured}
          projectRef={projectRef}
        />
      ) : null}
      {stage === 2 ? (
        <KeywordsStage
          canCreateKeywords={capabilities.canCreateKeywords}
          canImportQueries={canImportQueries}
          onImport={() => void openSuggestions()}
          pending={pending}
          projectRef={projectRef}
        />
      ) : null}
      {stage === 3 || stage === 0 ? (
        <StagePanel
          description="Positions, trends and highlights appear here after it completes - no action needed."
          title="First check runs automatically"
        />
      ) : null}
      {feedback ? (
        <p className="m-0 mt-3 text-[12.5px] text-fg-muted" role="status">
          {feedback}
        </p>
      ) : null}
      <OptionsFooter capabilities={capabilities} projectRef={projectRef} />
      {drawer ? (
        <KeywordSuggestionDrawer
          costContext={suggestionCostContext(costContext)}
          existingKeywords={[]}
          hidden={drawer.hidden}
          key={drawerNonce}
          onClose={() => setDrawerOpen(false)}
          onConfirm={(queries) => void confirmSuggestions(queries)}
          open={drawerOpen}
          suggestions={drawer.suggestions}
        />
      ) : null}
    </div>
  );
}
