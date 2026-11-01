import { renderWithUsageSettingsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { ProjectBudgetRow } from "@/lib/metering/project-budget-display";
import { budgetFixture, projectUsageFixture } from "@/lib/metering/shared-view-fixtures";
import { emptyProjectUsage } from "@/lib/metering/user-views";
import { fireEvent, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ProviderUsageCard } from "./ProviderUsageCard";

vi.mock("@usagekit/react", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useProviderAction: () => ({ canReconcile: true }),
}));
vi.mock("./BudgetEditModal", () => ({
  BudgetEditModal: ({
    connections,
    surface,
  }: {
    connections: readonly { connectionId: string }[];
    surface?: string;
  }) => (
    <div>
      Open budget editor {connections.map((item) => item.connectionId).join(",")} {surface ?? "all"}
    </div>
  ),
}));

function connectionRow(
  used: string,
  surface: "app" | "programmatic" = "app",
  unit = "units",
): ProjectBudgetRow {
  return {
    ...budgetFixture(used, unit),
    id: `conn_example:${surface}:${unit}`,
    kind: "connection",
    target: "conn_example",
    traffic: { kind: "surface", surface },
    display: { connectionId: "conn_example", providerLabel: "DataForSEO", projectName: "Example" },
  };
}

function renderCard(data = projectUsageFixture(), canEditBudget = false) {
  return render(
    <ProviderUsageCard
      projectName="Example"
      projectId="p"
      projectRef="prj_p"
      canEditBudget={canEditBudget}
      data={data}
    />,
  );
}

function limitRow(container: HTMLElement, id: string) {
  const row = container.querySelector<HTMLElement>(`[data-limit-row="${id}"]`);
  if (!row) throw new Error(`Missing limit row ${id}`);
  return row;
}

