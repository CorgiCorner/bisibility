import {
  renderWithCostEstimateMessages as render,
  renderWithFeatureMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { readProjectProviderAccessScope } from "@/lib/queries/provider-access-scope";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BudgetRow } from "@usagekit/views";
import { budgetsViewFromStatuses, headerStatusFromBudgets } from "@usagekit/views";
import { expect, it, vi } from "vitest";
import { HeaderProviderSpend } from "./HeaderProviderSpend";

const permissions = vi.hoisted(() => ({ access: vi.fn(), demo: vi.fn() }));
vi.mock("@/lib/queries/_auth", () => ({ requireReadableProject: permissions.access }));
vi.mock("@/lib/demo/config", () => ({ readDemoConfig: permissions.demo }));

const figure = (text: string) => ({ text, unit: "units", certainty: "measured" as const });
const row: BudgetRow = {
  id: "visible",
  version: 1,
  kind: "group",
  target: "project",
  traffic: { kind: "any" },
  window: "calendar_month",
  unit: "units",
  used: figure("1"),
  reserved: figure("1"),
  remaining: figure("998"),
  limit: figure("1000"),
  boundary: { onExceed: "block" },
  alerts: [],
  bar: null,
  warningAt: null,
  epoch: "month",
  resetsAt: null,
  redacted: false,
  level: "ok",
};
it("keeps mixed budgets in one compact header status with scoped details", async () => {
  const budgets = {
    state: "ok" as const,
    rows: [
      {
        ...row,
        id: "money",
        unit: "cents",
        used: { ...figure("7.4071"), unit: "cents" },
        reserved: { ...figure("0"), unit: "cents" },
        limit: { ...figure("5000"), unit: "cents" },
      },
      {
        ...row,
        id: "requests",
        unit: "requests",
        used: { ...figure("1"), unit: "requests" },
        reserved: { ...figure("0"), unit: "requests" },
        limit: { ...figure("10"), unit: "requests" },
      },
      ...["api", "sdk", "cli"].map((id) => ({
        ...row,
        id,
        level: "unavailable" as const,
        used: "unavailable" as const,
      })),
    ],
    problem: null,
  };
  render(
    <HeaderProviderSpend
      projectRef="prj_example"
      summary={{
        paidWorkBlocked: null,
        eligible: true,
        budgets,
        status: headerStatusFromBudgets(budgets),
      }}
    />,
  );
  expect(screen.getAllByRole("link")).toHaveLength(1);
  expect(screen.getByRole("link")).toHaveTextContent("At least 10% used");
  expect(screen.queryByText("Usage unavailable")).toBeNull();
  await userEvent.tab();
  const tooltip = await screen.findByRole("tooltip");
  expect(tooltip).toHaveTextContent("$0.07");
  expect(tooltip).toHaveTextContent("$50.00");
  expect(tooltip).toHaveTextContent("1 Requests");
  expect(tooltip).not.toHaveTextContent("7.4071");
});
it("renders exact reserved project usage through the shared bound projection and keyboard tooltip", async () => {
  const budgets = { ...budgetsViewFromStatuses([]), state: "ok" as const, rows: [row] };
  render(
    <HeaderProviderSpend
      projectRef="prj_example"
      summary={{
        paidWorkBlocked: null,
        status: headerStatusFromBudgets(budgets),
        budgets,
        eligible: true,
      }}
    />,
  );
  await userEvent.tab();
  expect(screen.getByRole("link")).toHaveFocus();
  expect(screen.getByRole("link")).toHaveTextContent("Less than 1% used");
  const tooltip = await screen.findByRole("tooltip");
  expect(within(tooltip).getByRole("columnheader", { name: "Reserved" })).toBeInTheDocument();
  expect(within(tooltip).getAllByRole("cell", { name: "1 Units" })).toHaveLength(2);
  expect(await screen.findByRole("tooltip")).toBeInTheDocument();
});
it("offers budget editing without a fabricated spend for an unbounded project", () => {
  const budgets = budgetsViewFromStatuses([]);
  render(
    <HeaderProviderSpend
      projectRef="prj_example"
      summary={{
        paidWorkBlocked: null,
        status: headerStatusFromBudgets(budgets),
        budgets,
        eligible: true,
        canEditBudget: true,
      }}
    />,
  );
  expect(screen.getByRole("link")).toHaveAttribute(
    "href",
    "/app/prj_example/integrations?tab=usage&budget=edit",
  );
  expect(screen.getByRole("link")).not.toHaveTextContent("$0");
});

