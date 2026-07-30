import {
  SessionSpendProvider,
  useSessionSpend,
} from "@/components/cost-estimate/SessionSpendProvider";
import { ToastProvider } from "@/components/ui";
import type { ResearchKeywordsAction } from "@/lib/actions/keyword-research";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResearchWorkspace } from "./ResearchWorkspace";

function SessionSpendProbe() {
  const { sessionCents } = useSessionSpend();
  return <output aria-label="session spend cents">{sessionCents}</output>;
}

vi.mock("./ResearchSearchCard", () => ({
  ResearchSearchCard: (props: {
    connectionId: string;
    disabled?: boolean;
    estimate: { costCents: number | null };
    onConnectionChange: (value: string) => void;
    onIncludeClickstreamChange: (value: boolean) => void;
    onLimitChange: (value: 100 | 300 | 500) => void;
    onModeChange: (value: "ideas") => void;
    onSeedsChange: (value: string[]) => void;
    onSubmit: (value: string[]) => void;
    location: { canonicalKey: string };
    seeds: string[];
  }) => (
    <div>
      <output aria-label="active connection">{props.connectionId}</output>
      <output aria-label="estimate cost">{props.estimate.costCents ?? "unknown"}</output>
      <output aria-label="research disabled">{String(props.disabled)}</output>
      <output aria-label="search seeds">{props.seeds.join(" ")}</output>
      <output aria-label="search location">{props.location.canonicalKey}</output>
      <button onClick={() => props.onSeedsChange(["rank tracker"])} type="button">
        Prepare seed
      </button>
      <button onClick={() => props.onSeedsChange(["bar"])} type="button">
        Prepare bar
      </button>
      <button onClick={() => props.onLimitChange(300)} type="button">
        Limit 300
      </button>
      <button onClick={() => props.onLimitChange(500)} type="button">
        Limit 500
      </button>
      <button onClick={() => props.onModeChange("ideas")} type="button">
        Ideas mode
      </button>
      <button onClick={() => props.onIncludeClickstreamChange(true)} type="button">
        Clickstream on
      </button>
      <button
        onClick={() => props.onConnectionChange("conn_b00000000000000000000000")}
        type="button"
      >
        Connection 2
      </button>
      <button
        onClick={() => {
          props.onSubmit(props.seeds.length > 0 ? props.seeds : ["rank tracker"]);
          props.onSeedsChange([]);
        }}
        type="button"
      >
        Run research
      </button>
    </div>
  ),
}));

vi.mock("./ResearchResults", () => ({
  ResearchResults: ({
    onAdd,
    onRemoveSaved,
    onSave,
    result,
  }: {
    onAdd: (draft: unknown) => void;
    onRemoveSaved?: (draft: unknown) => void;
    onSave: (draft: unknown) => void;
    result: {
      rows: Array<{ alreadySaved: boolean; alreadyTracked: boolean; keyword: string }>;
    };
  }) => (
    <div>
      <output aria-label="tracked keywords">
        {result.rows
          .filter((row) => row.alreadyTracked)
          .map((row) => row.keyword)
          .join(",")}
      </output>
      <output aria-label="saved keywords">
        {result.rows
          .filter((row) => row.alreadySaved)
          .map((row) => row.keyword)
          .join(",")}
      </output>
      <button
        onClick={() =>
          onAdd({
            device: "desktop",
            keywords: ["seo tool", "rank tracker api"],
            location: context.location,
            scheduleFrequency: "project_default",
          })
        }
        type="button"
      >
        Select two
      </button>
      <button
        onClick={() =>
          onSave({
            location: "US",
            rows: result.rows.map((row) => ({ ...row, variants: [row] })),
            sourceSeed: "rank tracker",
          })
        }
        type="button"
      >
        Save {result.rows.length}
      </button>
      {onRemoveSaved ? (
        <button
          onClick={() =>
            onRemoveSaved({
              location: "US",
              rows: [{ ...result.rows[0], alreadySaved: true, variants: [result.rows[0]] }],
              sourceSeed: "rank tracker",
            })
          }
          type="button"
        >
          Remove first saved
        </button>
      ) : null}
    </div>
  ),
}));

