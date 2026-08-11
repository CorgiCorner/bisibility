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
      />,
    );

    expect(screen.getByTestId("provider-dataforseo")).toHaveAttribute("data-has-actions", "true");
    expect(screen.getByTestId("provider-serpapi")).toHaveAttribute("data-has-actions", "true");
    expect(screen.getByTestId("serp-fallback-order")).toBeInTheDocument();
  });

  it("does not render fallback controls for analytics sources", () => {
    render(
      <IntegrationCategory
        actions={actions}
        canManageProviders
        canUpdateProject
        category={integrationCategories[1]}
      />,
    );

    expect(screen.queryByTestId("serp-fallback-order")).not.toBeInTheDocument();
  });
});
