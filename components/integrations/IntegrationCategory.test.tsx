import type { ProviderActionHandlers } from "@/lib/integrations/types";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IntegrationCategory } from "./IntegrationCategory";
import { integrationCategories } from "./integrations-fixtures";

vi.mock("@/components/integrations/ProviderCard", () => ({
  ProviderCard: vi.fn(({ actions, provider }) => (
    <div data-has-actions={String(Boolean(actions))} data-testid={`provider-${provider.id}`} />
  )),
}));

vi.mock("@/components/integrations/SerpFallbackOrder", () => ({
  SerpFallbackOrder: vi.fn(() => <div data-testid="serp-fallback-order" />),
}));

const actions = {
  connectProvider: vi.fn(async () => undefined),
  disconnectProvider: vi.fn(async () => undefined),
  testProviderConnection: vi.fn(async () => ({ message: "ok", ok: true })),
  updateProviderCost: vi.fn(async () => undefined),
  updateProviderSettings: vi.fn(async () => undefined),
} satisfies ProviderActionHandlers;

describe("IntegrationCategory", () => {
  it("passes provider actions through to provider cards", () => {
    render(
      <IntegrationCategory
        actions={actions}
        canManageProviders
        canUpdateProject
        category={integrationCategories[0]}
        searchSyncPlan={undefined}
        timeZone="UTC"
      />,
    );

    const firstProvider = screen.getByTestId("provider-dataforseo");
    const secondProvider = screen.getByTestId("provider-serpapi");
    const fallbackOrder = screen.getByTestId("serp-fallback-order");

    expect(firstProvider).toHaveAttribute("data-has-actions", "true");
    expect(secondProvider).toHaveAttribute("data-has-actions", "true");
    expect(firstProvider.compareDocumentPosition(fallbackOrder)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(secondProvider.compareDocumentPosition(fallbackOrder)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(
      screen.getByText("Connect providers that run Google rank checks in Rank Tracker."),
    ).toBeVisible();
    expect(screen.queryByText(/priority-ordered fallback chain/)).not.toBeInTheDocument();
  });

  it("omits redundant category eyebrows", () => {
    render(
      <IntegrationCategory
        actions={actions}
        canManageProviders
        canUpdateProject
        category={integrationCategories[0]}
        searchSyncPlan={undefined}
        timeZone="UTC"
      />,
    );

    expect(screen.queryByText("Google rank checks - priority fallback")).not.toBeInTheDocument();

    render(
      <IntegrationCategory
        actions={actions}
        canManageProviders
        canUpdateProject
        category={integrationCategories[1]}
        searchSyncPlan={{ daysTotal: 93, pace: "gentle", retentionMonths: 3 }}
        timeZone="UTC"
      />,
    );
    expect(screen.queryByText("Owned-data performance context")).not.toBeInTheDocument();
  });

  it("does not render fallback controls for analytics sources", () => {
    render(
      <IntegrationCategory
        actions={actions}
        canManageProviders
        canUpdateProject
        category={integrationCategories[1]}
        searchSyncPlan={{ daysTotal: 93, pace: "gentle", retentionMonths: 3 }}
        timeZone="UTC"
      />,
    );

    expect(screen.queryByTestId("serp-fallback-order")).not.toBeInTheDocument();
  });
});