vi.mock("@/components/keywords/add/AddKeywordDrawer", () => ({
  AddKeywordDrawer: ({
    initialKeyword,
    onAdded,
    open,
    showSchedule,
  }: {
    initialKeyword: string;
    onAdded: (keywords: Array<{ publicId: string; text: string }>) => void;
    open: boolean;
    showSchedule: boolean;
  }) =>
    open ? (
      <div>
        <output aria-label="tracking drawer">
          {initialKeyword}|schedule:{String(showSchedule)}
        </output>
        <button
          onClick={() => onAdded([{ publicId: "kw_new", text: "new typed keyword" }])}
          type="button"
        >
          Complete add
        </button>
      </div>
    ) : null,
}));

const context = {
  connections: [
    { id: "conn_a00000000000000000000000", label: "DataForSEO", provider: "dataforseo" },
  ],
  defaultMarket: {
    city: null,
    country: "United States",
    device: "desktop" as const,
    displayName: "United States",
    locationKey: "US",
    source: "explicit" as const,
  },
  language: { code: "en", label: "English" },
  location: {
    canonicalKey: "US",
    cityName: null,
    countryCode: "US",
    displayName: "United States",
    hl: "en",
    kind: "country" as const,
    languageLabel: "English",
    regionName: null,
  },
  project: { domain: "example.com", id: "prj_1", name: "Example" },
};

const checkHealth = {
  budget: { capCents: 5_000, exhausted: false, spentCents: 200 },
  failed24h: { count: 0, latest: null },
  providerConnected: true,
  providerRate: { overrideCents: null, providerId: "dataforseo" },
  runningCount: 0,
};

const costContext = {
  capCents: 5_000,
  costPerCheckCents: null,
  cronExpression: null,
  depth: 100 as const,
  deviceCount: 1,
  devices: ["desktop" as const],
  frequency: "daily" as const,
  keywordCount: 4,
  locationCount: 1,
  projectName: "Example",
  providerId: "dataforseo",
  rawFrequency: "daily" as const,
  spentCents: 200,
  timezone: "America/New_York",
};

const savedKeywordActions = {
  canDeleteSavedKeywords: true,
  removeSavedKeywordsAction: vi.fn(async () => ({ removedCount: 0 })),
  saveKeywordsAction: vi.fn(async () => ({
    created: [] as Array<{ keyword: string; publicId: string }>,
    duplicateCount: 0,
    savedCount: 0,
  })),
};

function success(input: { cached: boolean; costCents: number; estimate?: boolean }) {
  return {
    ...input,
    cachedUntil: "2026-07-22T22:00:00.000Z",
    connections: context.connections,
    fetchedAt: "2026-07-22T10:00:00.000Z",
    ok: true as const,
    provider: "DataForSEO",
    rows: input.estimate
      ? []
      : [
          ...["seo tool", "rank tracker api", "new typed keyword"].map((keyword) => ({
            alreadySaved: false,
            alreadyTracked: false,
            competition: 0.4,
            cpcCents: 125,
            difficulty: 30,
            intent: "commercial" as const,
            keyword,
            monthlyTrend: [],
            searchVolume: 500,
            source: "idea" as const,
          })),
        ],
    sources: [
      {
        cached: input.cached,
        costCents: input.costCents,
        returned: input.estimate ? 0 : 3,
        source: "idea" as const,
        status: "ok" as const,
      },
    ],
  };
}

function persistRecent(overrides: Partial<Record<string, unknown>> = {}) {
  window.localStorage.setItem(
    "bisibility:keyword-research:recent:prj_1",
    JSON.stringify([
      {
        cachedUntil: new Date(Date.now() + 60_000).toISOString(),
        connectionId: "conn_a00000000000000000000000",
        createdAt: new Date().toISOString(),
        includeClickstream: false,
        market: "United States",
        mode: "auto",
        resultLimit: 100,
        seed: "saved seed",
        ...overrides,
      },
    ]),
  );
}

