import { renderWithIntegrationMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { IntegrationProviderData } from "@/lib/integrations/types";
import { screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { IntegrationCategories } from "./IntegrationCategories";
import { integrationCategories } from "./integrations-fixtures";

const authority = vi.hoisted(() => ({ generation: 0 }));
vi.mock("@/components/provider-management/ProviderUiProvider", () => ({
  ProviderUiProvider: ({ children }: { children: ReactNode }) => (
    <div key={authority.generation}>{children}</div>
  ),
}));
vi.mock("./ProviderCard", () => ({
  ProviderCard: ({ provider }: { provider: IntegrationProviderData }) => (
    <div data-testid={`provider-card-${provider.id}`}>
      {provider.name}: {provider.enabled === false ? "disabled" : "enabled"}
    </div>
  ),
}));
vi.mock("./ProjectSerpChain", () => ({ ProjectSerpChain: () => null }));
vi.mock("./ProviderConsumerPanel", () => ({ ProviderConsumerPanel: () => null }));

it("retains card order when verified provider authority remounts its children", () => {
  const category = integrationCategories[0];
  const [first, second] = category.providers;
  if (!first || !second) throw new Error("Two provider fixtures are required");
  const view = (providers: readonly IntegrationProviderData[]) => (
    <IntegrationCategories
      canManageProviders
      canUpdateProject
      categories={[{ ...category, providers }]}
      projectId="prj_1"
      timeZone="UTC"
    />
  );
  const order = () => screen.getAllByTestId(/^provider-card-/).map((node) => node.dataset.testid);
  const { rerender } = render(view([first, second]));
  authority.generation += 1;
  rerender(view([second, { ...first, enabled: false }]));
  expect(order()).toEqual([`provider-card-${first.id}`, `provider-card-${second.id}`]);
  expect(screen.getByTestId(`provider-card-${first.id}`)).toHaveTextContent("disabled");
});