it("offers a limit for a paid connection without budget rows", () => {
  const data = projectUsageFixture();
  data.budgets = [];
  const { container } = renderCard(data, true);
  const card = container.querySelector<HTMLElement>("[data-project-limits]");
  if (!card) throw new Error("Missing project limits");
  expect(within(card).getByText("No limit")).toBeVisible();
  expect(
    screen.getByText("No provider limit. Spend is capped by your provider account."),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Set limit" }));
  expect(screen.getByText("Open budget editor conn_example app")).toBeVisible();
});
it("does not claim an absent project limit when the read is truncated or redacted", () => {
  for (const evidence of ["truncated", "redacted"] as const) {
    const data = projectUsageFixture();
    data.truncated = evidence === "truncated";
    data.budgets =
      evidence === "redacted" ? [{ ...budgetFixture("0", "budget_cents"), redacted: true }] : [];
    const view = renderCard(data);
    const card = view.container.querySelector<HTMLElement>("[data-project-limits]");
    if (!card) throw new Error("Missing project limits");
    expect(
      within(card).getByText("Limits are unavailable right now. Try again in a moment."),
    ).toBeVisible();
    view.unmount();
  }
});
it("pages and searches paid connections on self-host", () => {
  const data = projectUsageFixture();
  data.budgets = [];
  data.connections = Array.from({ length: 15 }, (_, index) => ({
    connectionId: `c${index}`,
    provider: `Sample ${String(index + 1).padStart(2, "0")}`,
    credentialSource: "own" as const,
  }));
  renderCard(data);
  expect(screen.getByText("1-5 of 15")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("6-10 of 15")).toBeVisible();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Sample 15" } });
  expect(screen.getByText("1-1 of 1")).toBeVisible();
  expect(screen.getByText("Sample 15")).toBeVisible();
});
it("leaves free analytics out of paid limits and prioritizes warnings", () => {
  const data = projectUsageFixture();
  data.connections = [
    ...Array.from({ length: 6 }, (_, index) => ({
      connectionId: `sample${index}`,
      provider: `Sample ${index}`,
      credentialSource: "own" as const,
    })),
    { connectionId: "alert", provider: "SerpApi", credentialSource: "own" },
    { connectionId: "free", provider: "gsc", credentialSource: "own" },
  ];
  const warning = connectionRow("90");
  data.budgets = [
    {
      ...warning,
      id: "alert:app",
      target: "alert",
      level: "warning",
      display: { connectionId: "alert", providerLabel: "SerpApi", projectName: "Example" },
    },
  ];
  renderCard(data);
  expect(screen.getByRole("heading", { name: "SerpApi" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "gsc" })).toBeNull();
  expect(screen.getByText("1-5 of 7")).toBeVisible();
});
it("preserves the initial budget editor and omits invented requests or projections", () => {
  render(
    <ProviderUsageCard
      projectName="Example"
      projectId="prj_1"
      projectRef="prj_1"
      canEditBudget
      initialBudgetEditOpen
      data={emptyProjectUsage()}
    />,
  );
  expect(screen.getByText(/Open budget editor/)).toBeInTheDocument();
  expect(screen.queryByText("Projected spend")).not.toBeInTheDocument();
  expect(screen.queryByText("Provider requests")).not.toBeInTheDocument();
});
it("fences the budget editor for a read-only project", () => {
  render(
    <ProviderUsageCard
      projectName="Example"
      projectId="prj_1"
      projectRef="prj_1"
      canEditBudget={false}
      initialBudgetEditOpen
      data={emptyProjectUsage()}
    />,
  );
  expect(screen.queryByText(/Open budget editor/)).not.toBeInTheDocument();
});
it("does not label unavailable accounting as within budget", () => {
  renderCard(emptyProjectUsage());
  expect(screen.queryByText("Within budget")).not.toBeInTheDocument();
  expect(
    screen.getByText("Limits are unavailable right now. Try again in a moment."),
  ).toBeVisible();
});

it("shows the your-keys project limit and leaves internal gates out", () => {
  const data = projectUsageFixture();
  data.budgets = [
    { ...budgetFixture("36", "paid_attempts"), id: "paid-attempts", limit: "unlimited" },
    { ...budgetFixture("0.39", "budget_cents"), id: "own-limit" },
  ];
  const { container } = renderCard(data);
  const card = container.querySelector<HTMLElement>("[data-project-limits]");
  if (!card) throw new Error("Missing project limits");
  expect(within(card).getByText("Project limit")).toBeVisible();
  expect(within(card).getByText("Your keys")).toBeVisible();
  expect(card.textContent).toMatch(/of/);
  expect(container).not.toHaveTextContent("Paid attempts");
});

it("gives each traffic limit its own row with used, limit and what is left", () => {
  const data = projectUsageFixture();
  data.budgets = [connectionRow("62"), connectionRow("0", "programmatic")];
  const { container } = renderCard(data);
  expect(screen.getByRole("heading", { name: "DataForSEO" })).toBeVisible();
  const app = limitRow(container, "conn_example:app:units");
  expect(app).toHaveTextContent("App and schedules");
  expect(app.textContent).toMatch(/62 of 100/);
  expect(app.textContent).toMatch(/38 .* left/);
  const api = limitRow(container, "conn_example:programmatic:units");
  expect(api).toHaveTextContent("API and agents");
  expect(api.textContent).toMatch(/0 of 100/);
});
it.each(["unknown", "unavailable"] as const)("never shows a %s amount as zero", (state) => {
  const data = projectUsageFixture();
  const row = connectionRow("0");
  row.used = state === "unknown" ? { text: "", unit: "units", certainty: "unknown" } : state;
  data.budgets = [row];
  const { container } = renderCard(data);
  const rendered = limitRow(container, row.id);
  expect(rendered.textContent).toMatch(/Unknown of 100/);
});
it("keeps redacted figures out of the provider rows", () => {
  const data = projectUsageFixture();
  data.budgets = [{ ...connectionRow("62"), redacted: true }];
  const { container } = renderCard(data);
  expect(container.querySelector("[data-limit-row]")).toBeNull();
  expect(container).not.toHaveTextContent("62");
});
it.each(["ok", "warning", "exceeded"] as const)(
  "derives attention only from Meter %s rows",
  (level) => {
    const data = projectUsageFixture();
    data.budgets[0].level = level;
    renderCard(data);
    const link = screen.queryByRole("link", { name: "Connection settings" });
    if (level === "ok") expect(link).toBeNull();
    else expect(link).toHaveAttribute("href", "/app/prj_p/providers");
  },
);
it.each(["unknown", "unavailable", "redacted"])(
  "does not claim healthy budgets for %s evidence",
  (state) => {
    const data = projectUsageFixture();
    if (state === "unknown")
      data.budgets[0].used = { text: "", unit: "units", certainty: "unknown" };
    if (state === "unavailable") data.budgets[0].used = "unavailable";
    if (state === "redacted") data.budgets[0].redacted = true;
    renderCard(data);
    expect(screen.queryByText("Within budget")).toBeNull();
  },
);
it.each([true, false])("preserves the 99% bound with unlimited first=%s", (first) => {
  const data = projectUsageFixture();
  const unlimited = { ...connectionRow("0", "programmatic"), limit: "unlimited" as const };
  const tight = { ...connectionRow("99"), level: "warning" as const };
  data.budgets = first ? [unlimited, tight] : [tight, unlimited];
  const { container } = renderCard(data);
  expect(limitRow(container, tight.id).textContent).toMatch(/99 of 100/);
  expect(limitRow(container, tight.id)).toHaveTextContent("Near limit");
  expect(limitRow(container, unlimited.id)).toHaveTextContent("No limit");
});
it("names the provider without parsing project names out of targets", () => {
  const data = projectUsageFixture();
  data.budgets = [
    {
      ...connectionRow("0", "app", "budget_cents"),
      target: "DataForSEO · Synthetic · local preview",
      display: {
        connectionId: "conn_example",
        providerLabel: "DataForSEO",
        projectName: "Synthetic · local preview",
      },
    },
  ];
  renderCard(data);
  expect(screen.getByRole("heading", { name: "DataForSEO" })).toBeInTheDocument();
  expect(screen.queryByText("Synthetic · local preview")).toBeNull();
  expect(screen.queryByText("DataForSEO · Synthetic · local preview")).toBeNull();
});
it("marks a reached limit and keeps the blocked notice visible", () => {
  const data = projectUsageFixture();
  data.budgets = [{ ...connectionRow("100"), level: "exceeded" }];
  const { container } = renderCard(data);
  expect(limitRow(container, data.budgets[0].id)).toHaveTextContent("Limit reached");
  expect(screen.getByRole("alert")).toHaveTextContent("DataForSEO");
  expect(screen.getByRole("alert")).not.toHaveTextContent("conn_example");
});
it("does not turn an estimate into a proven lower bound", () => {
  const data = projectUsageFixture();
  const row = connectionRow("0");
  row.used = { text: "12", unit: "units", certainty: "estimated" };
  data.budgets = [row];
  const { container } = renderCard(data);
  expect(limitRow(container, row.id).textContent).toMatch(/12/);
  expect(limitRow(container, row.id)).not.toHaveTextContent("≥");
});
it("omits hosted connections and Credits limits on self-host", () => {
  const data = projectUsageFixture();
  data.connections[0].credentialSource = "hosted";
  data.budgets = [connectionRow("12.5", "app", "customer_cents")];
  const { container } = renderCard(data);
  expect(container.querySelector('[data-provider-limits="conn_example"]')).toBeNull();
  expect(container.querySelector('[data-limit-row="conn_example:app:customer_cents"]')).toBeNull();
  expect(screen.queryByText("Credits")).toBeNull();
});
it("ignores inactive-source warnings in the visible budget notice", () => {
  const data = projectUsageFixture();
  data.connections[0].credentialSource = "own";
  data.budgets = [
    connectionRow("1", "app", "cents"),
    { ...connectionRow("100", "app", "customer_cents"), level: "exceeded" },
  ];
  renderCard(data);
  expect(screen.queryByRole("alert")).toBeNull();
});
it.each([false, true])(
  "gates set-limit actions by the existing edit capability: %s",
  (canEditBudget) => {
    const data = projectUsageFixture();
    data.budgets = [{ ...connectionRow("0"), limit: "unlimited", remaining: "unlimited" }];
    renderCard(data, canEditBudget);
    const name = "Set App and schedules limit for DataForSEO";
    if (canEditBudget) {
      fireEvent.click(screen.getByRole("button", { name }));
      expect(screen.getByText("Open budget editor conn_example app")).toBeVisible();
    } else {
      expect(screen.getByText(/No limit · Resets/)).toBeVisible();
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  },
);
it("opens the editor for the surface of the edited row", () => {
  const data = projectUsageFixture();
  data.budgets = [connectionRow("10"), connectionRow("20", "programmatic")];
  renderCard(data, true);
  fireEvent.click(screen.getByRole("button", { name: "Edit API and agents limit for DataForSEO" }));
  expect(screen.getByText("Open budget editor conn_example programmatic")).toBeVisible();
});
