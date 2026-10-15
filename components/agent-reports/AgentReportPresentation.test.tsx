import { auditFixture, failedAuditFixture } from "@/components/site-audit/story-fixtures";
import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import type { AgentReportResource } from "@/lib/agent-reports/model";
import messages from "@/messages/core/en/agent-workspace.json";
import auditMessages from "@/messages/core/en/project-site-audit.json";
import shared from "@/messages/core/en/shared.json";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentReportDetail } from "./AgentReportDetail";
import { AgentReportHistory } from "./AgentReportHistory";

vi.mock("@/components/ui/Tooltip", () => import("@/tests/tooltip-stub"));

const projectRef = "prj_abcdefghijklmnopqrstuvwx";
const report: AgentReportResource = {
  id: "agr_abcdefghijklmnopqrstuvwx",
  title: "Category content opportunities",
  kind: "manual_analysis",
  createdAt: "2026-10-02T00:30:00.000Z",
  body: { analysis: "Clarify the guide title." },
  provenance: { source: "project_member" },
};

function renderDetail(
  value = report,
  savedDetailsLabel = auditMessages.projectSiteAudit.savedDetails,
) {
  return renderWithFeatureMessages(
    <AgentReportDetail
      report={value}
      projectRef={projectRef}
      provenanceLabel="Provenance"
      savedDetailsLabel={savedDetailsLabel}
    />,
    { messages: { ...shared, ...messages, ...auditMessages } },
  );
}

describe("shared report page presentation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the protected project path and regional date for each history entry", () => {
    const { container } = render(
      <AgentReportHistory
        reports={[report]}
        projectRef={projectRef}
        locale="en"
        timeZone="America/Los_Angeles"
      />,
    );
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      `/app/${projectRef}/agent-reports/${report.id}`,
    );
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(report.title);
    expect(screen.getByText("manual analysis")).toBeInTheDocument();
    expect(container.querySelector("time")).toHaveAttribute("datetime", report.createdAt);
    expect(container.querySelector("time")).toHaveTextContent("Oct 1, 2026");
  });

  it("copies the existing member-only deep link from the detail header", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    renderDetail();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(report.title);
    expect(screen.getByText(messages.agentWorkspace.membersOnly)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: messages.agentWorkspace.copyLink }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        `${window.location.origin}/app/${projectRef}/agent-reports/${report.id}`,
      ),
    );
  });

  it("escapes stored title, body and provenance rather than creating producer markup", () => {
    const payload = '<img src="x" onerror="alert(1)">';
    const { container } = renderDetail({
      ...report,
      title: "<script>alert(1)</script>",
      body: { analysis: payload },
      provenance: { source: "<iframe srcdoc='bad'>" },
    });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "<script>alert(1)</script>",
    );
    expect(screen.getByText(payload)).toBeInTheDocument();
    expect(screen.getByText("<iframe srcdoc='bad'>")).toBeInTheDocument();
    expect(container.querySelector("script,img,iframe")).toBeNull();
  });

  it("renders a saved site audit as the existing URL issues table and keeps metadata in page details", async () => {
    renderDetail({ ...report, kind: "site_audit", body: { ...auditFixture.result } });
    expect(screen.getByRole("table", { name: "URL issues" })).toBeInTheDocument();
    expect(screen.queryByText("max Duration Ms")).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Page details" })[0]);
    expect(await screen.findByRole("dialog", { name: "Page details" })).toHaveTextContent(
      "Monitor the keywords that matter to your business.",
    );
  });

  it("preserves unknown results in saved audits and safely falls back for legacy report bodies", () => {
    const view = renderDetail({
      ...report,
      kind: "site_audit",
      body: { ...failedAuditFixture.result },
    });
    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.queryByText("No title")).not.toBeInTheDocument();
    view.unmount();
    renderDetail({ ...report, kind: "site_audit", body: { analysis: "Legacy saved report" } });
    expect(screen.getByText("Legacy saved report")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("presents historical minimal saved pages without inventing completeness or SEO metrics", () => {
    renderDetail({
      ...report,
      kind: "site_audit",
      body: {
        pages: [
          { url: "https://example.com/", title: "Saved page" },
          { url: "https://example.com/pricing", title: null, status: 200 },
        ],
      },
    });
    expect(screen.getByRole("table", { name: "Saved pages" })).toHaveTextContent("Saved page");
    expect(screen.getByRole("table", { name: "Saved pages" })).toHaveTextContent("Unknown");
    expect(
      screen.queryByText(/pages fetched|confirmed indexable|0 ms|0 H1/),
    ).not.toBeInTheDocument();
  });

  it("uses the page-owned saved-details label for legacy audit bodies", () => {
    renderDetail(
      {
        ...report,
        kind: "site_audit",
        body: { pages: [{ url: "https://example.com/", title: "Saved page" }] },
      },
      "Page-owned saved audit details",
    );
    expect(
      screen
        .getByRole("heading", { level: 2, name: "Page-owned saved audit details" })
        .closest("summary"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        level: 2,
        name: auditMessages.projectSiteAudit.savedDetails,
      }),
    ).not.toBeInTheDocument();
  });

  it("omits the provenance panel when the saved report has no provenance", () => {
    renderDetail({ ...report, provenance: {} });
    expect(screen.getByText("Clarify the guide title.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Provenance" })).not.toBeInTheDocument();
  });
});
