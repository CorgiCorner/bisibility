import { AgentReportHistory } from "@/components/agent-reports/AgentReportHistory";
import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import type { ReportShareSummary } from "@/lib/report-sharing/model";
import { defaultShareSettings } from "@/lib/report-sharing/settings";
import workspace from "@/messages/core/en/agent-workspace.json";
import challenge from "@/messages/core/en/challenge-report.json";
import shared from "@/messages/core/en/shared.json";
import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReportShareDialog } from "./ReportShareDialog";

const projectId = "prj_abcdefghijklmnopqrstuvwx";
const reportId = "agr_abcdefghijklmnopqrstuvwx";
const mocks = vi.hoisted(() => ({ publish: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/actions/report-sharing", () => ({
  publishReportShareAction: mocks.create,
  publishReportShareUpdateAction: mocks.publish,
  reissueReportShareAction: vi.fn(),
  revokeReportShareAction: vi.fn(),
  updateReportShareExpiryAction: vi.fn(),
  updateReportShareSettingsAction: vi.fn(),
}));

const messages = { ...shared, ...workspace, ...challenge };

function summary(overrides: Partial<ReportShareSummary> = {}): ReportShareSummary {
  return {
    access: "members",
    expires: "never",
    memberCount: 4,
    ownerIsViewer: true,
    ownerName: "Ada",
    pending: null,
    reportId,
    settings: defaultShareSettings(),
    teamHref: `/app/${projectId}/settings/team`,
    views7d: 7,
    ...overrides,
  };
}

function renderDialog(value: ReportShareSummary) {
  return renderWithFeatureMessages(
    <ReportShareDialog
      canEdit
      onClose={() => undefined}
      open
      projectId={projectId}
      summary={value}
      title="30 days of SEO"
    />,
    { messages },
  );
}

describe("share dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.publish.mockResolvedValue({
      ok: true,
      summary: summary({ access: "link" }),
      token: null,
    });
  });

  it("keeps a members-only report on project members", () => {
    renderDialog(summary());
    expect(screen.getByText("Only project members")).toBeInTheDocument();
    expect(screen.queryByText("Hide from search engines")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish update" })).not.toBeInTheDocument();
  });

  it("lets the author prepare a public link before publishing it", async () => {
    mocks.create.mockResolvedValue({
      ok: true,
      summary: summary({ access: "link" }),
      token: "local-token",
    });
    renderDialog(summary());
    fireEvent.click(screen.getByRole("button", { name: "Set up public link" }));
    expect(screen.getByText("Only project members")).toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(screen.getByRole("switch", { name: "Show lessons" })).not.toBeChecked();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Publish link" })));
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ projectId, reportId, showLessons: false }),
    );
    expect(screen.getByRole("button", { name: "Copy link" })).toBeEnabled();
  });

  it("shows link settings while the report is public", () => {
    renderDialog(summary({ access: "link" }));
    expect(screen.getByText("Hide from search engines")).toBeInTheDocument();
    expect(screen.getByText("7 views · 7 days")).toBeInTheDocument();
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "6 of 8 · Edit" })).toBeInTheDocument();
    expect(screen.getByText("Link expires")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Project members · 4" })).toHaveAttribute(
      "href",
      `/app/${projectId}/settings/team`,
    );
  });

  it("publishes a newer stage only after a choice", async () => {
    const pending = {
      reportId: "agr_bbbbbbbbbbbbbbbbbbbbbbbb",
      stage: "day60" as const,
      title: "Day 60",
    };
    mocks.publish.mockResolvedValue({
      ok: true,
      summary: summary({ access: "link", pending }),
      token: null,
    });
    renderDialog(
      summary({
        access: "link",
        pending: { reportId: "agr_bbbbbbbbbbbbbbbbbbbbbbbb", stage: "day60", title: "Day 60" },
      }),
    );
    expect(screen.getByRole("radio", { name: "Update this link" })).toBeChecked();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Publish update" }));
    });
    expect(mocks.publish).toHaveBeenCalledWith({ mode: "link", projectId, reportId });
    fireEvent.click(screen.getByRole("radio", { name: "Create a new link" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Publish update" }));
    });
    expect(mocks.publish).toHaveBeenLastCalledWith({ mode: "new", projectId, reportId });
  });

  it("uses the singular view count", () => {
    renderDialog(summary({ access: "link", views7d: 1 }));
    expect(screen.getByText("1 view · 7 days")).toBeInTheDocument();
  });
});

describe("who can open", () => {
  it("labels a public challenge report and a members-only report", () => {
    renderWithFeatureMessages(
      <AgentReportHistory
        audience={(report) =>
          report.audience === "link" ? "Anyone with the link" : "Project members"
        }
        locale="en"
        projectRef={projectId}
        reports={[
          {
            audience: "link",
            createdAt: "2026-10-02T00:30:00.000Z",
            id: reportId,
            kind: "challenge_report",
            title: "Day 30",
          },
          {
            audience: "members",
            createdAt: "2026-10-03T00:30:00.000Z",
            id: "agr_bbbbbbbbbbbbbbbbbbbbbbbb",
            kind: "manual_analysis",
            title: "Notes",
          },
        ]}
        timeZone="UTC"
      />,
      { messages },
    );
    expect(screen.getByText("Anyone with the link")).toBeInTheDocument();
    expect(screen.getByText("Project members")).toBeInTheDocument();
  });
});
