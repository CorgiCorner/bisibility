import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import { columnResult, entities } from "@/lib/model-playground/result-fixtures.test-support";
import { projectColumnResult } from "@/lib/model-playground/result-view";
import aiMessages from "@/messages/core/en/project-ai-research.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ModelPlaygroundResults } from "./ModelPlaygroundResults";

vi.mock("@/lib/actions/ai-tracking", () => ({ mutateAiTrackingAction: vi.fn() }));
vi.mock("./ModelPlaygroundHistory", () => ({ ModelPlaygroundHistoryButton: () => null }));
const props = {
  canTrack: false,
  columns: [],
  entities,
  funding: null,
  onRemove: vi.fn(),
  projectId: "prj_test",
  prompt: "test",
  running: false,
  sourceContext: { competitorDomains: [], excludedNames: [], overrides: [], ownDomain: null },
  topics: [],
  unfinished: false,
};
const render = (extra: Partial<React.ComponentProps<typeof ModelPlaygroundResults>>) =>
  renderWithFeatureMessages(<ModelPlaygroundResults {...props} {...extra} />, {
    messages: {
      ...sharedMessages,
      ...aiMessages,
      projectAiResearch: {
        ...aiMessages.projectAiResearch,
        modelPlayground: { ...aiMessages.projectAiResearch.modelPlayground },
      },
    },
  });
describe("results composition and legacy adapter", () => {
  it("N4 omits the run charge when there is no receipt", () => {
    render({
      columns: [{ id: "legacy", model: null, label: "Legacy" }],
      result: {
        rows: [
          {
            model: "legacy",
            answer: "Answer",
            prompt: "test",
            observedAt: null,
            citations: [],
            brandMentioned: false,
            domainCited: false,
          },
        ],
        costCents: 0,
        costStatus: "confirmed",
        failure: null,
        evidence: "synthetic_prompt_test",
        fetchedAt: "2026-11-10T12:00:00Z",
        totalAvailable: null,
        truncated: false,
      },
    });
    expect(screen.getByRole("article")).toHaveTextContent("Answer");
    expect(document.querySelector("[data-legacy-run-charge]")).toBeNull();
  });
  it("shows the matrix below Answers and in Brands, then separate Sources", async () => {
    render({ resultColumns: [projectColumnResult(columnResult())] });
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(
      screen.getByRole("article").compareDocumentPosition(screen.getByRole("table")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await userEvent.click(screen.getByRole("radio", { name: "Brands" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Sources" }));
    expect(screen.getByText("Provider-returned sources")).toBeInTheDocument();
  });
});
