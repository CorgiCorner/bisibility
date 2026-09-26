import {
  renderWithUsageSettingsMessages as render,
  usageSettingsFeatureTestMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/settings/usage/BudgetEditModal", () => ({
  BudgetEditModal: () => (
    <div aria-label="Budget setup" role="dialog">
      Budget setup
    </div>
  ),
}));
vi.mock("@/components/settings/usage/ProviderUsageRow", () => ({
  ProviderUsageRow: () => null,
}));

import { ProviderUsageCard } from "./ProviderUsageCard";

type ProviderUsageCardProps = ComponentProps<typeof ProviderUsageCard>;

const attentionCopy = usageSettingsFeatureTestMessages.projectSettingsUsage.provider;

const usage: ProviderUsageCardProps["usage"] = {
  budget: { capCents: 0, spentCents: 0 },
  connections: [],
  hasProvider: true,
  onPaceCents: null,
  period: {
    dateFormat: "month_first",
    endAt: "2026-09-01T00:00:00.000Z",
    endLabel: "August 31, 2026",
    label: "August 2026",
    now: "2026-08-20T12:00:00.000Z",
    resetsLabel: "resets in 12 days",
    timezone: "UTC",
  },
  primaryProvider: "Provider A",
  providerSpend: {
    connections: [],
    summary: {
      attention: [],
      maxUsedPercent: null,
      period: {
        daysUntilReset: 12,
        endsAt: "2026-09-01T00:00:00.000Z",
        monthLabel: "August 2026",
        startsAt: "2026-08-01T00:00:00.000Z",
      },
      projected: { kind: "no_usage" },
      recorded: { cents: 0, creditsCents: 0, units: 0 },
      requestCount: 0,
      tightest: null,
    },
  },
  serpChecksMonth: "0",
};

const updateProviderAllocation = vi.fn<ProviderUsageCardProps["updateProviderAllocation"]>();

