import { renderWithUsageSettingsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { ProjectBudgetRow } from "@/lib/metering/project-budget-display";
import { budgetFixture, projectUsageFixture } from "@/lib/metering/shared-view-fixtures";
import { expect, it, vi } from "vitest";
import { ProviderUsageCard } from "./ProviderUsageCard";

vi.mock("@usagekit/react", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useProviderAction: () => ({ canReconcile: true }),
}));

type Certainty = "measured" | "estimated";

function row(
  provider: "serpapi" | "dataforseo",
  surface: "app" | "programmatic",
  used: string,
  limit: string,
  certainty: Certainty = "measured",
): ProjectBudgetRow {
  const unit = provider === "serpapi" ? "units" : "cents";
  const amount = (text: string) => ({ text, unit, certainty });
  return {
    ...budgetFixture(used, unit),
    id: `conn_${provider}:${surface}`,
    kind: "connection",
    target: `conn_${provider}`,
    traffic: { kind: "surface", surface },
    used: amount(used),
    limit: { text: limit, unit, certainty: "measured" },
    remaining: amount(String(Number(limit) - Number(used))),
    bar: {
      used: String((Number(used) / Number(limit)) * 100),
      reserved: "0",
      limit: "100",
      hardLimit: null,
      alerts: [],
    },
    display: { connectionId: `conn_${provider}`, providerLabel: provider, projectName: "Example" },
  };
}

function renderRows(rows: ProjectBudgetRow[]) {
  const data = projectUsageFixture();
  data.connections = [
    { connectionId: "conn_serpapi", provider: "serpapi", credentialSource: "own" },
    { connectionId: "conn_dataforseo", provider: "dataforseo", credentialSource: "own" },
  ];
  data.budgets = rows;
  const { container } = render(
    <ProviderUsageCard
      projectName="Example"
      projectId="p"
      projectRef="prj_p"
      canEditBudget={false}
      data={data}
    />,
  );
  return (id: string) => {
    const element = container.querySelector<HTMLElement>(`[data-limit-row="${id}"]`);
    if (!element) throw new Error(`Missing limit row ${id}`);
    return element;
  };
}

it("shows zero on a surface with no activity this month", () => {
  const limit = renderRows([
    row("serpapi", "app", "13", "245"),
    row("serpapi", "programmatic", "0", "245"),
  ]);
  const api = limit("conn_serpapi:programmatic");
  expect(api.textContent).toMatch(/0 of 245 searches/);
  expect(api).not.toHaveTextContent("Unknown");
  expect(api).not.toHaveTextContent("Some readings unavailable");
});

it("shows an estimate as approximate, never as unknown or a lower bound", () => {
  const limit = renderRows([row("dataforseo", "app", "26", "48", "estimated")]);
  const app = limit("conn_dataforseo:app");
  expect(app.textContent).toMatch(/≈ \$0\.26 of \$0\.48 · estimated/);
  expect(app.textContent).toMatch(/≈ \$0\.22 left/);
  expect(app).not.toHaveTextContent("Unknown");
  expect(app).not.toHaveTextContent("≥");
  expect(app).toHaveAttribute("data-limit-estimated", "true");
  expect(app.querySelector('[role="meter"]')).toHaveClass("opacity-50");
});

it("keeps Unknown and the unavailable notice only for a genuine read failure", () => {
  const failed: ProjectBudgetRow = {
    ...row("dataforseo", "app", "26", "48"),
    used: "unavailable",
    reserved: "unavailable",
    remaining: "unavailable",
    bar: null,
    level: "unavailable",
  };
  const app = renderRows([failed])("conn_dataforseo:app");
  expect(app.textContent).toMatch(/Unknown of \$0\.48/);
  expect(app).toHaveTextContent("Some readings unavailable");
  expect(app).not.toHaveTextContent("estimated");
  expect(app.textContent).not.toMatch(/\$0\.00 of/);
});
