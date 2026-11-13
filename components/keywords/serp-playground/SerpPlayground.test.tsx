import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { PlaygroundPageData } from "@/lib/provider-comparison/playground-model";
import type { ComparisonPreview, ComparisonRun } from "@/lib/provider-comparison/types";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SerpPlayground } from "./SerpPlayground";

vi.mock("@/lib/actions/research-history", () => ({
  loadSerpPlaygroundHistoryAction: vi.fn(async () => ({
    ok: true,
    page: { chips: [], groups: [], nextCursor: null, pinnedCount: 0, timeZone: "UTC", total: 0 },
  })),
}));
vi.mock("@/lib/actions/research-history-pins", () => ({
  pinResearchHistoryAction: vi.fn(),
  unpinResearchHistoryAction: vi.fn(),
}));
vi.mock("@/lib/actions/serp-playground", () => ({
  previewSerpPlaygroundAction: vi.fn(),
  launchSerpPlaygroundAction: vi.fn(),
  readSerpPlaygroundAction: vi.fn(),
  getSerpPlaygroundRawAction: vi.fn(async () => ({ ok: true, response: null })),
}));
vi.mock("@/components/keywords/LocationField", () => ({
  LocationField: () => <div>Location selection</div>,
}));
Element.prototype.scrollIntoView = vi.fn();
const data: PlaygroundPageData = {
  canRun: true,
  providers: [
    { provider: "dataforseo", ready: true },
    { provider: "serpapi", ready: true },
  ],
  location: {
    kind: "country",
    canonicalKey: "US",
    countryCode: "US",
    displayName: "United States",
    languageCode: "en",
    languageLabel: "English",
  },
  history: [],
};
const keyword = {
  id: "",
  text: "Coffee",
  device: "desktop" as const,
  locationLabel: "United States",
};
const preview: ComparisonPreview = {
  id: "preview",
  hash: "hash",
  expiresAt: "2026-11-09T10:05:00Z",
  depth: 20,
  keyword,
  sides: [
    {
      provider: "dataforseo",
      estimatedCostCents: 2,
      nativeUnit: "cents",
      nativeQuantity: 2,
      fundingSource: "own",
    },
  ],
};
const run: ComparisonRun = {
  id: "run",
  createdAt: "2026-11-09T10:00:00Z",
  keyword,
  depth: 20,
  sides: [
    {
      provider: "dataforseo",
      status: "completed",
      costCents: 2,
      quantity: 1,
      reason: null,
      result: {
        observedAt: null,
        recordedAt: "2026-11-09T10:00:00Z",
        position: null,
        rankingUrl: null,
        configuredScope: {},
        effectiveScope: {},
        completeness: "complete",
        normalizationVersion: "1",
        evidence: "unknown",
        completeThrough: 20,
        results: [
          {
            rank: 1,
            url: "https://example.com/coffee",
            title: "Coffee result",
            domain: "example.com",
          },
        ],
      },
    },
  ],
};
function service() {
  return {
    preview: vi.fn().mockResolvedValue({ ok: true, preview }),
    launch: vi.fn().mockResolvedValue({ ok: true, run }),
    read: vi.fn().mockResolvedValue({ ok: true, run }),
  };
}

