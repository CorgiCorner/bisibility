import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import type { AgentReportResource } from "@/lib/agent-reports/model";
import messages from "@/messages/core/en/agent-workspace.json";
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

function renderDetail(value = report) {
  return renderWithFeatureMessages(
    <AgentReportDetail report={value} projectRef={projectRef} provenanceLabel="Provenance" />,
    { messages: { ...shared, ...messages } },
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

  it("omits the provenance panel when the saved report has no provenance", () => {
    renderDetail({ ...report, provenance: {} });
    expect(screen.getByText("Clarify the guide title.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Provenance" })).not.toBeInTheDocument();
  });
});
