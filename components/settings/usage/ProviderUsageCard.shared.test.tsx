import { renderWithUsageSettingsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { budgetFixture, projectUsageFixture } from "@/lib/metering/shared-view-fixtures";
import { emptyProjectUsage } from "@/lib/metering/user-views";
import { screen } from "@testing-library/react";
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
  render(<ProviderUsageCard projectId="p" projectRef="p" canEditBudget={false} data={data} />);
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

it("shows the exact most constrained bound, including reservations, as its headline", () => {
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
  expect(container.querySelector("span.text-2xl")).toHaveTextContent("80 + 10 / 100");
});
it.each(["unknown", "unavailable", "redacted", "zero"])(
  "distinguishes the %s budget headline",
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
    expect(container.querySelector("span.text-2xl")).toHaveTextContent(
      state === "zero"
        ? "0 + 0 / 100"
        : state === "unknown"
          ? "Unknown"
          : state === "redacted"
            ? "figures are hidden"
            : "Unavailable",
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
  expect(view.container.querySelector("span.text-2xl")).toHaveTextContent("62 + 0 / 100");
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

it.each([true, false])("prefers a 99% bound with unlimited first=%s", (first) => {
  const data = projectUsageFixture();
  const unlimited = { ...budgetFixture("0"), id: "unlimited", limit: "unlimited" as const };
  const tight = { ...budgetFixture("99"), id: "tight" };
  data.budgets = first ? [unlimited, tight] : [tight, unlimited];
  const { container } = render(
    <ProviderUsageCard projectId="p" projectRef="prj_p" canEditBudget={false} data={data} />,
  );
  expect(container.querySelector("span.text-2xl")).toHaveTextContent("99 + 0 / 100");
});
