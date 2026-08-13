import { SessionSpendProvider } from "@/components/cost-estimate/SessionSpendProvider";
import type { AnalyzeBacklinksAction, LoadMoreBacklinkRowsAction } from "@/lib/actions/backlinks";
import type { Meta, StoryObj } from "@storybook/react";
import { BacklinksWorkspace } from "./BacklinksWorkspace";

const meta = {
  component: BacklinksWorkspace,
  decorators: [
    (Story) => (
      <SessionSpendProvider>
        <div className="min-h-screen bg-bg p-6 text-fg">
          <Story />
        </div>
      </SessionSpendProvider>
    ),
  ],
  parameters: { layout: "fullscreen" },
  title: "Backlinks/Workspace",
} satisfies Meta<typeof BacklinksWorkspace>;

export default meta;
type Story = StoryObj<typeof meta>;

const analyzeAction = (async (input: unknown) => {
  const request = input as { target: string; targetScope?: "page" | "site" };
  return {
    cached: false,
    cachedUntil: new Date(Date.now() + 86_400_000).toISOString(),
    costCents: request.targetScope === "page" ? 3 : 5,
    estimate: true,
    estimatedCostCents: request.targetScope === "page" ? 3 : 5,
    fetchedAt: new Date().toISOString(),
    fetchedRowCount: 0,
    history: [],
    includeSubdomains: request.targetScope !== "page",
    ok: true,
    provider: "dataforseo",
    rows: [],
    summary: {
      backlinksTotal: 0,
      brokenBacklinks: 0,
      brokenPages: 0,
      dofollowPct: 0,
      domainRank: 0,
      lostBacklinks: 0,
      lostReferringDomains: 0,
      newBacklinks: 0,
      newReferringDomains: 0,
      referringDomainsTotal: 0,
      referringPages: 0,
      spamScore: 0,
    },
    target: request.target,
    targetScope: request.targetScope ?? "site",
    totalRowsAvailable: 0,
  };
}) as AnalyzeBacklinksAction;
const loadMoreAction = (async () => ({
  ok: false,
  reason: "in_progress",
})) as LoadMoreBacklinkRowsAction;

export const Idle: Story = {
  args: {
    analyzeAction,
    context: {
      costContext: { capCents: 5000, spentCents: 1246 },
      defaultTarget: "acme-store.com",
      recentTargets: [],
    },
    loadMoreAction,
    projectId: "prj_story",
  },
};