it("links configured project bounds to usage and preserves every denomination", async () => {
  const cents = {
    ...row,
    id: "money",
    unit: "cents",
    used: { text: "0.0001", unit: "cents", certainty: "measured" as const },
    reserved: { ...figure("0"), unit: "cents" },
    limit: { ...figure("1000"), unit: "cents" },
  };
  const budgets = { state: "ok" as const, rows: [row, cents], problem: null };
  render(
    <HeaderProviderSpend
      projectRef="prj_example"
      summary={{
        paidWorkBlocked: null,
        eligible: true,
        budgets,
        status: headerStatusFromBudgets(budgets),
      }}
    />,
  );
  const links = screen.getAllByRole("link");
  expect(links).toHaveLength(1);
  for (const link of links)
    expect(link).toHaveAttribute("href", "/app/prj_example/integrations?tab=usage");
  await userEvent.tab();
  const tooltip = await screen.findByRole("tooltip");
  expect(tooltip).toHaveTextContent("1 Units");
  expect(tooltip).toHaveTextContent("< $0.01");
});
it.each(["unavailable", "forbidden"] as const)(
  "keeps %s accounting separate from no configured budget",
  (state) => {
    const budgets = { state, rows: [], problem: null };
    const view = render(
      <HeaderProviderSpend
        projectRef="prj_example"
        summary={{
          paidWorkBlocked: null,
          eligible: false,
          budgets,
          status: headerStatusFromBudgets(budgets),
        }}
      />,
    );
    if (state === "forbidden") {
      expect(screen.queryByRole("status")).toBeNull();
      expect(view.container).toBeEmptyDOMElement();
    } else expect(screen.getByRole("status")).toHaveTextContent("unavailable");
    expect(screen.queryByRole("link")).toBeNull();
  },
);
it("hides the header when no provider is eligible", () => {
  const budgets = budgetsViewFromStatuses([]);
  const { container } = render(
    <HeaderProviderSpend
      projectRef="prj_example"
      summary={{
        paidWorkBlocked: null,
        eligible: false,
        budgets,
        status: headerStatusFromBudgets(budgets),
      }}
    />,
  );
  expect(container).toBeEmptyDOMElement();
});
it("redacts bound figures and keeps snapshot failure unavailable", () => {
  const budgets = {
    state: "ok" as const,
    rows: [{ ...row, redacted: true, level: "unavailable" as const }],
    problem: null,
  };
  const view = render(
    <HeaderProviderSpend
      projectRef="prj_example"
      summary={{
        paidWorkBlocked: null,
        eligible: true,
        budgets,
        status: headerStatusFromBudgets(budgets),
      }}
    />,
  );
  expect(screen.getByRole("link")).not.toHaveTextContent("998");
  view.rerender(<HeaderProviderSpend projectRef="prj_example" summary={null} />);
  expect(screen.getByRole("status")).toHaveTextContent("unavailable");
});
it("never rounds a partial lower bound upward", async () => {
  const budgets = {
    state: "ok" as const,
    rows: [
      {
        ...row,
        used: { text: "1.01999", unit: "units", certainty: "estimated" as const },
        reserved: figure("0"),
      },
    ],
    problem: null,
  };
  const { container } = render(
    <HeaderProviderSpend
      projectRef="prj_example"
      summary={{
        paidWorkBlocked: null,
        eligible: true,
        budgets,
        status: headerStatusFromBudgets(budgets),
      }}
    />,
  );
  expect(screen.getByRole("link")).toHaveTextContent("At least some usage");
  await userEvent.tab();
  const tooltip = await screen.findByRole("tooltip");
  expect(tooltip).toHaveTextContent("≈ 1 Units");
  expect(tooltip).not.toHaveTextContent("1.02");
  expect(container.querySelector('[data-usagekit="usage-cap-pill"]')).toHaveAttribute(
    "data-coverage",
    "partial",
  );
});

