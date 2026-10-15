import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { auditFixture } from "@/components/site-audit/story-fixtures";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import type { AgentReportResource, AgentReportSummary } from "@/lib/agent-reports/model";
import messages from "@/messages/core/en/agent-workspace.json";
import auditMessages from "@/messages/core/en/project-site-audit.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { AgentReportDetail } from "./AgentReportDetail";
import { AgentReportBack, AgentReportDetailFrame } from "./AgentReportDetailLayout";
import { AgentReportDetailLoading } from "./AgentReportDetailLoading";
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

function AnalysisView({ audit = false, legacy = false }: { audit?: boolean; legacy?: boolean }) {
  return (
    <AgentReportDetail
      report={
        audit
          ? {
              ...analysisReport,
              title: "Site audit - acme.com",
              kind: "site_audit",
              body: legacy
                ? {
                    pages: [
                      { url: "https://acme.com/", title: "Acme - keyword intelligence" },
                      { url: "https://acme.com/pricing", title: null, status: 200 },
                    ],
                  }
                : { ...auditFixture.result },
            }
          : analysisReport
      }
      projectRef={projectRef}
      provenanceLabel={messages.agentWorkspace.provenance}
      savedDetailsLabel={auditMessages.projectSiteAudit.savedDetails}
    />
  );
}

function AgentReportsStory({
  view,
}: Readonly<{
  view: "history" | "analysis" | "audit" | "legacy-audit" | "empty" | "loading" | "detail-loading";
}>) {
  return (
    <FeatureMessagesProvider
      locale="en"
      messages={{ ...sharedMessages, ...messages, ...auditMessages }}
      timeZone="UTC"
    >
      {view === "analysis" || view === "audit" || view === "legacy-audit" ? (
        <AgentReportDetailFrame>
          <AgentReportBack
            href={`/app/${projectRef}/agent-reports`}
            label={messages.agentWorkspace.back}
          />
          <AnalysisView
            audit={view === "audit" || view === "legacy-audit"}
            legacy={view === "legacy-audit"}
          />
        </AgentReportDetailFrame>
      ) : view === "detail-loading" ? (
        <AgentReportDetailLoading
          backLabel={messages.agentWorkspace.back}
          membersOnlyLabel={messages.agentWorkspace.membersOnly}
        />
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
export const DetailLoading: Story = { args: { view: "detail-loading" } };

export const SiteAudit: Story = { args: { view: "audit" } };

export const LegacySiteAudit: Story = { args: { view: "legacy-audit" } };
