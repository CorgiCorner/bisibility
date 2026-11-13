import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { sharedControlTestMessages } from "@/i18n/test-support/feature-test-messages";
import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import type { CostRow } from "@/lib/cost-items/present";
import costs from "@/messages/core/en/project-usage-costs.json";
import { describe, expect, it } from "vitest";
import { CostSubscriptions } from "./CostSubscriptions";

const messages = mergeMessageCatalogs(sharedControlTestMessages, costs);

function row(name: string, domain: string, share = 100): CostRow {
  return {
    amountMinor: 100,
    billing: "monthly",
    catalogKey: domain,
    currency: "USD",
    endedOn: null,
    id: `cst_${domain.replaceAll(".", "")}`,
    itemMonthlyMinor: share === 100 ? 100 : 9_900,
    kind: "seo_tool",
    logoDomain: domain,
    name,
    note: null,
    planLabel: "Pro",
    priceChanges: [],
    projectShareMinor: share === 100 ? 100 : 4_950,
    projects: [],
    split: share === 100 ? "single_project" : "percent",
    startedOn: "2026-01-01",
  };
}

describe("cost subscriptions", () => {
  it("stretches row rules and skips a shared tool glyph", () => {
    const view = renderWithFeatureMessages(
      <CostSubscriptions
        canEdit={false}
        onAdd={() => undefined}
        onDelete={() => undefined}
        onEdit={() => undefined}
        onEnd={() => undefined}
        rows={[
          row("Ahrefs", "ahrefs.com"),
          row("Semrush", "semrush.com"),
          row("Surfer", "surferseo.com"),
        ]}
      />,
      { messages },
    );
    expect(view.getByText("Ahrefs")).toBeTruthy();
    expect(view.getByText("Semrush")).toBeTruthy();
    expect(view.getByText("Surfer")).toBeTruthy();
    expect(view.queryByRole("img")).toBeNull();
    const item = view.container.querySelector("[data-column-id='item']");
    expect(item).toHaveStyle({ flexGrow: "1" });
    expect(view.queryByRole("columnheader", { name: "This project's share" })).toBeNull();
    expect(view.getByRole("columnheader", { name: "Monthly cost" })).toBeTruthy();
    expect(view.queryByText("Split")).toBeNull();
  });

  it("shows a partial share beside the monthly cost and keeps the header wide", () => {
    const view = renderWithFeatureMessages(
      <CostSubscriptions
        canEdit={false}
        onAdd={() => undefined}
        onDelete={() => undefined}
        onEdit={() => undefined}
        onEnd={() => undefined}
        rows={[row("Ahrefs", "ahrefs.com", 50)]}
      />,
      { messages },
    );
    expect(view.getByText("$49.50")).toBeTruthy();
    expect(view.getByText(/50%/)).toBeTruthy();
    expect(
      view.getByRole("table", { name: "Subscriptions" }).style.getPropertyValue("--dt-col-project"),
    ).toBe("196px");
  });

  it("replaces an empty table with an empty state", () => {
    const view = renderWithFeatureMessages(
      <CostSubscriptions
        canEdit
        onAdd={() => undefined}
        onDelete={() => undefined}
        onEdit={() => undefined}
        onEnd={() => undefined}
        rows={[]}
      />,
      { messages },
    );
    expect(view.getByText("Track what SEO costs you")).toBeTruthy();
    expect(view.getByRole("button", { name: "Add a cost" })).toBeTruthy();
    expect(view.queryByRole("table")).toBeNull();
  });
});