it("gives the no-budget header link its Polish accessible name", async () => {
  const shared = (await import("@/messages/core/pl/shared.json")).default;
  const cost = (await import("@/messages/core/pl/project-cost-estimate.json")).default;
  const budgets = budgetsViewFromStatuses([]);
  renderWithFeatureMessages(
    <HeaderProviderSpend
      projectRef="prj_example"
      summary={{
        paidWorkBlocked: null,
        eligible: true,
        canEditBudget: true,
        budgets,
        status: headerStatusFromBudgets(budgets),
      }}
    />,
    { locale: "pl", messages: { ...shared, ...cost } },
  );
  expect(screen.getByRole("link", { name: "Brak budżetu, ustaw go" })).toHaveAttribute(
    "href",
    "/app/prj_example/integrations?tab=usage&budget=edit",
  );
});

it.each([
  { level: "ok" as const, used: "0", expected: "Usage unknown" },
  { level: "exceeded" as const, used: "1500", expected: "Budget exceeded" },
])("keeps $expected visible beside unavailable budgets", ({ level, used, expected }) => {
  const budgets = {
    state: "ok" as const,
    rows: [
      { ...row, level, used: figure(used), reserved: figure("0") },
      { ...row, id: "unknown", level: "unavailable" as const, used: "unavailable" as const },
    ],
    problem: null,
  };
  render(
    <HeaderProviderSpend
      projectRef="prj_example"
      summary={{
        paidWorkBlocked: null,
        eligible: true,
        budgets,
        status: headerStatusFromBudgets(budgets),
      }}
    />,
  );
  expect(screen.getAllByRole("link")).toHaveLength(1);
  expect(screen.getByRole("link")).toHaveTextContent(expected);
  expect(screen.getByRole("link")).not.toHaveTextContent("0% used");
});

it("labels a fully known unlimited budget without inventing unknown usage", () => {
  const budgets = {
    state: "ok" as const,
    rows: [{ ...row, limit: "unlimited" as const }],
    problem: null,
  };
  render(
    <HeaderProviderSpend
      projectRef="prj_example"
      summary={{
        paidWorkBlocked: false,
        eligible: true,
        budgets,
        status: headerStatusFromBudgets(budgets),
      }}
    />,
  );
  expect(screen.getByRole("link")).toHaveTextContent("No limit");
});
it("keeps unavailable scoped budgets reachable without leaking redacted figures", async () => {
  const budgets = {
    state: "ok" as const,
    rows: [{ ...row, redacted: true, level: "unavailable" as const }],
    problem: null,
  };
  render(
    <HeaderProviderSpend
      projectRef="prj_example"
      summary={{
        paidWorkBlocked: null,
        eligible: true,
        budgets,
        status: headerStatusFromBudgets(budgets),
      }}
    />,
  );
  expect(screen.getByRole("link")).toHaveAttribute(
    "href",
    "/app/prj_example/integrations?tab=usage",
  );
  await userEvent.tab();
  expect(await screen.findByRole("tooltip")).not.toHaveTextContent("998");
});

