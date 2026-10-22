import { renderWithUsageSettingsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { budgetFixture, projectUsageFixture } from "@/lib/metering/shared-view-fixtures";
import { emptyProjectUsage } from "@/lib/metering/user-views";
import { fireEvent, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ProviderUsageCard } from "./ProviderUsageCard";

vi.mock("@usagekit/react", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useProviderAction: () => ({ canReconcile: true }),
}));
vi.mock("./BudgetEditModal", () => ({ BudgetEditModal: () => <div>Open budget editor</div> }));
it("does not claim a healthy bound when no budgets apply", () => {
  const data = projectUsageFixture();
  data.budgets = [];
  render(<ProviderUsageCard projectId="p" projectRef="prj_p" canEditBudget={false} data={data} />);
  expect(screen.queryByText("Within budget")).toBeNull();
  expect(screen.getAllByText("No budgets apply.").length).toBeGreaterThan(0);
});
it("uses Store views, omits invented requests/projections, and preserves the initial budget editor", () => {
  render(
    <ProviderUsageCard
      projectId="prj_1"
      projectRef="prj_1"
      canEditBudget
      initialBudgetEditOpen
      data={emptyProjectUsage()}
    />,
  );
  expect(screen.getByText("Open budget editor")).toBeInTheDocument();
  expect(screen.queryByText("Projected spend")).not.toBeInTheDocument();
  expect(screen.queryByText("Provider requests")).not.toBeInTheDocument();
});
it("fences the budget editor for a read-only project", () => {
  render(
    <ProviderUsageCard
      projectId="prj_1"
      projectRef="prj_1"
      canEditBudget={false}
      initialBudgetEditOpen
      data={emptyProjectUsage()}
    />,
  );
  expect(screen.queryByText("Open budget editor")).not.toBeInTheDocument();
});
it("does not label unavailable accounting as within budget", () => {
  render(
    <ProviderUsageCard
      projectId="prj_1"
      projectRef="prj_1"
      canEditBudget={false}
      data={emptyProjectUsage()}
    />,
  );
  expect(screen.queryByText("Within budget")).not.toBeInTheDocument();
});