describe("ResearchWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("prefills a source seed and location from the Saved deep link", () => {
    render(
      <SessionSpendProvider>
        <ResearchWorkspace
          {...savedKeywordActions}
          addKeywordsAction={vi.fn() as never}
          checkHealth={checkHealth}
          context={context}
          costContext={costContext}
          prefill={{ locationKey: "PL", seed: "standing desk" }}
          researchAction={vi.fn() as unknown as ResearchKeywordsAction}
        />
      </SessionSpendProvider>,
    );

    expect(screen.getByLabelText("search seeds")).toHaveTextContent("standing desk");
    expect(screen.getByLabelText("search location")).toHaveTextContent("PL");
  });

  it("does not request before input, updates estimates, records paid session spend, and shares the add flow", async () => {
    let paidCalls = 0;
    const researchAction = vi.fn(async (input: { estimateOnly?: boolean }) => {
      if (input.estimateOnly) return success({ cached: false, costCents: 9, estimate: true });
      paidCalls += 1;
      return paidCalls === 1
        ? success({ cached: false, costCents: 4 })
        : success({ cached: true, costCents: 0 });
    });

    render(
      <SessionSpendProvider>
        <SessionSpendProbe />
        <ResearchWorkspace
          {...savedKeywordActions}
          addKeywordsAction={vi.fn() as never}
          checkHealth={checkHealth}
          context={context}
          costContext={costContext}
          researchAction={researchAction as unknown as ResearchKeywordsAction}
        />
      </SessionSpendProvider>,
    );

    expect(researchAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Prepare seed" }));
    fireEvent.click(screen.getByRole("button", { name: "Limit 300" }));
    fireEvent.click(screen.getByRole("button", { name: "Ideas mode" }));
    fireEvent.click(screen.getByRole("button", { name: "Clickstream on" }));

    await waitFor(() => expect(screen.getByLabelText("estimate cost")).toHaveTextContent("9"));
    expect(researchAction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        estimateOnly: true,
        includeClickstream: true,
        locationKey: "US",
        mode: "ideas",
        resultLimit: 300,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Run research" }));
    await screen.findByRole("button", { name: "Select two" });
    expect(screen.getByLabelText("session spend cents")).toHaveTextContent("4");

    fireEvent.click(screen.getByRole("button", { name: "Select two" }));
    expect(screen.getByLabelText("tracking drawer")).toHaveTextContent(
      "seo tool rank tracker api|schedule:true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Complete add" }));
    expect(screen.getByLabelText("tracked keywords")).toHaveTextContent("new typed keyword");
    expect(screen.getByLabelText("tracked keywords")).not.toHaveTextContent("seo tool");

    fireEvent.click(screen.getByRole("button", { name: "Run research" }));
    await waitFor(() => expect(paidCalls).toBe(2));
    expect(screen.getByLabelText("session spend cents")).toHaveTextContent("4");
  });

  it("disables fresh research after the service reports an exhausted budget", async () => {
    const researchAction = vi.fn(async () => ({
      ok: false as const,
      reason: "budget_exhausted" as const,
    }));
    render(
      <SessionSpendProvider>
        <ResearchWorkspace
          {...savedKeywordActions}
          addKeywordsAction={vi.fn() as never}
          checkHealth={checkHealth}
          context={context}
          costContext={costContext}
          researchAction={researchAction as unknown as ResearchKeywordsAction}
        />
      </SessionSpendProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run research" }));
    await screen.findByText("Monthly provider budget reached");
    expect(screen.getByLabelText("research disabled")).toHaveTextContent("true");
  });

  it("prefills an expired recent search and waits for the priced submit", async () => {
    persistRecent({
      cachedUntil: new Date(Date.now() - 60_000).toISOString(),
      connectionId: "deleted_connection",
    });
    const researchAction = vi.fn(async (input: { estimateOnly?: boolean }) =>
      success({
        cached: false,
        costCents: input.estimateOnly ? 7 : 4,
        estimate: input.estimateOnly,
      }),
    );
    render(
      <SessionSpendProvider>
        <ResearchWorkspace
          {...savedKeywordActions}
          addKeywordsAction={vi.fn() as never}
          checkHealth={checkHealth}
          context={context}
          costContext={costContext}
          researchAction={researchAction as unknown as ResearchKeywordsAction}
        />
      </SessionSpendProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /^saved seed/i }));
    expect(screen.getByLabelText("search seeds")).toHaveTextContent("saved seed");
    await waitFor(() => expect(screen.getByLabelText("estimate cost")).toHaveTextContent("7"));
    expect(researchAction.mock.calls.filter(([input]) => !input.estimateOnly)).toHaveLength(0);
    expect(researchAction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        connectionId: "conn_a00000000000000000000000",
        estimateOnly: true,
        seed: "saved seed",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Run research" }));
    await waitFor(() =>
      expect(researchAction.mock.calls.filter(([input]) => !input.estimateOnly)).toHaveLength(1),
    );
  });

  it("replays a valid cached search immediately with an eligible connection fallback", async () => {
    persistRecent({ connectionId: "deleted_connection" });
    const researchAction = vi.fn(async (input: { estimateOnly?: boolean }) =>
      success({ cached: !input.estimateOnly, costCents: 0, estimate: input.estimateOnly }),
    );
    render(
      <SessionSpendProvider>
        <ResearchWorkspace
          {...savedKeywordActions}
          addKeywordsAction={vi.fn() as never}
          checkHealth={checkHealth}
          context={context}
          costContext={costContext}
          researchAction={researchAction as unknown as ResearchKeywordsAction}
        />
      </SessionSpendProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /^saved seed/i }));
    await waitFor(() =>
      expect(researchAction.mock.calls.filter(([input]) => !input.estimateOnly)).toHaveLength(1),
    );
    expect(researchAction.mock.calls.find(([input]) => !input.estimateOnly)?.[0]).toEqual(
      expect.objectContaining({
        connectionId: "conn_a00000000000000000000000",
        fresh: false,
        seed: "saved seed",
      }),
    );
  });

  it("retries the failed tab with its own request and estimate", async () => {
    let runs = 0;
    const researchAction = vi.fn(
      async (input: { estimateOnly?: boolean; resultLimit?: number }) => {
        if (input.estimateOnly) {
          return success({
            cached: false,
            costCents: input.resultLimit === 500 ? 19 : 7,
            estimate: true,
          });
        }
        runs += 1;
        return runs === 1
          ? { ok: false as const, reason: "rate_limited" as const }
          : success({ cached: false, costCents: 4 });
      },
    );
    render(
      <SessionSpendProvider>
        <ResearchWorkspace
          {...savedKeywordActions}
          addKeywordsAction={vi.fn() as never}
          checkHealth={checkHealth}
          context={{
            ...context,
            connections: [
              ...context.connections,
              {
                id: "conn_b00000000000000000000000",
                label: "Backup",
                provider: "dataforseo",
              },
            ],
          }}
          costContext={costContext}
          researchAction={researchAction as unknown as ResearchKeywordsAction}
        />
      </SessionSpendProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run research" }));
    const retry = await screen.findByRole("button", { name: "Retry ~$0.07" });
    fireEvent.click(screen.getByRole("button", { name: "Prepare bar" }));
    fireEvent.click(screen.getByRole("button", { name: "Limit 500" }));
    fireEvent.click(screen.getByRole("button", { name: "Ideas mode" }));
    fireEvent.click(screen.getByRole("button", { name: "Clickstream on" }));
    fireEvent.click(screen.getByRole("button", { name: "Connection 2" }));
    await waitFor(() => expect(screen.getByLabelText("estimate cost")).toHaveTextContent("19"));
    expect(screen.getByRole("button", { name: "Retry ~$0.07" })).toBeInTheDocument();
    fireEvent.click(retry);

    await waitFor(() => expect(runs).toBe(2));
    const retried = researchAction.mock.calls.filter(([input]) => !input.estimateOnly)[1]?.[0];
    expect(retried).toEqual(
      expect.objectContaining({
        connectionId: "conn_a00000000000000000000000",
        includeClickstream: false,
        locationKey: "US",
        mode: "auto",
        resultLimit: 100,
        seed: "rank tracker",
      }),
    );
  });

  it("disables recent chips with a hint when no research provider exists", () => {
    persistRecent();
    const researchAction = vi.fn();
    render(
      <SessionSpendProvider>
        <ResearchWorkspace
          {...savedKeywordActions}
          addKeywordsAction={vi.fn() as never}
          checkHealth={checkHealth}
          context={{ ...context, connections: [] }}
          costContext={costContext}
          researchAction={researchAction as unknown as ResearchKeywordsAction}
        />
      </SessionSpendProvider>,
    );

    expect(screen.getByRole("button", { name: /^saved seed/i })).toBeDisabled();
    expect(screen.getByText("Connect DataForSEO to replay recent searches.")).toBeInTheDocument();
    expect(researchAction).not.toHaveBeenCalled();
  });

  it("saves eight rows in one action and undoes only the created ids", async () => {
    const rows = Array.from({ length: 8 }, (_, index) => ({
      alreadySaved: false,
      alreadyTracked: false,
      competition: 0.4,
      cpcCents: 125,
      difficulty: 30,
      intent: "commercial" as const,
      keyword: `keyword ${index + 1}`,
      monthlyTrend: [],
      searchVolume: 500,
      source: "idea" as const,
    }));
    const researchAction = vi.fn(async (input: { estimateOnly?: boolean }) => ({
      ...success({ cached: false, costCents: 4, estimate: input.estimateOnly }),
      rows: input.estimateOnly ? [] : rows,
    }));
    const created = rows.map((row, index) => ({
      keyword: row.keyword,
      publicId: `skw_${index + 1}`,
    }));
    const saveKeywordsAction = vi.fn(async () => ({
      created,
      duplicateCount: 0,
      savedCount: 8,
    }));
    const removeSavedKeywordsAction = vi.fn(async () => ({ removedCount: 8 }));

    render(
      <ToastProvider>
        <SessionSpendProvider>
          <ResearchWorkspace
            addKeywordsAction={vi.fn() as never}
            canDeleteSavedKeywords
            checkHealth={checkHealth}
            context={context}
            costContext={costContext}
            removeSavedKeywordsAction={removeSavedKeywordsAction}
            researchAction={researchAction as unknown as ResearchKeywordsAction}
            saveKeywordsAction={saveKeywordsAction}
          />
        </SessionSpendProvider>
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run research" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save 8" }));

    await waitFor(() => expect(saveKeywordsAction).toHaveBeenCalledOnce());
    expect(saveKeywordsAction).toHaveBeenCalledWith({
      projectId: "prj_1",
      rows: rows.map((row) => ({
        cpcCents: 125,
        difficulty: 30,
        intent: "commercial",
        keyword: row.keyword,
        location: "US",
        monthlyTrend: [],
        searchVolume: 500,
        sourceSeed: "rank tracker",
        variantCount: 0,
      })),
    });
    expect(screen.getByLabelText("saved keywords")).toHaveTextContent("keyword 1");
    expect(screen.getByRole("link", { name: "View in Keywords / Saved" })).toHaveAttribute(
      "href",
      "/app/prj_1/keywords?tab=saved",
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove first saved" }));
    await waitFor(() =>
      expect(removeSavedKeywordsAction).toHaveBeenCalledWith({
        projectId: "prj_1",
        rows: [{ keyword: "keyword 1", location: "US" }],
      }),
    );
    await waitFor(() => {
      expect(screen.getByLabelText("saved keywords")).not.toHaveTextContent("keyword 1");
      expect(screen.getByLabelText("saved keywords")).toHaveTextContent("keyword 2");
    });

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(removeSavedKeywordsAction).toHaveBeenCalledWith({
        projectId: "prj_1",
        publicIds: created.map((item) => item.publicId),
      }),
    );
    await waitFor(() => expect(screen.getByLabelText("saved keywords")).toBeEmptyDOMElement());
  });

  it("shows an already-saved no-op toast without Undo", async () => {
    const researchAction = vi.fn(async (input: { estimateOnly?: boolean }) =>
      success({ cached: false, costCents: 4, estimate: input.estimateOnly }),
    );
    const saveKeywordsAction = vi.fn(async () => ({
      created: [],
      duplicateCount: 3,
      savedCount: 0,
    }));

    render(
      <ToastProvider>
        <SessionSpendProvider>
          <ResearchWorkspace
            addKeywordsAction={vi.fn() as never}
            canDeleteSavedKeywords
            checkHealth={checkHealth}
            context={context}
            costContext={costContext}
            removeSavedKeywordsAction={savedKeywordActions.removeSavedKeywordsAction}
            researchAction={researchAction as unknown as ResearchKeywordsAction}
            saveKeywordsAction={saveKeywordsAction}
          />
        </SessionSpendProvider>
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run research" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save 3" }));

    expect(await screen.findByText(/3 keywords already saved/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });

  it("hides destructive saved controls without delete permission", async () => {
    const researchAction = vi.fn(async (input: { estimateOnly?: boolean }) =>
      success({ cached: false, costCents: 4, estimate: input.estimateOnly }),
    );
    const saveKeywordsAction = vi.fn(async () => ({
      created: [{ keyword: "seo tool", publicId: "skw_1" }],
      duplicateCount: 2,
      savedCount: 1,
    }));

    render(
      <ToastProvider>
        <SessionSpendProvider>
          <ResearchWorkspace
            addKeywordsAction={vi.fn() as never}
            canDeleteSavedKeywords={false}
            checkHealth={checkHealth}
            context={context}
            costContext={costContext}
            removeSavedKeywordsAction={savedKeywordActions.removeSavedKeywordsAction}
            researchAction={researchAction as unknown as ResearchKeywordsAction}
            saveKeywordsAction={saveKeywordsAction}
          />
        </SessionSpendProvider>
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run research" }));
    expect(await screen.findByRole("button", { name: "Save 3" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove first saved" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save 3" }));
    expect(await screen.findByText(/Saved 1 keyword/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });
});