it("does not treat unknown unlimited usage as fully known", () => {
  const budgets = {
    state: "ok" as const,
    rows: [{ ...row, limit: "unlimited" as const, used: "unavailable" as const }],
    problem: null,
  };
  render(
    <HeaderProviderSpend
      projectRef="prj_example"
      summary={{
        paidWorkBlocked: null,
        eligible: true,
        budgets,
        status: headerStatusFromBudgets(budgets),
      }}
    />,
  );
  expect(screen.getByRole("link")).toHaveTextContent("Usage unknown");
});

it("distinguishes app and programmatic traffic within their own provider budget rows", async () => {
  const budgets = {
    state: "ok" as const,
    problem: null,
    rows: [
      { ...row, id: "app", traffic: { kind: "surface" as const, surface: "app" as const } },
      {
        ...row,
        id: "agents",
        traffic: { kind: "surface" as const, surface: "programmatic" as const },
      },
    ],
  };
  render(
    <HeaderProviderSpend
      projectRef="prj_example"
      summary={{
        eligible: true,
        paidWorkBlocked: false,
        budgets,
        status: headerStatusFromBudgets(budgets),
      }}
    />,
  );
  await userEvent.tab();
  const tooltip = await screen.findByRole("tooltip");
  const app = within(tooltip).getByRole("row", { name: /App and schedules/ });
  const agents = within(tooltip).getByRole("row", { name: /API and agents/ });
  expect(app).not.toHaveTextContent("API and agents");
  expect(agents).not.toHaveTextContent("App and schedules");
  expect(within(app).getByRole("cell", { name: "1,000 Units / month" })).toBeInTheDocument();
  expect(within(agents).getByRole("cell", { name: "1,000 Units / month" })).toBeInTheDocument();
});

it("keeps no-limit viewer chrome informational without a budget-edit action", () => {
  const budgets = budgetsViewFromStatuses([]);
  render(
    <HeaderProviderSpend
      projectRef="prj_example"
      summary={{
        paidWorkBlocked: null,
        eligible: true,
        canEditBudget: false,
        budgets,
        status: headerStatusFromBudgets(budgets),
      }}
    />,
  );
  expect(screen.getByText("No limit")).toBeInTheDocument();
  expect(screen.queryByRole("link")).toBeNull();
});

it.each(
  ["disabled", "editable", "legacy-read-only"].flatMap((kind) =>
    ["owner", "viewer"].map((role) => ({ kind, role })),
  ),
)("keeps unlimited tooltip permissions for $kind / $role", async ({ kind, role }) => {
  permissions.demo.mockReturnValue({ kind });
  permissions.access.mockResolvedValue({
    actor: { id: "actor", memberships: [{ projectId: "project", role }] },
    project: { id: "project", publicId: "prj_example", writeMode: "active" },
  });
  const { scope } = await readProjectProviderAccessScope("prj_example");
  const budgets = {
    state: "ok" as const,
    problem: null,
    rows: [{ ...row, limit: "unlimited" as const, remaining: "unavailable" as const }],
  };
  render(
    <HeaderProviderSpend
      projectRef="prj_example"
      summary={{
        eligible: true,
        paidWorkBlocked: false,
        canEditBudget: scope.canManageProviders,
        budgets,
        status: headerStatusFromBudgets(budgets),
      }}
    />,
  );
  expect(
    screen.getByRole("link", { name: "Budget usage: No limit. View details" }),
  ).toHaveAttribute("href", "/app/prj_example/integrations?tab=usage");
  await userEvent.tab();
  const tooltip = await screen.findByRole("tooltip");
  if (kind === "disabled" && role === "owner") {
    expect(within(tooltip).getByRole("link", { name: "Set limit" })).toHaveAttribute(
      "href",
      "/app/prj_example/integrations?tab=usage&budget=edit",
    );
  } else {
    expect(within(tooltip).getByText("No limit")).toBeVisible();
    expect(within(tooltip).queryByRole("link")).toBeNull();
    expect(within(tooltip).queryByText("Set limit")).toBeNull();
  }
});