it("shows each budget with explicit used, reserved and limit labels", () => {
  const data = projectUsageFixture();
  data.budgets = [
    budgetFixture("0"),
    {
      ...budgetFixture("80"),
      id: "tight",
      reserved: { text: "10", unit: "units", certainty: "measured" },
    },
  ];
  const { container } = render(
    <ProviderUsageCard projectId="p" projectRef="prj_p" canEditBudget={false} data={data} />,
  );
  const row = container.querySelector<HTMLElement>('[data-budget-row="tight"]');
  if (!row) throw new Error("Missing tight budget");
  expect(within(row).getByText("Used").nextElementSibling).toHaveTextContent("80");
  expect(within(row).getByText("Reserved").closest("dt")?.nextElementSibling).toHaveTextContent(
    "10",
  );
  expect(within(row).getByText("Limit").nextElementSibling).toHaveTextContent("100");
  expect(container.querySelector(".text-2xl")).toBeNull();
});
it.each(["unknown", "unavailable", "redacted", "zero"])(
  "distinguishes the %s budget amount",
  (state) => {
    const data = projectUsageFixture();
    const row = budgetFixture("0");
    if (state === "unknown") row.used = { text: "", unit: "units", certainty: "unknown" };
    if (state === "unavailable") row.used = "unavailable";
    if (state === "redacted") row.redacted = true;
    data.budgets = [row];
    const { container } = render(
      <ProviderUsageCard projectId="p" projectRef="prj_p" canEditBudget={false} data={data} />,
    );
    const renderedRow = container.querySelector<HTMLElement>("[data-budget-row]");
    if (!renderedRow) throw new Error("Missing rendered budget");
    const value =
      state === "redacted" ? renderedRow : within(renderedRow).getByText("Used").nextElementSibling;
    expect(value).toHaveTextContent(
      state === "zero"
        ? "0"
        : state === "unknown"
          ? "—"
          : state === "redacted"
            ? "figures are hidden"
            : "—",
    );
  },
);
it.each(["ok", "warning", "exceeded"] as const)(
  "derives attention only from Meter %s rows",
  (level) => {
    const data = projectUsageFixture();
    data.budgets[0].level = level;
    render(
      <ProviderUsageCard projectId="p" projectRef="prj_p" canEditBudget={false} data={data} />,
    );
    const link = screen.queryByRole("link", { name: "Connection settings" });
    if (level === "ok") expect(link).toBeNull();
    else expect(link).toHaveAttribute("href", "/app/prj_p/integrations");
  },
);
it("retains budget evidence after a connection is deleted and accepts soft bounds", () => {
  const data = projectUsageFixture();
  data.connections = [];
  data.budgets[0].boundary = {
    onExceed: "allow",
    hardLimit: { text: "200", unit: "units", certainty: "measured" },
  };
  const view = render(
    <ProviderUsageCard projectId="p" projectRef="prj_p" canEditBudget={false} data={data} />,
  );
  expect(screen.getByText("Used").nextElementSibling).toHaveTextContent("62");
  expect(screen.getByText("Limit").nextElementSibling).toHaveTextContent("100");
  expect(screen.getByText("Hard limit:", { exact: false })).toHaveTextContent("200");
  expect(
    view.container
      .querySelector<HTMLElement>("[data-usage-track]")
      ?.style.getPropertyValue("--usage-fill"),
  ).toBe("31%");
  const hard = structuredClone(data);
  hard.budgets[0].boundary = { onExceed: "block" };
  view.rerender(
    <ProviderUsageCard projectId="p" projectRef="prj_p" canEditBudget={false} data={hard} />,
  );
  expect(
    view.container
      .querySelector<HTMLElement>("[data-usage-track]")
      ?.style.getPropertyValue("--usage-fill"),
  ).toBe("62%");
});

it.each(["unknown", "unavailable", "redacted"])(
  "does not claim healthy budgets for %s evidence",
  (state) => {
    const data = projectUsageFixture();
    if (state === "unknown")
      data.budgets[0].used = { text: "", unit: "units", certainty: "unknown" };
    if (state === "unavailable") data.budgets[0].used = "unavailable";
    if (state === "redacted") data.budgets[0].redacted = true;
    render(
      <ProviderUsageCard projectId="prj_p" projectRef="prj_p" canEditBudget={false} data={data} />,
    );
    expect(screen.queryByText("Within budget")).toBeNull();
  },
);

it.each([true, false])("preserves the 99% bound with unlimited first=%s", (first) => {
  const data = projectUsageFixture();
  const unlimited = { ...budgetFixture("0"), id: "unlimited", limit: "unlimited" as const };
  const tight = { ...budgetFixture("99"), id: "tight" };
  data.budgets = first ? [unlimited, tight] : [tight, unlimited];
  const { container } = render(
    <ProviderUsageCard projectId="p" projectRef="prj_p" canEditBudget={false} data={data} />,
  );
  const row = container.querySelector<HTMLElement>('[data-budget-row="tight"]');
  if (!row) throw new Error("Missing tight budget");
  expect(within(row).getByText("Used").nextElementSibling).toHaveTextContent("99");
  expect(within(row).getByText("Limit").nextElementSibling).toHaveTextContent("100");
});

