import { renderWithIntegrationMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { IntegrationProviderData } from "@/lib/integrations/types";
import { screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { IntegrationCategory } from "./IntegrationCategory";
import { integrationCategories } from "./integrations-fixtures";

vi.mock("./ProviderCard", () => ({
  ProviderCard: ({ provider }: { provider: IntegrationProviderData }) => (
    <div data-testid={`provider-card-${provider.id}`}>
      {provider.name}: {provider.enabled === false ? "disabled" : "enabled"}
    </div>
  ),
}));
vi.mock("./ProjectSerpChain", () => ({ ProjectSerpChain: () => null }));
vi.mock("./ProviderConsumerPanel", () => ({ ProviderConsumerPanel: () => null }));

it("keeps card order after saves while applying current settings, and reorders on a fresh mount", () => {
  const category = integrationCategories[0];
  const [first, second] = category.providers;
  if (!first || !second) throw new Error("Two provider fixtures are required");
  const view = (providers: readonly IntegrationProviderData[]) => (
    <IntegrationCategory
      canManageProviders
      canUpdateProject
      category={{ ...category, providers }}
      projectId="prj_1"
      timeZone="UTC"
    />
  );
  const order = () => screen.getAllByTestId(/^provider-card-/).map((node) => node.dataset.testid);
  const { rerender, unmount } = render(view([first, second]));
  expect(order()).toEqual([`provider-card-${first.id}`, `provider-card-${second.id}`]);

  rerender(view([second, { ...first, enabled: false }]));
  expect(order()).toEqual([`provider-card-${first.id}`, `provider-card-${second.id}`]);
  expect(screen.getByTestId(`provider-card-${first.id}`)).toHaveTextContent("disabled");

  unmount();
  render(view([second, { ...first, enabled: false }]));
  expect(order()).toEqual([`provider-card-${second.id}`, `provider-card-${first.id}`]);
});
