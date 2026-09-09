import {
  UsageSettingsContent,
  type UsageSettingsContentProps,
} from "@/components/settings/usage/UsageSettingsContent";
import { appPath } from "@/lib/routing/app-path";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const usage = {
  budget: { capCents: 5000, spentCents: 10 },
  connections: [],
  hasProvider: true,
  onPaceCents: null,
  period: {
    dateFormat: "month_first",
    endAt: "2026-09-01T00:00:00.000Z",
    endLabel: "Aug 31, 2026",
    label: "August 2026",
    now: "2026-08-24T17:03:00.000Z",
    resetsLabel: "resets in 8 days",
    timezone: "UTC",
  },
  primaryProvider: "SerpApi",
  serpChecksMonth: "0",
  providerSpend: {
    connections: [
      {
        allocation: { amountPerMonth: 100, unit: "units" },
        allocationSource: "legacy_project",
        billing: "quota",
        connectionId: "conn_serp",
        enabled: true,
        features: [{ costCents: 0, count: 0, feature: "rank_check", label: "Rank checks" }],
        primary: true,
        projectedExhaustionAt: null,
        provider: "SerpApi",
        providerId: "serpapi",
        quotaReset: "billing_cycle",
        remaining: 0,
        requestCount: 28,
        state: "fallback_active",
        status: "connected",
        unit: "units",
        used: 100,
        usedPercent: 100,
        usedPriorMonth: 1280,
        availableAtProvider: {
          amount: 222,
          checkedAt: "2026-08-24T17:03:00.000Z",
          status: "available",
          unit: "searches",
        },
      },
      {
        allocation: { amountPerMonth: 3000, unit: "cents" },
        allocationSource: "connection",
        billing: "metered",
        connectionId: "conn_data",
        enabled: true,
        features: [{ costCents: 10, count: 1, feature: "rank_check", label: "Rank checks" }],
        primary: false,
        projectedExhaustionAt: null,
        provider: "DataForSEO",
        providerId: "dataforseo",
        quotaReset: "none",
        remaining: 2990,
        requestCount: 1,
        state: "ok",
        status: "connected",
        unit: "cents",
        used: 10,
        usedPercent: 0.33,
        usedPriorMonth: 40,
        availableAtProvider: {
          amount: 12.4,
          checkedAt: "2026-08-24T17:03:00.000Z",
          status: "available",
          unit: "usd",
        },
      },
    ],
    summary: {
      attention: ["conn_serp"],
      maxUsedPercent: 100,
      period: {
        daysUntilReset: 8,
        endsAt: "2026-09-01T00:00:00.000Z",
        monthLabel: "August 2026",
        startsAt: "2026-08-01T00:00:00.000Z",
      },
      projected: { at: "2026-08-27T00:00:00.000Z", kind: "cap_by", provider: "SerpApi" },
      recorded: { cents: 10, units: 28 },
      requestCount: 29,
      tightest: { connectionId: "conn_serp", provider: "SerpApi", usedPercent: 100 },
    },
  },
} as unknown as UsageSettingsContentProps["usage"];
const actions = {
  submitPricingFeedback: vi.fn(async () => ({ answered: true as const })),
  updateProviderAllocation: vi.fn(async () => usage.providerSpend.connections[0]),
};
function renderUsage(next = usage) {
  return render(
    <UsageSettingsContent
      {...actions}
      canEditBudget
      canSubmitPricingFeedback
      deployment="cloud"
      projectId="prj_story"
      projectRef="prj_story"
      usage={next}
    />,
  );
}

