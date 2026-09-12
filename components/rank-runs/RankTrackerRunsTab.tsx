import { exhaustedBudgetNotices } from "@/components/rank-runs/budget-notices-model";
import { RankTrackerTabs } from "@/components/rank-tracker/RankTrackerTabs";
import { PageContent } from "@/components/shell/PageContent";
import { getKeywordCount } from "@/lib/queries/keywords";
import { getRankCheckRunCount, listRankCheckRuns } from "@/lib/queries/rank-check-runs";
import { savedKeywordCount } from "@/lib/queries/saved-keywords";
import { loadWorkspaceBudgetSummary } from "@/lib/queries/workspace-budget-summary";
import { appPath } from "@/lib/routing/app-path";
import { isBudgetExhausted } from "./budget-notices-model";
import { RunsSection } from "./RunsSection";

function rankRunsUrl(projectRef: string, segment: "history" | "planned") {
  return new URL(
    `https://example.com/api/rank-check-runs?project=${projectRef}&segment=${segment}&limit=20`,
  );
}

export async function RankTrackerRunsTab({
  projectId,
  projectRef,
}: Readonly<{ projectId: string; projectRef: string }>) {
  const [history, planned, runsCount, trackedCount, savedCount, budgetSummary] = await Promise.all([
    listRankCheckRuns(projectId, rankRunsUrl(projectRef, "history")),
    listRankCheckRuns(projectId, rankRunsUrl(projectRef, "planned")),
    getRankCheckRunCount(projectId),
    getKeywordCount(projectRef),
    savedKeywordCount(projectRef),
    loadWorkspaceBudgetSummary(projectId),
  ]);

  return (
    <PageContent>
      <section className="grid min-w-0 gap-4">
        <RankTrackerTabs
          activeTab="runs"
          projectRef={projectRef}
          runsCount={runsCount}
          savedCount={savedCount}
          trackedCount={trackedCount}
        />
        <RunsSection
          budgetExhausted={isBudgetExhausted({
            hasAllocation: budgetSummary?.hasAllocation ?? false,
            maxUsedPercent: budgetSummary?.maxUsedPercent ?? null,
          })}
          budgetSettingsHref={`/app/${projectRef}/integrations?tab=usage&budget=edit`}
          initialHistory={history}
          initialPlanned={planned}
          notices={exhaustedBudgetNotices({
            hasAllocation: budgetSummary?.hasAllocation ?? false,
            maxUsedPercent: budgetSummary?.maxUsedPercent ?? null,
            projectId: projectRef,
          })}
          projectRef={projectRef}
          schedulesHref={appPath(projectRef, "rank-tracker", "schedules")}
        />
      </section>
    </PageContent>
  );
}
