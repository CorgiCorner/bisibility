import { SessionSpendProvider } from "@/components/cost-estimate/SessionSpendProvider";
import type { AnalyzeBacklinksAction } from "@/lib/actions/backlinks";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BacklinksWorkspace } from "./BacklinksWorkspace";

const context = {
  costContext: { capCents: 5000, spentCents: 1200 },
  defaultTarget: "example.com",
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
        suggestedEstimateCents={5}
        {...overrides}
      />
    </SessionSpendProvider>,
  );
}

function snapshot(target: string) {
  return {
    cached: false,
    cachedUntil: "2026-07-25T10:00:00.000Z",
    costCents: 5,
    estimate: true,
    estimatedCostCents: 5,
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
  it("uses the server estimate path to validate a target and reveal its price", async () => {
    vi.useFakeTimers();
    const analyzeAction = vi.fn(async (input: unknown) => {
      const target = (input as { target: string }).target;
      if (target === "not-valid") throw new Error("unsupported target");
      return snapshot(target);
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

  it("renders the binding idle-state copy and live suggested estimate", () => {
    renderWorkspace();

    expect(screen.getByText("Point it at any domain")).toBeInTheDocument();
    expect(
      screen.getByText("Runs on your own DataForSEO key, price shown before every run"),
    ).toBeInTheDocument();
    expect(screen.getByText("~$0.05 each, cached for a day once run")).toBeInTheDocument();
  });

  it("enables Analyze after selecting the project target badge", async () => {
    vi.useFakeTimers();
    const analyzeAction = vi.fn(async (input: unknown) =>
      snapshot((input as { target: string }).target),
    );
    renderWorkspace({
      analyzeAction: analyzeAction as unknown as AnalyzeBacklinksAction,
      context: { ...context, defaultTarget: "example.com" },
    });

    fireEvent.click(screen.getByText("example.com").closest("button") as HTMLButtonElement);
    await act(async () => vi.advanceTimersByTimeAsync(320));

    expect(screen.getByRole("button", { name: "Analyze ~$0.05" })).toBeEnabled();
    expect(analyzeAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ estimateOnly: true, target: "example.com" }),
    );
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
    const analyzeAction = vi.fn(async (input: unknown) =>
      snapshot((input as { target: string }).target),
    );
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
      return snapshot(request.target);
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
    const analyzeAction = vi.fn(async (input: unknown) =>
      snapshot((input as { target: string }).target),
    );
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
