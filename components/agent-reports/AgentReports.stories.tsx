import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import type { AgentReportResource, AgentReportSummary } from "@/lib/agent-reports/model";
import messages from "@/messages/core/en/agent-workspace.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { AgentReportDetail } from "./AgentReportDetail";
import { AgentReportHistory } from "./AgentReportHistory";
import { AgentReportsLayout, AgentReportsLoading, AgentReportsToolbar } from "./AgentReportsLayout";

const projectRef = "prj_abcdefghijklmnopqrstuvwx";
const reports: AgentReportSummary[] = [
  {
    id: "agr_abcdefghijklmnopqrstuvwx",
    kind: "site_audit",
    title: "Site audit - acme.dev",
    createdAt: "2026-10-02T12:00:00.000Z",
  },
  {
    id: "agr_bcdefghijklmnopqrstuvwxy",
    kind: "prompt_explorer",
    title: "Inventory planning software - model comparison",
    createdAt: "2026-10-01T12:00:00.000Z",
  },
  {
    id: "agr_cdefghijklmnopqrstuvwxyz",
    kind: "manual_analysis",
    title: "Category content opportunities",
    createdAt: "2026-09-30T12:00:00.000Z",
  },
];

const analysisReport: AgentReportResource = {
  id: "agr_cdefghijklmnopqrstuvwxyz",
  kind: "manual_analysis",
  title: "Category content opportunities",
  createdAt: "2026-09-30T12:00:00.000Z",
  body: {
    analysis:
      "The inventory planning guide answers the core question, but its page title does not identify the intended reader. Add a concise audience signal and link the guide from the product overview.",
    recommendations: [
      "Clarify the guide title for independent retail teams.",
      "Add a descriptive internal link from the product overview.",
    ],
    evidence: { source: "Saved site audit", inspectedPages: 12, paidProviderCalls: 0 },
  },
  provenance: { source: "project_member" },
};

function HistoryView() {
  return (
    <div className="grid gap-4">
      <AgentReportHistory reports={reports} projectRef={projectRef} locale="en" timeZone="UTC" />
    </div>
  );
}

function AnalysisView() {
  return (
    <div className="grid gap-4">
      <AgentReportDetail
        report={analysisReport}
        projectRef={projectRef}
        provenanceLabel={messages.agentWorkspace.provenance}
      />
    </div>
  );
}

function AgentReportsStory({
  view,
}: Readonly<{ view: "history" | "analysis" | "empty" | "loading" }>) {
  return (
    <FeatureMessagesProvider
      locale="en"
      messages={{ ...sharedMessages, ...messages }}
      timeZone="UTC"
    >
      {view === "analysis" ? (
        <div className="mx-auto max-w-[1040px]">
          <AnalysisView />
        </div>
      ) : view === "loading" ? (
        <AgentReportsLoading
          description={messages.agentWorkspace.reportsDescription}
          addReportLabel={messages.agentWorkspace.addReport}
        />
      ) : (
        <AgentReportsLayout>
          <AgentReportsToolbar
            description={messages.agentWorkspace.reportsDescription}
            action={<Button variant="secondary">{messages.agentWorkspace.addReport}</Button>}
          />
          {view === "history" ? (
            <HistoryView />
          ) : (
            <EmptyState
              title={messages.agentWorkspace.emptyTitle}
              description={messages.agentWorkspace.emptyDescription}
            />
          )}
        </AgentReportsLayout>
      )}
    </FeatureMessagesProvider>
  );
}

const meta = {
  component: AgentReportsStory,
  title: "Agent workspace/Reports",
  parameters: { layout: "padded", chromatic: { viewports: [390, 1440] } },
} satisfies Meta<typeof AgentReportsStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const History: Story = { args: { view: "history" } };
export const Analysis: Story = { args: { view: "analysis" } };
export const Empty: Story = { args: { view: "empty" } };
export const Loading: Story = { args: { view: "loading" } };