describe("ProviderUsageCard", () => {
  it("sizes naturally without a fixed or minimum height", () => {
    const { container } = render(
      <ProviderUsageCard
        canEditBudget={false}
        projectId="project_1"
        projectRef="prj_example"
        updateProviderAllocation={updateProviderAllocation}
        usage={usage}
      />,
    );

    const card = container.querySelector("[data-settings-card]");
    expect(card).toHaveClass("min-h-0");
    expect(card?.className).not.toMatch(/(?:^|\s)(?:min-h|h)-\[/);
  });

  it("opens the existing budget modal from a server-derived request", () => {
    render(
      <ProviderUsageCard
        canEditBudget
        initialBudgetEditOpen
        projectId="project_1"
        projectRef="prj_example"
        updateProviderAllocation={updateProviderAllocation}
        usage={usage}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Budget setup" })).toHaveTextContent("Budget setup");
  });

  it("does not render the future-cost link", () => {
    render(
      <ProviderUsageCard
        canEditBudget={false}
        projectId="project_1"
        projectRef="prj_example"
        updateProviderAllocation={updateProviderAllocation}
        usage={usage}
      />,
    );

    expect(screen.queryByRole("link", { name: "Estimate future cost" })).not.toBeInTheDocument();
  });

  it("renders the attention banner message with semibold weight", () => {
    const banner = "Provider A hit its budget - checks are paused.";
    const attentionUsage = {
      ...usage,
      providerSpend: {
        ...usage.providerSpend,
        connections: [
          {
            allocation: null,
            allocationSource: "none",
            billing: "metered",
            connectionId: "connection_1",
            credentialSource: "own",
            enabled: true,
            features: [],
            primary: true,
            programmaticAllocation: null,
            projectedExhaustionAt: null,
            provider: "Provider A",
            providerId: "provider_a",
            quotaReset: "none",
            remaining: null,
            requestCount: 0,
            unconfirmedCount: 0,
            state: "capped",
            status: "connected",
            surfaces: {
              app: {
                allocation: null,
                projectedExhaustionAt: null,
                remaining: null,
                state: "no_allocation",
                used: 0,
                usedPercent: null,
              },
              programmatic: {
                allocation: null,
                projectedExhaustionAt: null,
                remaining: null,
                state: "no_allocation",
                used: 0,
                usedPercent: null,
              },
            },
            own: {
              requestCount: 0,
              surfaces: {
                app: {
                  allocation: null,
                  projectedExhaustionAt: null,
                  remaining: null,
                  state: "no_allocation",
                  used: 0,
                  usedPercent: null,
                },
                programmatic: {
                  allocation: null,
                  projectedExhaustionAt: null,
                  remaining: null,
                  state: "no_allocation",
                  used: 0,
                  usedPercent: null,
                },
              },
              unconfirmedCount: 0,
              unit: "cents",
              used: 0,
              usedPriorMonth: 0,
            },
            credits: {
              requestCount: 0,
              surfaces: {
                app: {
                  allocation: null,
                  projectedExhaustionAt: null,
                  remaining: null,
                  state: "no_allocation",
                  used: 0,
                  usedPercent: null,
                },
                programmatic: {
                  allocation: null,
                  projectedExhaustionAt: null,
                  remaining: null,
                  state: "no_allocation",
                  used: 0,
                  usedPercent: null,
                },
              },
              unconfirmedCount: 0,
              unit: "cents",
              used: 0,
              usedPriorMonth: 0,
            },
            unit: "cents",
            used: 0,
            usedPercent: null,
            usedPriorMonth: 0,
          },
        ],
        summary: { ...usage.providerSpend.summary, attention: ["connection_1"] },
      },
    } satisfies ProviderUsageCardProps["usage"];

    render(
      <ProviderUsageCard
        canEditBudget={false}
        projectId="project_1"
        projectRef="prj_example"
        updateProviderAllocation={updateProviderAllocation}
        usage={attentionUsage}
      />,
    );

    expect(screen.getByText(banner)).toHaveClass("font-semibold");
  });

  it.each([
    {
      app: false,
      banner: attentionCopy.attentionProgrammatic.replace("{provider}", "Provider A"),
      programmatic: true,
    },
    {
      app: true,
      banner: attentionCopy.attentionApp.replace("{provider}", "Provider A"),
      programmatic: false,
    },
  ] as const)("names the capped surface in the banner (app: {app})", ({ app, banner }) => {
    const cappedSurface = {
      allocation: { amountPerMonth: 100 as const, unit: "cents" as const },
      projectedExhaustionAt: null,
      remaining: 0,
      state: "capped" as const,
      used: 100,
      usedPercent: 100,
    };
    const noCapSurface = {
      allocation: null,
      projectedExhaustionAt: null,
      remaining: null,
      state: "no_allocation" as const,
      used: 0,
      usedPercent: null,
    };
    const surfaceUsage = {
      ...usage,
      providerSpend: {
        ...usage.providerSpend,
        connections: [
          {
            allocation: app ? { amountPerMonth: 100, unit: "cents" } : null,
            allocationSource: "connection",
            billing: "metered",
            connectionId: "connection_1",
            credentialSource: "own",
            enabled: true,
            features: [],
            primary: true,
            programmaticAllocation: app ? null : { amountPerMonth: 100, unit: "cents" },
            projectedExhaustionAt: null,
            provider: "Provider A",
            providerId: "provider_a",
            quotaReset: "none",
            remaining: app ? 0 : null,
            requestCount: 1,
            unconfirmedCount: 0,
            state: "capped",
            status: "connected",
            surfaces: {
              app: app ? cappedSurface : noCapSurface,
              programmatic: app ? noCapSurface : cappedSurface,
            },
            own: {
              requestCount: 1,
              surfaces: {
                app: app ? cappedSurface : noCapSurface,
                programmatic: app ? noCapSurface : cappedSurface,
              },
              unconfirmedCount: 0,
              unit: "cents",
              used: app ? 100 : 0,
              usedPriorMonth: 0,
            },
            credits: {
              requestCount: 0,
              surfaces: {
                app: {
                  allocation: null,
                  projectedExhaustionAt: null,
                  remaining: null,
                  state: "no_allocation",
                  used: 0,
                  usedPercent: null,
                },
                programmatic: {
                  allocation: null,
                  projectedExhaustionAt: null,
                  remaining: null,
                  state: "no_allocation",
                  used: 0,
                  usedPercent: null,
                },
              },
              unconfirmedCount: 0,
              unit: "cents",
              used: 0,
              usedPriorMonth: 0,
            },
            unit: "cents",
            used: app ? 100 : 0,
            usedPercent: app ? 100 : null,
            usedPriorMonth: 0,
          },
        ],
        summary: { ...usage.providerSpend.summary, attention: ["connection_1"] },
      },
    } satisfies ProviderUsageCardProps["usage"];

    render(
      <ProviderUsageCard
        canEditBudget={false}
        projectId="project_1"
        projectRef="prj_example"
        updateProviderAllocation={updateProviderAllocation}
        usage={surfaceUsage}
      />,
    );

    expect(screen.getByText(banner)).toBeInTheDocument();
  });
});
