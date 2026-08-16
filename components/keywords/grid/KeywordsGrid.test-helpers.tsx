import {
  SessionSpendProvider,
  useSessionSpend,
} from "@/components/cost-estimate/SessionSpendProvider";
import { KeywordImportProvider } from "@/components/keywords/import/KeywordImportProvider";
import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { render } from "@testing-library/react";
import type { ComponentProps } from "react";
import { vi } from "vitest";
import { KeywordsGrid } from "./KeywordsGrid";

type KeywordsGridProps = ComponentProps<typeof KeywordsGrid>;

export function SessionSpendProbe() {
  const { sessionCents } = useSessionSpend();
  return <output aria-label="session spend cents">{sessionCents}</output>;
}

export function pendingRows(count = 2): KeywordsGridProps["rows"] {
  return keywordRows.slice(0, count).map((row) => ({
    ...row,
    checkState: "never_checked",
    hasRankData: false,
    lastCheckAt: null,
    lastCheckStatus: null,
    position: 101,
    positionHistory: [],
    previousPosition: 101,
    rankingPath: null,
    rankingUrl: null,
    rankingUrlHistory: [],
    sparkline: [],
  }));
}

export function renderPendingGrid(overrides: Partial<KeywordsGridProps> = {}) {
  const actions = {
    addKeywordsAction: vi.fn().mockResolvedValue({ created: 1, keywords: [] }),
    bulkClearTargetAction: vi.fn().mockResolvedValue({ updated: 1 }),
    bulkDeleteAction: vi.fn().mockResolvedValue({ deleted: 1 }),
    bulkSetFrequencyAction: vi.fn().mockResolvedValue({ updated: 1 }),
    bulkSetTargetAction: vi.fn().mockResolvedValue({ updated: 1 }),
    bulkTagAction: vi.fn().mockResolvedValue({ updated: 1 }),
    canCreateKeyword: true,
    canDeleteKeyword: true,
    canManageProviders: true,
    canUpdateKeyword: true,
    deletableSavedViewIds: [],
    getFirstCheckRunPlanAction: vi.fn().mockResolvedValue({
      budget: { capCents: 5000, spentCents: 0 },
      budgetExhausted: false,
      estimatedCostPerCheckCents: 0.1,
      isSampleProject: false,
      providerReady: true,
      providers: ["dataforseo"],
      readyCount: 2,
      scope: {
        depth: "Top 100",
        device: "Desktop",
        engine: "Google",
        frequency: "Daily",
        location: "United States",
      },
    }),
    queueFirstChecksAction: vi.fn().mockResolvedValue({ queued: 1 }),
    updateKeywordAction: vi.fn().mockResolvedValue({ updated: 1 }),
  };

  render(
    <SessionSpendProvider>
      <SessionSpendProbe />
      <KeywordImportProvider activeProjectId="project_1">
        <KeywordsGrid
          {...actions}
          projectId="prj_1"
          providerConnected={false}
          rows={pendingRows()}
          savedViews={[]}
          tagSuggestions={[]}
          {...overrides}
        />
      </KeywordImportProvider>
    </SessionSpendProvider>,
  );

  return actions;
}