describe("SERP Playground", () => {
  it("shows a connection empty state without an enabled search", () => {
    render(
      <SerpPlayground
        projectRef="prj_test"
        data={{ ...data, providers: data.providers.map((item) => ({ ...item, ready: false })) }}
        service={service()}
      />,
    );
    expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Connect providers" })).toHaveAttribute(
      "href",
      "/app/prj_test/providers",
    );
    expect(screen.getAllByText("Your results will appear here")).toHaveLength(2);
  });
  it("previews the shared query before launch and displays retained SERP results", async () => {
    const api = service();
    render(<SerpPlayground projectRef="prj_test" data={data} service={api} />);
    fireEvent.change(screen.getByLabelText("Search query"), { target: { value: "Coffee" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() =>
      expect(api.preview).toHaveBeenCalledWith({
        projectRef: "prj_test",
        depth: 20,
        query: "Coffee",
        device: "desktop",
        locationKey: "US@en",
        providers: ["dataforseo", "serpapi"],
      }),
    );
    expect(api.launch).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Run search" }));
    expect(await screen.findByRole("link", { name: "Coffee result" })).toHaveAttribute(
      "href",
      "https://example.com/coffee",
    );
    expect(api.launch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("radio", { name: "Stored JSON" }));
    expect(screen.getByText(/"https:\/\/example.com\/coffee"/)).toBeInTheDocument();
  });
  it("keeps the form usable after preview errors and blocks read-only launch", async () => {
    const api = service();
    api.preview.mockResolvedValue({ ok: false, reason: "unavailable" });
    const { unmount } = render(<SerpPlayground projectRef="prj_test" data={data} service={api} />);
    fireEvent.change(screen.getByLabelText("Search query"), { target: { value: "Coffee" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search" })).toBeEnabled();
    expect(api.launch).not.toHaveBeenCalled();
    unmount();
    render(
      <SerpPlayground projectRef="prj_test" data={{ ...data, canRun: false }} service={api} />,
    );
    expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
  });
});

it("keeps a completed provider visible while the other provider is still loading", async () => {
  const { SerpPlaygroundResults } = await import("./SerpPlaygroundResults");
  render(
    <SerpPlaygroundResults
      providers={["dataforseo", "serpapi"]}
      run={{
        ...run,
        sides: [
          ...run.sides,
          {
            provider: "serpapi",
            status: "claimed",
            costCents: null,
            quantity: null,
            reason: null,
            result: null,
          },
        ],
      }}
      view="serp"
      loading
    />,
  );
  expect(screen.getByRole("link", { name: "Coffee result" })).toBeInTheDocument();
  expect(screen.getAllByRole("status", { name: "Loading search results" })).toHaveLength(1);
});

it("does not offer a keyword save when the selected provider response is missing", async () => {
  const { SerpPlaygroundResults } = await import("./SerpPlaygroundResults");
  render(
    <SerpPlaygroundResults
      providers={["dataforseo"]}
      projectRef="prj_test"
      run={{ ...run, sides: run.sides.map((side) => ({ ...side, canSave: true })) }}
      view="provider"
      loading={false}
    />,
  );
  expect(await screen.findByText("Provider response not saved")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Save to keyword" })).not.toBeInTheDocument();
});

it("loads the native response only in the provider view and offers its JSON for copying", async () => {
  const { getSerpPlaygroundRawAction } = await import("@/lib/actions/serp-playground");
  const { SerpPlaygroundResults } = await import("./SerpPlaygroundResults");
  vi.mocked(getSerpPlaygroundRawAction).mockResolvedValueOnce({
    ok: true,
    response: { native_metadata: { request_id: "original-request" }, organic_results: [] },
  });
  const { container } = render(
    <SerpPlaygroundResults
      providers={["dataforseo"]}
      projectRef="prj_test"
      run={run}
      view="provider"
      loading={false}
    />,
  );
  expect(await screen.findByRole("button", { name: "Copy JSON" })).toBeVisible();
  expect(container.querySelector("pre")).toHaveTextContent("original-request");
  expect(getSerpPlaygroundRawAction).toHaveBeenLastCalledWith({
    projectRef: "prj_test",
    runId: run.id,
    provider: "dataforseo",
  });
});

it("shows the measured sub-cent cost instead of rounding it to zero", async () => {
  const { SerpPlaygroundResults } = await import("./SerpPlaygroundResults");
  const exactRun = { ...run, sides: run.sides.map((side) => ({ ...side, costCents: 0.35 })) };
  render(
    <SerpPlaygroundResults
      providers={["dataforseo"]}
      projectRef="prj_test"
      run={exactRun}
      view="serp"
      loading={false}
    />,
  );
  expect(await screen.findByText("$0.0035")).toBeVisible();
  expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
});

it("adding a second provider only selects it, without charging or searching", async () => {
  const service = { preview: vi.fn(), launch: vi.fn(), read: vi.fn() };
  render(
    <SerpPlayground
      projectRef="prj_demo"
      data={{
        ...data,
        providers: [
          { provider: "dataforseo", ready: true },
          { provider: "serpapi", ready: true, selectedByDefault: false },
        ],
      }}
      service={service}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Add SerpApi" }));
  expect(screen.getByRole("checkbox", { name: "SerpApi" })).toBeChecked();
  expect(service.preview).not.toHaveBeenCalled();
  expect(service.launch).not.toHaveBeenCalled();
});
