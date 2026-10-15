import { SessionSpendProvider } from "@/components/cost-estimate/SessionSpendProvider";
import { renderWithBacklinksMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { AnalyzeBacklinksAction } from "@/lib/actions/backlinks";
import sharedMessages from "@/messages/core/en/shared.json";
import { act, fireEvent, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BacklinksWorkspace } from "./BacklinksWorkspace";

const context = {
  costContext: { capCents: 5000, spentCents: 1200 },
  defaultTarget: "example.com",
  providerStatus: "connected" as const,
  recentTargets: [],
};
const loadMoreAction = vi.fn();

function renderWorkspace(overrides: Partial<ComponentProps<typeof BacklinksWorkspace>> = {}) {
  return render(
    <SessionSpendProvider>
      <BacklinksWorkspace
        analyzeAction={vi.fn() as unknown as AnalyzeBacklinksAction}
        context={context}
        loadMoreAction={loadMoreAction}
        projectId="prj_1"
        {...overrides}
      />
    </SessionSpendProvider>,
  );
}

function estimate(target: string) {
  return {
    cached: false,
    cachedUntil: null,
    costCents: 5,
    estimate: true as const,
    estimatedCostCents: 5,
    includeSubdomains: true,
    ok: true as const,
    provider: "dataforseo",
    target,
    targetScope: "site" as const,
  };
}

/** Mirrors the server: a dry run for estimateOnly, a snapshot for a paid call. */
function outcome(input: unknown) {
  const request = input as { estimateOnly?: boolean; target: string };
  return request.estimateOnly ? estimate(request.target) : snapshot(request.target);
}

function snapshot(target: string) {
  return {
    cached: false,
    cachedUntil: "2026-07-25T10:00:00.000Z",
    costCents: 5,
    fetchedAt: "2026-07-24T10:00:00.000Z",
    fetchedRowCount: 0,
    history: [],
    includeSubdomains: true,
    ok: true as const,
    provider: "dataforseo",
    rows: [],
    summary: {
      backlinksTotal: 0,
      brokenBacklinks: 0,
      brokenPages: 0,
      dofollowPct: 0,
      domainRank: 0,
      lostBacklinks: 0,
      lostReferringDomains: 0,
      newBacklinks: 0,
      newReferringDomains: 0,
      referringDomainsTotal: 0,
      referringPages: 0,
      spamScore: 0,
    },
    target,
    targetScope: "site" as const,
    totalRowsAvailable: 0,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("BacklinksWorkspace", () => {
  it("reopens a recent legacy result read-only without changing its unknown source", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-24T12:00:00Z"));
    const analyzeAction = vi.fn(async (input: unknown) => {
      const request = input as { estimateOnly?: boolean };
      return request.estimateOnly
        ? {
            ...estimate("example.com"),
            provider: "unknown",
            cached: true,
            costCents: 0,
            estimatedCostCents: 0,
          }
        : {
            ...snapshot("example.com"),
            provider: "unknown",
            cached: true,
            costCents: 0,
            fetchedRowCount: 100,
            totalRowsAvailable: 200,
          };
    });
    renderWorkspace({
      analyzeAction: analyzeAction as unknown as AnalyzeBacklinksAction,
      context: {
        ...context,
        recentTargets: [
          {
            cachedUntil: "2026-07-25T12:00:00Z",
            fetchedAt: "2026-07-24T10:00:00Z",
            includeSubdomains: true,
            provider: "unknown",
            resultLimit: 100,
            target: "example.com",
            targetScope: "site",
          },
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /^example\.com/ }));
    await act(async () => vi.advanceTimersByTimeAsync(320));
    expect(analyzeAction).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "unknown", maxCostCents: 0, estimateOnly: false }),
    );
    expect(screen.getByText("Source: Unknown source")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Refresh now|Load more/i }),
    ).not.toBeInTheDocument();
    expect(loadMoreAction).not.toHaveBeenCalled();
  });
  it("re-estimates the explicitly selected provider without launching a paid analysis", async () => {
    vi.useFakeTimers();
    const analyzeAction = vi.fn(async (input: unknown) => outcome(input));
    renderWorkspace({
      analyzeAction: analyzeAction as unknown as AnalyzeBacklinksAction,
      initialTarget: "example.com",
      context: {
        ...context,
        providers: [
          { label: "Fixture A", value: "fixture_a" },
          { label: "Fixture B", value: "fixture_b" },
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Backlink source" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Fixture B" }));
    await act(async () => vi.advanceTimersByTimeAsync(320));
    expect(analyzeAction).toHaveBeenCalledTimes(1);
    expect(analyzeAction).toHaveBeenCalledWith(
      expect.objectContaining({ estimateOnly: true, provider: "fixture_b", target: "example.com" }),
    );
    expect(loadMoreAction).not.toHaveBeenCalled();
  });
  it("matches Domain Overview when a capable provider is missing", () => {
    renderWorkspace({ context: { ...context, providerStatus: "no_provider" } });

    expect(screen.getByText("Connect DataForSEO to analyze backlinks")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Backlinks requires a provider with backlink intelligence support. Lookups run on your own key.",
      ),
    ).toBeInTheDocument();
    const connect = screen.getByRole("link", { name: "Connect DataForSEO" });
    expect(connect).toHaveAttribute("href", "/app/prj_1/integrations");
    expect(connect).toHaveClass("bg-accent-solid", "rounded-control");
  });

  it("prefills and prices a target supplied by a linking workspace", () => {
    render(
      <SessionSpendProvider>
        <BacklinksWorkspace
          analyzeAction={vi.fn() as unknown as AnalyzeBacklinksAction}
          context={context}
          initialEstimate={{ cached: false, costCents: 5, loading: false, valid: true }}
          initialTarget="linked.example"
          loadMoreAction={loadMoreAction}
          projectId="prj_1"
        />
      </SessionSpendProvider>,
    );

    expect(screen.getByText("linked.example")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analyze ~$0.05" })).toBeEnabled();
  });

  it("uses the server estimate path to validate a target and reveal its price", async () => {
    vi.useFakeTimers();
    const analyzeAction = vi.fn(async (input: unknown) => {
      const target = (input as { target: string }).target;
      if (target === "not-valid") {
        return {
          ok: false as const,
          reason: "unsupported_target" as const,
          message: "Unsupported target.",
        };
      }
      return outcome(input);
    });
    renderWorkspace({ analyzeAction: analyzeAction as unknown as AnalyzeBacklinksAction });

    const input = screen.getByRole("textbox", { name: "Backlinks target" });
    fireEvent.change(input, { target: { value: "not-valid" } });
    await act(async () => vi.advanceTimersByTimeAsync(320));
    expect(screen.getByRole("button", { name: "Analyze" })).toBeDisabled();

    fireEvent.change(input, { target: { value: "example.com" } });
    await act(async () => vi.advanceTimersByTimeAsync(320));
    expect(screen.getByRole("button", { name: "Analyze ~$0.05" })).toBeEnabled();
    expect(analyzeAction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        estimateOnly: true,
        mode: "as_is",
        target: "example.com",
        targetScope: "site",
      }),
    );
  });

  it("refetches the price when the scope changes", async () => {
    // Exact-page scope is not billed the 12-month history, so a scope switch
    // moves the real price. Without a refetch the button kept the site-scope
    // number while the pricing popover showed the lower page-scope breakdown.
    vi.useFakeTimers();
    const analyzeAction = vi.fn(async (input: unknown) => outcome(input));
    renderWorkspace({ analyzeAction: analyzeAction as unknown as AnalyzeBacklinksAction });

    const input = screen.getByRole("textbox", { name: "Backlinks target" });
    fireEvent.change(input, { target: { value: "example.com" } });
    await act(async () => vi.advanceTimersByTimeAsync(320));
    analyzeAction.mockClear();

    fireEvent.click(screen.getByRole("radio", { name: "Exact page" }));
    await act(async () => vi.advanceTimersByTimeAsync(320));

    expect(analyzeAction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        estimateOnly: true,
        includeSubdomains: false,
        target: "example.com",
        targetScope: "page",
      }),
    );
  });

  it("renders the idle-state copy without suggested target shortcuts", () => {
    renderWorkspace();

    const heading = screen.getByRole("heading", { level: 3, name: "Point it at any domain" });
    expect(heading.parentElement).toHaveClass("rounded-card", "border", "bg-bg-elev");
    expect(heading.parentElement?.querySelector('[data-module-mark="soft"]')).not.toBeNull();
    expect(
      screen.getByText("Runs on your own DataForSEO key, price shown before every run"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Start with sites you already watch")).not.toBeInTheDocument();
    expect(screen.queryByText("this project")).not.toBeInTheDocument();
    expect(screen.queryByText("~$0.05 each, cached for a day once run")).not.toBeInTheDocument();
  });

  it("opens a cached recent target immediately", async () => {
    vi.useFakeTimers();
    const analyzeAction = vi.fn(async (input: unknown) => {
      const request = input as {
        estimateOnly?: boolean;
        fresh?: boolean;
        target: string;
      };
      return {
        ...snapshot(request.target),
        cached: !request.fresh,
        costCents: request.fresh ? 5 : 0,
        estimate: request.estimateOnly,
        estimatedCostCents: 5,
      };
    });
    renderWorkspace({
      analyzeAction: analyzeAction as unknown as AnalyzeBacklinksAction,
      context: {
        ...context,
        recentTargets: [
          {
            cachedUntil: new Date(Date.now() + 24 * 3_600_000).toISOString(),
            fetchedAt: new Date(Date.now() - 41 * 60_000).toISOString(),
            includeSubdomains: true,
            resultLimit: 100,
            target: "example.org",
            targetScope: "site",
          },
        ],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Backlinks limit" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Top 500 links" }));
    fireEvent.click(screen.getByRole("button", { name: /example\.org.*whole site/i }));
    await act(async () => vi.advanceTimersByTimeAsync(320));

    expect(analyzeAction).toHaveBeenCalledWith(
      expect.objectContaining({
        estimateOnly: false,
        fresh: false,
        includeSubdomains: true,
        maxCostCents: 0,
        resultLimit: 100,
        target: "example.org",
        targetScope: "site",
      }),
    );
    expect(screen.getByRole("region", { name: "Backlinks results" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analyze free, cached" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Backlinks limit" })).toHaveTextContent(
      "Top 100 links",
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Refresh now/ }));
    });
    expect(analyzeAction).toHaveBeenCalledWith(
      expect.objectContaining({
        estimateOnly: false,
        fresh: true,
        maxCostCents: 5,
        resultLimit: 100,
        target: "example.org",
      }),
    );
  });

  it("replaces the idle state with the shared-style results skeleton while a cached target opens", async () => {
    let resolveReplay: ((value: ReturnType<typeof snapshot>) => void) | undefined;
    const analyzeAction = vi.fn(
      () =>
        new Promise<ReturnType<typeof snapshot>>((resolve) => {
          resolveReplay = resolve;
        }),
    );
    renderWorkspace({
      analyzeAction: analyzeAction as unknown as AnalyzeBacklinksAction,
      context: {
        ...context,
        recentTargets: [
          {
            cachedUntil: new Date(Date.now() + 24 * 3_600_000).toISOString(),
            fetchedAt: new Date(Date.now() - 41 * 60_000).toISOString(),
            includeSubdomains: true,
            resultLimit: 100,
            target: "example.org",
            targetScope: "site",
          },
        ],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /example\.org.*whole site/i }));

    expect(await screen.findByLabelText("Backlinks loading")).toBeInTheDocument();
    expect(screen.queryByText("Point it at any domain")).not.toBeInTheDocument();

    resolveReplay?.(snapshot("example.org"));
    expect(await screen.findByRole("region", { name: "Backlinks results" })).toBeInTheDocument();
  });

  it("only fills the form when a recent target snapshot has expired", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-24T15:00:00.000Z"));
    const analyzeAction = vi.fn(async (input: unknown) => outcome(input));
    renderWorkspace({
      analyzeAction: analyzeAction as unknown as AnalyzeBacklinksAction,
      context: {
        ...context,
        recentTargets: [
          {
            cachedUntil: "2026-07-24T14:59:59.000Z",
            fetchedAt: "2026-07-23T15:00:00.000Z",
            includeSubdomains: true,
            resultLimit: 100,
            target: "expired.example.org",
            targetScope: "site",
          },
        ],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /expired\.example\.org.*whole site/i }));
    await act(async () => vi.advanceTimersByTimeAsync(320));

    expect(analyzeAction).toHaveBeenCalledTimes(1);
    expect(analyzeAction).toHaveBeenCalledWith(
      expect.objectContaining({
        estimateOnly: true,
        resultLimit: 100,
        target: "expired.example.org",
      }),
    );
    expect(
      screen.queryByText(
        "Backlinks could not be loaded. Check the target, provider connection, and budget.",
      ),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Backlinks results" })).not.toBeInTheDocument();
  });

  it("falls back to form fill when a cached replay loses its zero-cost race", async () => {
    vi.useFakeTimers();
    const analyzeAction = vi.fn(async (input: unknown) => {
      const request = input as { estimateOnly?: boolean; target: string };
      if (!request.estimateOnly) {
        return { ok: false as const, reason: "cost_limit_exceeded" as const };
      }
      return estimate(request.target);
    });
    renderWorkspace({
      analyzeAction: analyzeAction as unknown as AnalyzeBacklinksAction,
      context: {
        ...context,
        recentTargets: [
          {
            cachedUntil: new Date(Date.now() + 3_600_000).toISOString(),
            fetchedAt: new Date(Date.now() - 3_600_000).toISOString(),
            includeSubdomains: true,
            resultLimit: 100,
            target: "racy.example.org",
            targetScope: "site",
          },
        ],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /racy\.example\.org.*whole site/i }));
    await act(async () => vi.advanceTimersByTimeAsync(320));

    expect(analyzeAction).toHaveBeenCalledWith(
      expect.objectContaining({
        estimateOnly: false,
        maxCostCents: 0,
        resultLimit: 100,
        target: "racy.example.org",
      }),
    );
    expect(
      screen.queryByText(
        "Backlinks could not be loaded. Check the target, provider connection, and budget.",
      ),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Backlinks results" })).not.toBeInTheDocument();
  });

  it("requests the server estimate in page scope when Exact page is selected first", async () => {
    vi.useFakeTimers();
    const analyzeAction = vi.fn(async (input: unknown) => outcome(input));
    renderWorkspace({ analyzeAction: analyzeAction as unknown as AnalyzeBacklinksAction });

    fireEvent.click(screen.getByRole("radio", { name: "Exact page" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Backlinks target" }), {
      target: { value: "https://example.com/pricing" },
    });
    await act(async () => vi.advanceTimersByTimeAsync(320));

    expect(analyzeAction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        estimateOnly: true,
        targetScope: "page",
      }),
    );
  });
});

