"use client";

import {
  KeywordSuggestionDrawer,
  type SuggestionCostContext,
  type SuggestionDrawerMessages,
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
import { StepDots } from "@/components/ui/StepDots";
import type { TopQuerySuggestion } from "@/lib/keyword-suggest/sanitize-top-queries";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import { asProjectRef } from "@/lib/routing/app-path";
import { DEFAULT_SERP_DEPTH } from "@/lib/serp/constants";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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

type OnboardingTranslator = ReturnType<typeof useTranslations<"projectDashboard.emptyOnboarding">>;

function dashboardSuggestionDrawerMessages(t: OnboardingTranslator): SuggestionDrawerMessages {
  return {
    add: (values) => t("import.drawer.add", values),
    cancel: t("import.drawer.cancel"),
    clear: t("import.drawer.clear"),
    clicks: t("import.drawer.clicks"),
    description: t("import.drawer.description"),
    filterAria: t("import.drawer.filterAria"),
    filterPlaceholder: t("import.drawer.filterPlaceholder"),
    hidden: (values) => t("import.drawer.hidden", values),
    hide: t("import.drawer.hide"),
    impressions: t("import.drawer.impressions"),
    inDraft: t("import.drawer.inDraft"),
    metric: (values) => t("import.drawer.metric", values),
    metricUnavailable: t("import.drawer.metricUnavailable"),
    monthlyChecks: (values) => t("import.drawer.monthlyChecks", values),
    monthlyChecksCostBelowCent: (values) => t("import.drawer.monthlyChecksCostBelowCent", values),
    monthlyChecksCost: (values) => t("import.drawer.monthlyChecksCost", values),
    query: t("import.drawer.query"),
    selected: (values) => t("import.drawer.selected", values),
    selectionCount: (values) => t("import.drawer.selectionCount", values),
    selectAll: t("import.drawer.selectAll"),
    show: t("import.drawer.show"),
    title: t("import.drawer.title"),
    top: (values) => t("import.drawer.top", values),
    tracked: t("import.drawer.tracked"),
    use: (values) => t("import.drawer.use", values),
  };
}

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
  const t = useTranslations("projectDashboard.emptyOnboarding");
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
          result.reason === "no_source" ? t("import.noSource") : t("import.authorizationExpired"),
        );
        return;
      }
      const suggestions = result.suggestions ?? result.queries.map((query) => ({ query }));
      if (suggestions.length === 0) {
        setFeedback(t("import.noQueries"));
        return;
      }
      setDrawer({ hidden: result.hidden ?? [], suggestions });
      setDrawerNonce((value) => value + 1);
      setDrawerOpen(true);
    } catch (error) {
      setFeedback(actionErrorMessage(error, t("import.loadError")));
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
      setFeedback(actionErrorMessage(error, t("import.addError")));
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
          <span className="font-sans tabular-nums text-[10px] uppercase tracking-[0.6px] text-fg-muted">
            {t("step", { current: displayedStage, total: 3 })}
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
        <StagePanel description={t("firstCheck.description")} title={t("firstCheck.title")} />
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
          messages={dashboardSuggestionDrawerMessages(t)}
          onClose={() => setDrawerOpen(false)}
          onConfirm={(queries) => void confirmSuggestions(queries)}
          open={drawerOpen}
          suggestions={drawer.suggestions}
        />
      ) : null}
    </div>
  );
}
