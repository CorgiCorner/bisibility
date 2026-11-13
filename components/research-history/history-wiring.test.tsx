import { ModelPlaygroundHistoryButton } from "@/components/ai-research/ModelPlaygroundHistory";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { FetchAiOverview } from "@/components/keywords/FetchAiOverview";
import { SerpPlaygroundHistoryButton } from "@/components/keywords/serp-playground/SerpPlaygroundHistory";
import { KeywordResearchHistoryButton } from "@/components/research/KeywordResearchHistory";
import aiMessages from "@/messages/core/en/project-ai-research.json";
import rankMessages from "@/messages/core/en/project-rank-tracker-keyword-detail.json";
import researchMessages from "@/messages/core/en/project-research.json";
import historyMessages from "@/messages/core/en/research-history.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  launch: vi.fn(),
  readSerp: vi.fn(),
  readStored: vi.fn(),
  research: vi.fn(),
  savedOverview: vi.fn(),
  previewOverview: vi.fn(),
}));
vi.mock("@/lib/actions/research-history", () => ({
  loadKeywordResearchHistoryAction: vi.fn(async () => ({
    ok: true,
    page: {
      chips: [],
      groups: [
        {
          day: "2026-11-10",
          label: "today",
          rows: [
            {
              cost: { kind: "cached" },
              key: "stored-key",
              meta: { kind: "keyword", mode: "ideas", scope: "United States / English" },
              occurredAt: "2026-11-10T12:00:00.000Z",
              pinned: false,
              title: "example.com keyword",
            },
          ],
        },
      ],
      nextCursor: null,
      pinnedCount: 0,
      timeZone: "UTC",
      total: 1,
    },
  })),
  loadModelPlaygroundHistoryAction: vi.fn(async () => ({
    ok: true,
    page: {
      chips: [],
      groups: [
        {
          day: "2026-11-10",
          label: "today",
          rows: [
            {
              cost: { kind: "unknown" },
              key: "agr_savedreport000000000000",
              meta: { engines: ["chat_gpt"], kind: "model" },
              occurredAt: "2026-11-10T12:00:00.000Z",
              pinned: false,
              title: "example.com prompt",
            },
          ],
        },
      ],
      nextCursor: null,
      pinnedCount: 0,
      timeZone: "UTC",
      total: 1,
    },
  })),
  loadSerpPlaygroundHistoryAction: vi.fn(async () => ({
    ok: true,
    page: {
      chips: [],
      groups: [
        {
          day: "2026-11-10",
          label: "today",
          rows: [
            {
              cost: { kind: "cached" },
              key: "run-1",
              meta: { aiOverview: true, device: "desktop", kind: "serp", market: "United States" },
              occurredAt: "2026-11-10T12:00:00.000Z",
              pinned: false,
              title: "example.com rank",
            },
          ],
        },
      ],
      nextCursor: null,
      pinnedCount: 0,
      timeZone: "UTC",
      total: 1,
    },
  })),
  readStoredKeywordResearchAction: mocks.readStored,
}));
vi.mock("@/lib/actions/research-history-pins", () => ({
  pinResearchHistoryAction: vi.fn(),
  unpinResearchHistoryAction: vi.fn(),
}));
vi.mock("@/lib/actions/serp-playground", () => ({
  launchSerpPlaygroundAction: mocks.launch,
  readSerpPlaygroundAction: mocks.readSerp,
}));

vi.mock("@/lib/actions/serp-overview-fetch", () => ({
  readSavedSerpOverviewAction: mocks.savedOverview,
  previewSerpOverviewFetchAction: mocks.previewOverview,
}));

const messages = {
  ...sharedMessages,
  ...historyMessages,
  ...aiMessages,
  ...researchMessages,
  ...rankMessages,
};

function openHistoryRow(title: RegExp) {
  const button = screen
    .getAllByRole("button")
    .find((item) => item.hasAttribute("data-history-row") && title.test(item.textContent ?? ""));
  if (!button) throw new Error(`Missing history row ${title}`);
  fireEvent.click(button);
}

function renderWithMessages(node: ReactNode) {
  return render(
    <FeatureMessagesProvider locale="en" messages={messages} timeZone="UTC">
      {node}
    </FeatureMessagesProvider>,
  );
}