it.each([
  ["budget_missing", sharedMessages.shared.errors.budgetMissing],
  [undefined, "Backlinks could not be loaded. Check the target, provider connection, and budget."],
] as const)(
  "budget regression: renders backlink failure copy for %s",
  async (budgetReason, message) => {
    const analyzeAction = vi.fn().mockResolvedValue({
      ok: false,
      reason: "budget_exhausted",
      ...(budgetReason ? { budgetReason } : {}),
    });
    renderWorkspace({
      analyzeAction: analyzeAction as AnalyzeBacklinksAction,
      initialTarget: "example.com",
      initialEstimate: { cached: false, costCents: 5, loading: false, valid: true },
    });
    fireEvent.click(screen.getByRole("button", { name: "Analyze ~$0.05" }));
    expect(await screen.findByText(message)).toBeVisible();
    expect(analyzeAction).toHaveBeenCalledWith(expect.objectContaining({ estimateOnly: false }));
  },
);

it("shows a wallet budget denial without a project settings link", async () => {
  const analyzeAction = vi
    .fn()
    .mockResolvedValue({ ok: false, reason: "wallet_budget_exhausted", costCents: 0 });
  renderWorkspace({
    analyzeAction,
    initialTarget: "example.com",
    initialEstimate: { cached: false, costCents: 5, loading: false, valid: true },
  });
  fireEvent.click(screen.getByRole("button", { name: "Analyze ~$0.05" }));
  expect(await screen.findByText("Deployment spending budget is exhausted.")).toBeVisible();
  expect(screen.queryByRole("link", { name: /raise.*budget/i })).not.toBeInTheDocument();
});
