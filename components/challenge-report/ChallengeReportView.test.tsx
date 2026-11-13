import { AgentReportDetail } from "@/components/agent-reports/AgentReportDetail";
import { challengeReportBlocks } from "@/components/agent-reports/challenge-report-layout";
import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import { disconnectedChallengeBody, sampleChallengeBody } from "@/lib/challenge-report/fixtures";
import messages from "@/messages/core/en/agent-workspace.json";
import challenge from "@/messages/core/en/challenge-report.json";
import shared from "@/messages/core/en/shared.json";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChallengeReportLessonsForm } from "./ChallengeReportLessonsForm";
import { ChallengeReportView } from "./ChallengeReportView";

const catalog = { ...shared, ...messages, ...challenge };
const reportId = "agr_abcdefghijklmnopqrstuvwx";
const projectRef = "prj_abcdefghijklmnopqrstuvwx";

function renderView(body = sampleChallengeBody()) {
  return renderWithFeatureMessages(<ChallengeReportView body={body} />, { messages: catalog });
}

describe("challenge report view", () => {
  it("renders every tile from the body", () => {
    renderView();
    for (const id of [
      "clicks",
      "activeDays",
      "aiAnswers",
      "existingVsNew",
      "top10",
      "conversions",
      "topPages",
      "cost",
    ]) {
      expect(document.querySelector(`[data-challenge-tile="${id}"]`)).not.toBeNull();
    }
    expect(document.querySelector("[data-challenge-blocks]")).toHaveAttribute(
      "data-challenge-blocks",
      challengeReportBlocks.join(" "),
    );
    expect(screen.getByText("How this was measured")).toBeInTheDocument();
    expect(screen.getByText("The guide earned clicks.")).toBeInTheDocument();
    expect(screen.queryByText("Still unknown")).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Worked days in the period" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Day 2: worked" })).toBeInTheDocument();
    expect(screen.getByText("This period")).toBeInTheDocument();
    expect(screen.getByText("30 days before")).toBeInTheDocument();
    expect(document.querySelector('[data-challenge-tile="clicks"]')).toHaveAttribute(
      "data-bento-lg",
      "8",
    );
    expect(document.querySelector('[data-challenge-tile="cost"]')).toHaveAttribute(
      "data-bento-lg",
      "4",
    );
  });

  it("keeps legacy answers and saves selected and custom questions in order", async () => {
    const saveAction = vi.fn().mockResolvedValue({ ok: true });
    renderWithFeatureMessages(
      <ChallengeReportLessonsForm
        lessons={{ dropped: "", unknown: "", worked: "The guide earned clicks." }}
        projectId={projectRef}
        reportId={reportId}
        saveAction={saveAction}
      />,
      { messages: catalog },
    );
    expect(screen.getByDisplayValue("The guide earned clicks.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save lessons" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add a question" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "What did you observe?" }));
    const suggestedAnswer = screen.getByRole("textbox", { name: "What did you observe?" });
    await waitFor(() => expect(suggestedAnswer).toHaveFocus());
    fireEvent.change(suggestedAnswer, { target: { value: "Rankings held steady." } });
    fireEvent.click(screen.getByRole("button", { name: "Add a question" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Add your own question" }));
    const customQuestion = screen.getAllByRole("textbox", { name: "Question" })[1];
    await waitFor(() => expect(customQuestion).toHaveFocus());
    fireEvent.change(customQuestion, { target: { value: "What took longest?" } });
    fireEvent.change(screen.getAllByRole("textbox", { name: "Answer" })[1], {
      target: { value: "Checking internal links." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save lessons" }));
    await waitFor(() =>
      expect(saveAction).toHaveBeenCalledWith({
        lessons: {
          entries: [
            { question: "What worked", answer: "The guide earned clicks." },
            { question: "What did you observe?", answer: "Rankings held steady." },
            { question: "What took longest?", answer: "Checking internal links." },
          ],
        },
        projectId: projectRef,
        reportId,
      }),
    );
  });

  it("shows answered custom questions in a read-only report", () => {
    renderView({
      ...sampleChallengeBody(),
      lessons: {
        entries: [
          { question: "What took longest?", answer: "Checking internal links." },
          { question: "Still working on this", answer: "" },
        ],
      },
    });
    expect(screen.getByRole("heading", { name: "What took longest?" })).toBeInTheDocument();
    expect(screen.getByText("Checking internal links.")).toBeInTheDocument();
    expect(screen.queryByText("Still working on this")).not.toBeInTheDocument();
  });

  it("says when a tile has no data instead of showing zero", () => {
    renderView(disconnectedChallengeBody());
    const clicks = document.querySelector('[data-challenge-tile="clicks"]');
    const pages = document.querySelector('[data-challenge-tile="existingVsNew"]');
    expect(clicks).toHaveTextContent("Search Console is not connected.");
    expect(clicks).not.toHaveTextContent("0");
    expect(pages).toHaveTextContent("There is no Day 1 page snapshot yet.");
    expect(pages).not.toHaveTextContent("0");
  });

  it("offers refresh only while the report is a draft and keeps lessons editable", () => {
    const body = sampleChallengeBody();
    const report = {
      body,
      createdAt: "2026-02-01T00:00:00.000Z",
      id: reportId,
      kind: "challenge_report" as const,
      provenance: { source: "challenge_report" },
      title: "30 days of SEO: example.com",
    };
    const { rerender } = renderWithFeatureMessages(
      <AgentReportDetail
        canEditLessons
        canRefresh
        draft
        draftLabel="Draft"
        kindLabel="Challenge report"
        projectId={projectRef}
        projectRef={projectRef}
        provenanceLabel="Provenance"
        refreshAction={vi.fn()}
        report={report}
        savedDetailsLabel="Saved details"
        saveLessonsAction={vi.fn()}
      />,
      { messages: catalog },
    );
    expect(screen.getByRole("button", { name: "Refresh numbers" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a question" })).toBeInTheDocument();
    rerender(
      <AgentReportDetail
        canEditLessons
        canRefresh={false}
        draft
        draftLabel="Draft"
        kindLabel="Challenge report"
        projectRef={projectRef}
        provenanceLabel="Provenance"
        report={report}
        savedDetailsLabel="Saved details"
        saveLessonsAction={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Refresh numbers" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a question" })).toBeInTheDocument();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });

  it("renders the challenge kind from the report detail", () => {
    const body = sampleChallengeBody();
    renderWithFeatureMessages(
      <AgentReportDetail
        canRefresh
        draft
        draftLabel="Draft"
        kindLabel="Challenge report"
        projectRef={projectRef}
        provenanceLabel="Provenance"
        refreshAction={vi.fn()}
        report={{
          body,
          createdAt: "2026-02-01T00:00:00.000Z",
          id: reportId,
          kind: "challenge_report",
          provenance: { source: "challenge_report" },
          title: "30 days of SEO: example.com",
        }}
        savedDetailsLabel="Saved details"
      />,
      { messages: catalog },
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "30 days of SEO: example.com",
    );
    expect(screen.getByText("Challenge report · Draft")).toBeInTheDocument();
    expect(screen.queryByText("Provenance")).not.toBeInTheDocument();
  });
});

it("renders a changed report stage and body on soft navigation", () => {
  const body = sampleChallengeBody();
  const { rerender } = renderView(body);
  rerender(
    <ChallengeReportView
      body={{ ...body, stage: "day60", lessons: { ...body.lessons, worked: "Updated lesson" } }}
    />,
  );
  expect(screen.getByText("Updated lesson")).toBeInTheDocument();
  expect(screen.queryByText("The guide earned clicks.")).not.toBeInTheDocument();

  rerender(<ChallengeReportView body={body} />);
  expect(screen.getByText("The guide earned clicks.")).toBeInTheDocument();
});
