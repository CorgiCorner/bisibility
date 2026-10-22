import { renderWithUsageSettingsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { ProjectBudgetRow } from "@/lib/metering/project-budget-display";
import { budgetFixture, projectUsageFixture } from "@/lib/metering/shared-view-fixtures";
import { screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { ProviderBudgetLists } from "./ProviderBudgetLists";

const labels = { title: "Managed usage", description: "Usage charged to the account." };
function fixture() {
  const data = projectUsageFixture();
  data.connections = [
    { connectionId: "own", provider: "SerpApi", credentialSource: "own" },
    { connectionId: "managed", provider: "DataForSEO", credentialSource: "hosted" },
  ];
  const rows = (id: string, unit: string): ProjectBudgetRow[] =>
    (["app", "programmatic"] as const).map((surface) => ({
      ...budgetFixture("0", unit),
      id: `${id}:${unit}:${surface}`,
      kind: "connection",
      display: {
        connectionId: id,
        projectName: "Project · name",
        providerLabel: id === "own" ? "SerpApi" : "DataForSEO",
      },
      traffic: { kind: "surface", surface },
    }));
  data.budgets = [
    budgetFixture(),
    ...rows("own", "units"),
    ...rows("own", "customer_cents"),
    ...rows("managed", "customer_cents"),
    ...rows("managed", "cents"),
  ];
  return data;
}
it("places the project first and renders one provider entry under its active source only", () => {
  const { container } = render(
    <ProviderBudgetLists data={fixture()} hostedBudgetLabels={labels} />,
  );
  const own = screen.getByRole("region", { name: "Your own keys (BYOK)" });
  const managed = screen.getByRole("region", { name: labels.title });
  expect(within(own).getByRole("heading", { name: "SerpApi" })).toBeInTheDocument();
  expect(within(own).queryByText("DataForSEO")).toBeNull();
  expect(within(managed).getByRole("heading", { name: "DataForSEO" })).toBeInTheDocument();
  expect(within(managed).queryByText("SerpApi")).toBeNull();
  expect(container.querySelectorAll("[data-provider-budget]")).toHaveLength(2);
  expect(container.querySelectorAll("[data-budget-row]")).toHaveLength(5);
  expect(container.querySelector("section")).toHaveAccessibleName("Project budget");
  expect(
    container.querySelectorAll(
      "[data-budget-row*='own:customer_cents'], [data-budget-row*='managed:cents']",
    ),
  ).toHaveLength(0);
});
it("moves a provider after a source switch and never adds old and new source counters", () => {
  const data = fixture();
  data.connections[0].credentialSource = "hosted";
  render(<ProviderBudgetLists data={data} hostedBudgetLabels={labels} />);
  expect(
    within(screen.getByRole("region", { name: "Your own keys (BYOK)" })).queryByText("SerpApi"),
  ).toBeNull();
  const managed = screen.getByRole("region", { name: labels.title });
  expect(managed.querySelectorAll("[data-provider-budget]")).toHaveLength(2);
  expect(managed.querySelectorAll("[data-budget-row*=':units:']")).toHaveLength(0);
});
it("keeps fixed visible columns for unlimited and missing surface budgets", () => {
  const data = fixture();
  data.budgets = data.budgets.map((row) =>
    row.kind === "group"
      ? row
      : {
          ...row,
          limit: "unlimited",
          remaining: "unlimited",
          ...(row.unit === "customer_cents"
            ? { used: "unavailable", reserved: "unavailable", level: "unavailable" }
            : {}),
        },
  );
  const { container } = render(<ProviderBudgetLists data={data} hostedBudgetLabels={labels} />);
  for (const provider of container.querySelectorAll("[data-provider-budget]")) {
    expect(provider.querySelectorAll("dl")).toHaveLength(2);
  }
  expect(
    within(screen.getByRole("region", { name: labels.title })).getAllByText("Unavailable"),
  ).toHaveLength(2);
});
it("keeps twenty providers as a divided list and preserves separate surface meters", () => {
  const data = fixture();
  data.connections = Array.from({ length: 20 }, (_, i) => ({
    connectionId: `provider-${i}`,
    provider: `Provider ${i}`,
    credentialSource: "own",
  }));
  data.budgets = data.connections.flatMap((connection) =>
    (["app", "programmatic"] as const).map((surface) => ({
      ...budgetFixture(),
      id: `${connection.connectionId}:${surface}`,
      kind: "connection" as const,
      display: {
        connectionId: connection.connectionId,
        projectName: "Project",
        providerLabel: connection.provider,
      },
      traffic: { kind: "surface" as const, surface },
    })),
  );
  const { container } = render(<ProviderBudgetLists data={data} />);
  expect(container.querySelectorAll("[data-provider-budget]")).toHaveLength(20);
  expect(container.querySelectorAll("[data-budget-row]")).toHaveLength(40);
  expect(container.querySelectorAll("[data-slot='card']")).toHaveLength(0);
});
it("does not match providers by parsing compound project display labels", () => {
  const data = fixture();
  data.budgets[1].target = "Other provider · SerpApi · Project";
  data.budgets[1].display = {
    ...data.budgets[1].display,
    projectName: "Project",
    providerLabel: "A · name",
  };
  const { container } = render(<ProviderBudgetLists data={data} hostedBudgetLabels={labels} />);
  expect(container.querySelector('[data-provider-budget="own"] [data-budget-row]')).toHaveAttribute(
    "data-budget-row",
    "own:units:app",
  );
});

it("uses a neutral line when every project amount is unavailable", () => {
  const data = fixture();
  data.budgets[0] = {
    ...data.budgets[0],
    used: "unavailable",
    reserved: "unavailable",
    remaining: "unavailable",
    limit: "unavailable",
    level: "unavailable",
  };
  render(<ProviderBudgetLists data={data} />);
  const project = screen.getByRole("region", { name: "Project budget" });
  expect(project.querySelector("dl")).not.toBeNull();
  expect(within(project).getAllByLabelText("Unavailable")).toHaveLength(4);
});