describe("UsageSettingsContent", () => {
  it("matches the monthly price control to the medium feedback button and omits helper copy", () => {
    renderUsage();

    const input = screen.getByLabelText("What would you pay per month?");
    const button = screen.getByRole("button", { name: "Send feedback" });
    expect(input).toHaveAttribute("maxlength", "4");
    expect(input).toHaveClass("h-[35px]", "min-h-[35px]");
    expect(input).not.toHaveClass("min-h-10");
    expect(button).toHaveAttribute("data-size", "md");
    expect(
      screen.queryByText("Four digits at most. The answer is not a commitment."),
    ).not.toBeInTheDocument();
  });

  it("renders the hosted plan summary as an unindented checked list", () => {
    renderUsage();

    const list = screen.getByText(/Free while the beta lasts/).closest("ul");
    expect(list).not.toBeNull();
    expect(list).toHaveClass("m-0", "list-none", "p-0");

    const items = list?.querySelectorAll("li") ?? [];
    const checks = list?.querySelectorAll('svg[data-hosted-plan-bullet="true"]') ?? [];
    expect(items).toHaveLength(4);
    expect(checks).toHaveLength(items.length);
    for (const item of items) {
      expect(item).toHaveClass("flex", "items-start", "gap-2.5");
      const check = item.querySelector('svg[data-hosted-plan-bullet="true"]');
      expect(check).toHaveAttribute("aria-hidden", "true");
      expect(check).toHaveClass(
        "shrink-0",
        "self-center",
        "[color:color-mix(in_srgb,var(--fg-muted)_60%,transparent)]",
      );
    }
  });

  it("renders allocation data, fallback attention, and no prohibited copy", () => {
    const { container } = renderUsage();
    expect(screen.getByText("$0.10 + 28 searches")).toBeInTheDocument();
    expect(
      screen.getByText(/SerpApi hit its budget - checks are falling back to DataForSEO/),
    ).toBeInTheDocument();
    expect(screen.getByText("100 of 100 searches used")).toBeInTheDocument();
    expect(
      screen.getByText(/222 left at provider \(just now\).*resets at billing cycle/),
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/utili(?:zation|sation)/i);
  });
  it("keeps risk order and puts the metrics below the badge group", () => {
    const { container } = renderUsage();
    const rows = container.querySelectorAll("#provider-usage summary");
    expect(rows[0]).toHaveTextContent("SerpApi");
    expect(rows[0].querySelector('[role="meter"]')).not.toBeNull();
    expect(rows[0].querySelector(".shrink-0")).not.toBeNull();
  });
  it.each([
    [28, "bg-accent", null],
    [80, "bg-yellow", "text-yellow-text"],
    [100, "bg-red", "text-red-text"],
  ])("tones summary and provider bars at %i%%", (percent, fillClass, textClass) => {
    const next = structuredClone(usage) as UsageSettingsContentProps["usage"];
    const connection = next.providerSpend.connections[0];
    connection.used = percent;
    connection.usedPercent = percent;
    next.providerSpend.summary.maxUsedPercent = percent;
    next.providerSpend.summary.tightest = {
      connectionId: "conn_serp",
      provider: "SerpApi",
      usedPercent: percent,
    };
    const { container } = renderUsage(next);

    const summaryFill = container.querySelector('[role="meter"][aria-label="Budget used"] span');
    const rowFill = container.querySelector(
      '[role="meter"][aria-label="SerpApi budget used"] span',
    );
    const allocation = screen.getByText(`${percent} of 100 searches used`);
    expect(summaryFill).toHaveClass(fillClass);
    expect(rowFill).toHaveClass(fillClass);
    if (textClass) expect(allocation).toHaveClass(textClass);
    else expect(allocation).toHaveClass("text-fg-muted");
  });
  it("keeps projected KPI copy concise while the explanation remains below the bar", () => {
    renderUsage();
    expect(screen.getByText("SerpApi budget by Aug 27, 2026")).toBeInTheDocument();
    expect(screen.getByText(/on pace to hit SerpApi budget Aug 27, 2026/)).toBeInTheDocument();
  });
  it("shows no budget and no usage states without a banner", () => {
    const next = structuredClone(usage) as UsageSettingsContentProps["usage"];
    next.providerSpend.connections.forEach((connection) => {
      connection.allocation = null;
      connection.usedPercent = null;
      connection.state = "no_allocation";
      connection.used = 0;
    });
    next.providerSpend.summary = {
      ...next.providerSpend.summary,
      attention: [],
      maxUsedPercent: null,
      projected: { kind: "no_usage" },
      tightest: null,
    };
    renderUsage(next);
    expect(screen.getByText("No budget set")).toBeInTheDocument();
    expect(screen.getAllByText("No usage yet").length).toBeGreaterThan(0);
    expect(screen.queryByText("Connection settings")).not.toBeInTheDocument();
  });
  it("explains how to connect a provider when the allocation editor is empty", async () => {
    const user = userEvent.setup();
    const next = structuredClone(usage) as UsageSettingsContentProps["usage"];
    next.providerSpend.connections = [];
    next.providerSpend.summary = {
      ...next.providerSpend.summary,
      attention: [],
      maxUsedPercent: null,
      projected: { kind: "no_usage" },
      tightest: null,
    };
    renderUsage(next);

    await user.click(screen.getByRole("button", { name: "Edit budget" }));

    expect(screen.getByRole("dialog")).toHaveTextContent(
      "No provider connected yet. Connect a provider to set a monthly budget for it.",
    );
    expect(screen.getByRole("link", { name: "Connect a provider" })).toHaveAttribute(
      "href",
      appPath("prj_story", "integrations"),
    );
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });
  it("keeps allocation editor rows available for a connected provider", async () => {
    const user = userEvent.setup();
    const next = structuredClone(usage) as UsageSettingsContentProps["usage"];
    next.providerSpend.connections = [next.providerSpend.connections[0]];
    renderUsage(next);

    await user.click(screen.getByRole("button", { name: "Edit budget" }));

    expect(screen.getByLabelText("SerpApi monthly budget")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });
  it("validates and saves changed per-provider budget payloads", async () => {
    const user = userEvent.setup();
    renderUsage();
    await user.click(screen.getByRole("button", { name: "Edit budget" }));
    const input = screen.getByLabelText("DataForSEO monthly budget");
    await user.clear(input);
    await user.type(input, "40.50");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(actions.updateProviderAllocation).toHaveBeenCalledWith("prj_story", {
      allocation: { amountDollars: "40.50", unit: "cents" },
      connectionId: "conn_data",
    });
    expect(routerMock.refresh).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Edit budget" }));
  });
});
