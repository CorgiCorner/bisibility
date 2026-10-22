import { AI_RESEARCH_CATALOG_CLIENT_WINDOW_MS } from "@/lib/ai-research/catalog-freshness";
import type { AiCatalogOutcome, AiResearchCatalog } from "@/lib/ai-research/catalog-types";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  catalog: vi.fn(),
  legacyVisibilityPreset: [
    "Existing dataset preset: ChatGPT, United States, English.",
    "Other countries, languages and platforms require the live catalog.",
  ].join(" "),
  marketUnavailable: [
    "Market list unavailable.",
    "ChatGPT for the United States in English is still available.",
  ].join(" "),
}));
const fetchedAtMs = Date.parse("2026-10-22T16:31:53.000Z");

vi.mock("next-intl", () => ({
  useFormatter: () => ({ dateTime: (value: unknown) => String(value) }),
  useLocale: () => "en",
  useTranslations: (namespace: string) => (key: string) => {
    if (namespace !== "projectAiResearch") return key;
    if (key === "catalogUnavailableVisibility") return mocks.marketUnavailable;
    if (key === "catalogRefreshing") return "Refreshing provider catalog";
    if (key === "legacyVisibilityPreset") return mocks.legacyVisibilityPreset;
    return key;
  },
}));
vi.mock("@/lib/actions/ai-research", () => ({
  analyzeAiResearchAction: vi.fn(),
  getAiResearchCatalogAction: mocks.catalog,
}));

import { AiResearchWorkspace } from "./AiResearchWorkspace";
import { aiResearchCatalogFixture } from "./ai-research-fixtures";

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function openedCatalog(): AiResearchCatalog {
  return { ...aiResearchCatalogFixture, fetchedAt: new Date(fetchedAtMs).toISOString() };
}

/** The field hint. The catalog notice describes the same preset in a hidden span. */
function legacyPresetInFields() {
  return screen.queryByText(mocks.legacyVisibilityPreset, { exact: true, selector: "p" });
}

function chooseGooglePoland() {
  fireEvent.click(screen.getByRole("button", { name: "platform" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Google AI Overview" }));
  fireEvent.click(screen.getByRole("button", { name: "country" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Poland" }));
}

beforeEach(() => {
  mocks.catalog.mockReset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(fetchedAtMs + 190_000);
});

describe("AI research catalog freshness on an open page", () => {
  it("refreshes once after the old cutoff and keeps the selected market", async () => {
    const pending = deferred<AiCatalogOutcome>();
    mocks.catalog.mockReturnValue(pending.promise);
    const opened = openedCatalog();
    render(
      <AiResearchWorkspace
        projectId="prj_example"
        domain="example.com"
        mode="visibility"
        history={[]}
        catalog={opened}
      />,
    );
    chooseGooglePoland();
    expect(mocks.catalog).not.toHaveBeenCalled();
    expect(screen.queryByText(mocks.marketUnavailable)).not.toBeInTheDocument();

    vi.setSystemTime(fetchedAtMs + 310_000);
    fireEvent.change(screen.getByLabelText("brand"), { target: { value: "A" } });
    fireEvent.change(screen.getByLabelText("brand"), { target: { value: "Acme" } });

    expect(mocks.catalog).toHaveBeenCalledTimes(1);
    expect(mocks.catalog).toHaveBeenCalledWith("prj_example");
    expect(screen.queryByText(mocks.marketUnavailable)).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByLabelText("brand")).toHaveValue("Acme");
    expect(screen.getByRole("button", { name: "platform" })).toHaveTextContent(
      "Google AI Overview",
    );
    expect(screen.getByRole("button", { name: "country" })).toHaveTextContent("Poland");
    expect(screen.getByRole("button", { name: "language" })).toHaveTextContent("Polish");
    expect(legacyPresetInFields()).not.toBeInTheDocument();

    const refreshed: AiResearchCatalog = {
      ...opened,
      fetchedAt: new Date(fetchedAtMs + 310_000).toISOString(),
      visibilityMarkets: opened.visibilityMarkets.map((market) =>
        market.locationCode === 2616 ? { ...market, countryName: "Republic of Poland" } : market,
      ),
    };
    await act(async () => {
      pending.resolve({ ok: true, catalog: refreshed });
      await pending.promise;
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "country" })).toHaveTextContent(
        "Republic of Poland",
      );
    });
    expect(mocks.catalog).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("brand")).toHaveValue("Acme");
    expect(screen.getByRole("button", { name: "language" })).toHaveTextContent("Polish");
  });

  it("shows the unavailable message after a failed refresh past the client window", async () => {
    const pending = deferred<AiCatalogOutcome>();
    mocks.catalog.mockReturnValue(pending.promise);
    render(
      <AiResearchWorkspace
        projectId="prj_example"
        domain="example.com"
        mode="visibility"
        history={[]}
        catalog={openedCatalog()}
      />,
    );
    chooseGooglePoland();
    vi.setSystemTime(fetchedAtMs + AI_RESEARCH_CATALOG_CLIENT_WINDOW_MS + 1_000);
    fireEvent.change(screen.getByLabelText("brand"), { target: { value: "Kept" } });

    expect(screen.getByRole("status")).toHaveTextContent("Refreshing provider catalog");
    expect(screen.queryByText(mocks.marketUnavailable)).not.toBeInTheDocument();
    expect(screen.getByLabelText("brand")).toHaveValue("Kept");
    expect(screen.getByRole("button", { name: "country" })).toHaveTextContent("Poland");
    expect(screen.getByRole("button", { name: "language" })).toHaveTextContent("Polish");
    expect(legacyPresetInFields()).not.toBeInTheDocument();

    await act(async () => {
      pending.resolve({ ok: false, message: "unavailable", reason: "provider_unavailable" });
      await pending.promise;
    });

    expect(screen.getByRole("alert")).toHaveTextContent(mocks.marketUnavailable);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    const help = screen.getByRole("button", { name: "catalogHelp" });
    expect(document.getElementById(help.getAttribute("aria-describedby") ?? "")).toHaveTextContent(
      mocks.legacyVisibilityPreset,
    );
    expect(screen.getByLabelText("brand")).toHaveValue("Kept");
    expect(screen.getByRole("button", { name: "platform" })).toHaveTextContent(
      "Google AI Overview",
    );
    expect(screen.getByRole("button", { name: "country" })).toHaveTextContent("Poland");
    expect(screen.getByRole("button", { name: "language" })).toHaveTextContent("Polish");
    expect(legacyPresetInFields()).not.toBeInTheDocument();
    expect(mocks.catalog).toHaveBeenCalledTimes(1);
  });
});
