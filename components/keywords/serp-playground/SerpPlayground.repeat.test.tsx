import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { PlaygroundPageData } from "@/lib/provider-comparison/playground-model";
import type { ComparisonPreview, ComparisonRun } from "@/lib/provider-comparison/types";
import { fireEvent, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
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
  providers: [{ provider: "dataforseo", ready: true }],
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
const keyword = { id: "", text: "Coffee", device: "desktop" as const, locationLabel: "US" };
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
const previous: ComparisonRun = {
  id: "previous",
  createdAt: "2026-11-09T10:00:07Z",
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
        recordedAt: "2026-11-09T10:00:07Z",
        position: null,
        rankingUrl: null,
        configuredScope: {},
        effectiveScope: {},
        completeness: "complete",
        normalizationVersion: "1",
        evidence: "unknown",
        completeThrough: 20,
        results: [
          { rank: 1, url: "https://example.com/saved", title: "Saved result", domain: null },
        ],
      },
    },
  ],
};

function search() {
  fireEvent.change(screen.getByLabelText("Search query"), { target: { value: "Coffee" } });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
}

it("asks before repeating a search and opens the saved result for free", async () => {
  const api = {
    preview: vi.fn().mockResolvedValue({ ok: true, preview, previous }),
    launch: vi.fn(),
    read: vi.fn(),
  };
  render(<SerpPlayground projectRef="prj_test" data={data} service={api} />);
  search();
  const dialog = await screen.findByRole("dialog", { name: "You already searched this" });
  expect(within(dialog).getByText(/Last searched .*:00:07/)).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "Run new search" })).toBeEnabled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Open saved result" }));
  expect(await screen.findByRole("link", { name: "Saved result" })).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("Saved result shown.");
  expect(screen.getByText(/Searched .*:00:07/)).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(api.launch).not.toHaveBeenCalled();
});

it("still shows the saved result with a notice when a new search cannot be quoted", async () => {
  const api = {
    preview: vi.fn().mockResolvedValue({ ok: true, cached: previous }),
    launch: vi.fn(),
    read: vi.fn(),
  };
  render(<SerpPlayground projectRef="prj_test" data={data} service={api} />);
  search();
  expect(await screen.findByRole("link", { name: "Saved result" })).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("Saved result shown.");
  expect(api.launch).not.toHaveBeenCalled();
});