it("separates provider, project and traffic from figures without parsing project names", () => {
  const data = projectUsageFixture();
  data.budgets[0] = {
    ...budgetFixture("0", "budget_cents"),
    kind: "connection",
    target: "DataForSEO · Synthetic · local preview",
    display: {
      connectionId: "conn_example",
      providerLabel: "DataForSEO",
      projectName: "Synthetic · local preview",
    },
  };
  const { container } = render(
    <ProviderUsageCard projectId="p" projectRef="prj_p" canEditBudget={false} data={data} />,
  );
  expect(screen.getByRole("heading", { name: "DataForSEO" })).toBeInTheDocument();
  expect(screen.queryByText("Synthetic · local preview")).toBeNull();
  expect(screen.getByText("Any traffic")).toBeInTheDocument();
  expect(container.querySelector("[data-provider-budget]")).toHaveTextContent("$0.00");
  expect(screen.queryByText("DataForSEO · Synthetic · local preview")).toBeNull();
  expect(container.querySelectorAll("dl")).toHaveLength(1);
});

it("keeps a confirmed blocked policy visible when one amount is unknown", () => {
  const data = projectUsageFixture();
  data.budgets[0].level = "exceeded";
  data.budgets[0].reserved = { text: "", unit: "units", certainty: "unknown" };
  render(<ProviderUsageCard projectId="p" projectRef="prj_p" canEditBudget={false} data={data} />);
  expect(screen.getByText("Over limit")).toBeInTheDocument();
  expect(screen.getByLabelText("Unknown")).toHaveTextContent("—");
});

it("announces generic estimates without asserting a proven lower bound", () => {
  const data = projectUsageFixture();
  data.budgets[0].used = { text: "12", unit: "units", certainty: "estimated" };
  render(<ProviderUsageCard projectId="p" projectRef="prj_p" canEditBudget={false} data={data} />);
  expect(screen.getByLabelText("Estimated: ≈ 12 Units")).toBeInTheDocument();
  expect(screen.getByText("Estimated")).toBeInTheDocument();
  expect(screen.getByText("Used").nextElementSibling).not.toHaveTextContent("≥");
});

it("shows the credits budget of a hosted connection in the credits list", () => {
  const data = projectUsageFixture();
  data.connections[0].credentialSource = "hosted";
  data.budgets = [
    { ...budgetFixture("1", "cents"), kind: "connection", target: "conn_example" },
    {
      ...budgetFixture("12.5", "customer_cents"),
      id: "credits",
      kind: "connection",
      target: "conn_example",
    },
  ];
  const { container } = render(
    <ProviderUsageCard
      projectId="p"
      projectRef="prj_p"
      canEditBudget={false}
      data={data}
      hostedBudgetLabels={{ title: "Credits", description: "Credits spent" }}
    />,
  );
  expect(screen.getByRole("region", { name: "Credits" })).toBeInTheDocument();
  expect(container.querySelector('[data-budget-row="credits"]')).not.toBeNull();
  expect(container.querySelector('[data-budget-row="public-budget"]')).toBeNull();
});

it("ignores inactive-source warnings in the visible budget notice", () => {
  const data = projectUsageFixture();
  data.connections[0].credentialSource = "own";
  data.budgets = [
    { ...budgetFixture("1", "cents"), kind: "connection", target: "conn_example" },
    {
      ...budgetFixture("100", "customer_cents"),
      id: "inactive",
      kind: "connection",
      target: "conn_example",
      level: "exceeded",
    },
  ];
  render(<ProviderUsageCard projectId="p" projectRef="prj_p" canEditBudget={false} data={data} />);
  expect(screen.queryByRole("alert")).toBeNull();
});

it.each([false, true])(
  "gates unlimited set-limit actions by the existing edit capability: %s",
  (canEditBudget) => {
    const data = projectUsageFixture();
    data.budgets[0] = { ...data.budgets[0], limit: "unlimited", remaining: "unlimited" };
    render(
      <ProviderUsageCard
        projectId="prj_p"
        projectRef="prj_p"
        canEditBudget={canEditBudget}
        data={data}
      />,
    );
    if (canEditBudget) {
      fireEvent.click(screen.getByRole("button", { name: "Set limit" }));
      expect(screen.getByText("Open budget editor")).toBeVisible();
    } else {
      expect(screen.getByText("No limit")).toBeVisible();
      expect(screen.queryByRole("button", { name: "Set limit" })).toBeNull();
    }
  },
);