describe("history drawer wiring", () => {
  it("opens a saved Model Playground report without running the prompt again", async () => {
    renderWithMessages(<ModelPlaygroundHistoryButton projectId="prj_abcdefghijklmnopqrstuvwx" />);
    fireEvent.click(await screen.findByRole("button", { name: /History/ }));
    await screen.findByText("example.com prompt");
    openHistoryRow(/example.com prompt/);
    expect(routerMock.push).toHaveBeenCalledWith(
      "/app/prj_abcdefghijklmnopqrstuvwx/agent-reports/agr_savedreport000000000000",
    );
  });

  it("reopens a stored SERP check without launching a paid search", async () => {
    const run = { id: "run-1" };
    mocks.readSerp.mockResolvedValue({ ok: true, run });
    const selectRun = vi.fn();
    renderWithMessages(
      <SerpPlaygroundHistoryButton
        projectRef="prj_abcdefghijklmnopqrstuvwx"
        selectRun={selectRun}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: /History/ }));
    await screen.findByText("example.com rank");
    openHistoryRow(/example.com rank/);
    expect(mocks.readSerp).toHaveBeenCalledWith({
      projectRef: "prj_abcdefghijklmnopqrstuvwx",
      runId: "run-1",
    });
    await screen.findByRole("button", { name: /History/ });
    expect(selectRun).toHaveBeenCalledWith(run);
    expect(mocks.launch).not.toHaveBeenCalled();
  });

  it("reopens a stored keyword snapshot without the research action", async () => {
    const stored = { requestKey: "stored-key", seed: "example.com keyword" };
    mocks.readStored.mockResolvedValue({ ok: true, stored });
    const onStored = vi.fn();
    renderWithMessages(
      <KeywordResearchHistoryButton onStored={onStored} projectId="prj_abcdefghijklmnopqrstuvwx" />,
    );
    fireEvent.click(await screen.findByRole("button", { name: /History/ }));
    await screen.findByText("example.com keyword");
    openHistoryRow(/example.com keyword/);
    expect(mocks.readStored).toHaveBeenCalledWith({
      projectRef: "prj_abcdefghijklmnopqrstuvwx",
      requestKey: "stored-key",
    });
    await screen.findByRole("button", { name: /History/ });
    expect(onStored).toHaveBeenCalledWith(stored);
    expect(mocks.research).not.toHaveBeenCalled();
  });
});

it("marks a search once and reopens its stored overview from the History drawer", async () => {
  const run = {
    id: "run-1",
    sides: [{ provider: "serpapi", status: "completed", quantity: 1, result: null }],
  };
  mocks.readSerp.mockResolvedValue({ ok: true, run });
  mocks.savedOverview.mockResolvedValue({
    run: {
      id: "overview-1",
      createdAt: "2026-11-10T12:01:00Z",
      sides: [
        {
          provider: "serpapi",
          status: "completed",
          quantity: 1,
          result: {
            features: {
              aiOverview: {
                present: true,
                paragraphs: ["Stored overview for example.com."],
                sources: [],
              },
            },
          },
        },
      ],
    },
  });
  function ReopenedSearch() {
    const [selected, setSelected] = useState(false);
    return (
      <>
        <SerpPlaygroundHistoryButton
          projectRef="prj_abcdefghijklmnopqrstuvwx"
          selectRun={() => setSelected(true)}
        />
        {selected ? (
          <FetchAiOverview
            projectRef="prj_abcdefghijklmnopqrstuvwx"
            target={{ kind: "comparison", runId: "run-1", provider: "serpapi" }}
          />
        ) : null}
      </>
    );
  }
  renderWithMessages(<ReopenedSearch />);
  fireEvent.click(await screen.findByRole("button", { name: /History/ }));
  const drawer = screen.getByRole("dialog");
  await within(drawer).findByText("example.com rank");
  const rows = within(drawer)
    .getAllByRole("button")
    .filter((button) => button.hasAttribute("data-history-row"));
  expect(rows).toHaveLength(1);
  expect(within(rows[0]).getByText("AI Overview")).toBeVisible();
  openHistoryRow(/example.com rank/);
  await screen.findByText("Stored overview for example.com.");
  expect(mocks.savedOverview).toHaveBeenCalledWith({
    projectRef: "prj_abcdefghijklmnopqrstuvwx",
    target: { kind: "comparison", runId: "run-1", provider: "serpapi" },
  });
  expect(mocks.previewOverview).not.toHaveBeenCalled();
  expect(mocks.launch).not.toHaveBeenCalled();
});
