import { ProjectWriteModeProvider } from "@/components/shell/ProjectWriteModeProvider";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddKeywordDrawer } from "./AddKeywordDrawer";
import AddKeywordSuggestionsPanel from "./AddKeywordSuggestionsPanel";
import { useKeywordSuggestionSources } from "./useKeywordSuggestionSources";

function SuggestionsHarness({ onAppendQueries }: { onAppendQueries: (queries: string[]) => void }) {
  const sources = useKeywordSuggestionSources(projectId);
  return (
    <>
      <button onClick={() => void sources.load()} type="button">
        Suggestions
      </button>
      <AddKeywordSuggestionsPanel
        currentKeywords=""
        onAppendQueries={onAppendQueries}
        projectId={projectId}
        sourceState={sources}
      />
    </>
  );
}

const mocks = vi.hoisted(() => ({ sources: vi.fn(), gsc: vi.fn(), ranked: vi.fn(), add: vi.fn() }));
vi.mock("@/lib/actions/keyword-suggestion-sources", () => ({
  listKeywordSuggestionSources: mocks.sources,
}));
vi.mock("@/lib/actions/keyword-suggest", () => ({ importTopQueries: mocks.gsc }));
vi.mock("@/lib/actions/ranked-keywords", () => ({ fetchRankedKeywordSuggestions: mocks.ranked }));
vi.mock("@/lib/actions/keyword", () => ({ addKeywordsMatrix: mocks.add }));
vi.mock("@/lib/actions/project-market-create", () => ({ createProjectMarket: vi.fn() }));
vi.mock("@/lib/actions/project-markets", () => ({ addProjectMarkets: vi.fn() }));

const projectId = `prj_${"b".repeat(24)}`;
const connection = { id: `conn_${"a".repeat(24)}`, label: "DataForSEO", provider: "dataforseo" };
const sources = { domain: "example.com", searchConsole: true, rankedConnections: [connection] };
const projectMarkets = {
  markets: [
    {
      canonicalKey: "US",
      countryCode: "US",
      displayName: "United States",
      id: "pmkt_us",
      languageCode: "en",
      languageLabel: "English",
      monthlyCostCents: 0,
      researchAvailable: true,
      status: "active" as const,
    },
  ],
  maxMarkets: 5,
  monthlyCostCents: 0,
  perMarketChecks: 1,
  projectId,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.sources.mockResolvedValue(sources);
  mocks.gsc.mockResolvedValue({ queries: ["existing draft", "new suggestion"] });
  mocks.ranked.mockResolvedValue({
    cached: false,
    connections: [connection],
    costCents: 2,
    fetchedAt: "2026-09-08T00:00:00.000Z",
    offset: 0,
    totalCount: 1,
    rows: [
      {
        keyword: "tracked in another market",
        alreadyTracked: true,
        estimatedTraffic: 12,
        searchVolume: 200,
        position: 2,
      },
    ],
  });
  mocks.add.mockResolvedValue({ created: 2, keywords: [] });
});

function renderDrawer() {
  return render(
    <AddKeywordDrawer
      addKeywordsAction={vi.fn()}
      onClose={vi.fn()}
      open
      projectId={projectId}
      projectMarkets={projectMarkets}
      initialKeyword="existing draft"
      initialDevices={["mobile"]}
      initialScheduleFrequency="manual"
    />,
  );
}

describe("Add keyword suggestions", () => {
  it("loads sources only on demand, then reviews suggestions in Manual without changing tracking settings", async () => {
    renderDrawer();
    fireEvent.change(screen.getByLabelText("Target URL"), { target: { value: "/target" } });
    fireEvent.change(screen.getByLabelText("Tags"), { target: { value: "docs" } });
    expect(mocks.sources).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("radio", { name: "Suggestions" }));
    const choose = await screen.findByRole("button", { name: "Choose queries" });
    expect(mocks.sources).toHaveBeenCalledWith({ projectId });
    expect(mocks.gsc).not.toHaveBeenCalled();
    expect(mocks.ranked).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Add keywords" })).not.toBeInTheDocument();
    const form = document.querySelector("#add-keyword-form");
    if (!form) throw new Error("Missing keyword form");
    fireEvent.submit(form);
    await waitFor(() => expect(mocks.add).not.toHaveBeenCalled());
    fireEvent.click(choose);
    const useKeywords = await screen.findByRole("button", { name: "Use 1 keyword" });
    expect(screen.getByRole("checkbox", { name: "existing draft" })).toBeDisabled();
    expect(screen.getByText("In draft")).toBeVisible();
    fireEvent.click(useKeywords);
    await waitFor(() => expect(screen.getByRole("radio", { name: "Manual" })).toBeChecked());
    expect(screen.getByLabelText("Keywords")).toHaveValue("existing draft\nnew suggestion");
    expect(screen.getByLabelText("Target URL")).toHaveValue("/target");
    expect(screen.getByLabelText("Tags")).toHaveValue("docs");
    expect(mocks.add).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Add keywords" }));
    await waitFor(() =>
      expect(mocks.add).toHaveBeenCalledWith(
        expect.objectContaining({
          keywords: ["existing draft", "new suggestion"],
          locations: [{ locationKey: "US" }],
          devices: ["mobile"],
          targetUrl: "/target",
          tags: ["docs"],
          schedule: expect.objectContaining({ frequency: "manual" }),
        }),
      ),
    );
  });

  it("requests DataForSEO only after its priced action and allows a phrase tracked in another market", async () => {
    const append = vi.fn();
    render(<SuggestionsHarness onAppendQueries={append} />);
    fireEvent.click(screen.getByRole("button", { name: "Suggestions" }));
    const choose = await screen.findByRole("button", {
      name: "Choose keywords (about $0.02/page)",
    });
    expect(mocks.ranked).not.toHaveBeenCalled();
    fireEvent.click(choose);
    fireEvent.click(await screen.findByRole("button", { name: "Use 1 keyword" }));
    expect(mocks.ranked).toHaveBeenCalledExactlyOnceWith({
      connectionId: connection.id,
      offset: 0,
      projectId,
    });
    expect(append).toHaveBeenCalledWith(["tracked in another market"]);
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("offers integration settings when neither source is connected", async () => {
    mocks.sources.mockResolvedValue({ ...sources, searchConsole: false, rankedConnections: [] });
    render(<SuggestionsHarness onAppendQueries={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Suggestions" }));
    expect(await screen.findByRole("link", { name: "Manage integrations" })).toHaveAttribute(
      "href",
      `/app/${projectId}/integrations`,
    );
    expect(screen.queryByRole("button", { name: /Choose/ })).not.toBeInTheDocument();
    expect(mocks.gsc).not.toHaveBeenCalled();
    expect(mocks.ranked).not.toHaveBeenCalled();
  });

  it("can retry loading sources after a failure", async () => {
    mocks.sources.mockRejectedValueOnce(new Error("offline"));
    render(<SuggestionsHarness onAppendQueries={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Suggestions" }));
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Choose queries" })).toBeEnabled();
    expect(mocks.sources).toHaveBeenCalledTimes(2);
  });

  it("keeps provider requests disabled for a read-only project", async () => {
    render(
      <ProjectWriteModeProvider projectRef={projectId} writeMode="migration_hold">
        <SuggestionsHarness onAppendQueries={vi.fn()} />
      </ProjectWriteModeProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Suggestions" }));
    expect(await screen.findByRole("button", { name: "Choose queries" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Choose keywords (about $0.02/page)" }),
    ).toBeDisabled();
  });
});
