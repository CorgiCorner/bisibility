import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/admin/AdminAccountLookup", () => ({
  AdminAccountLookup: () => <section aria-label="Account lookup" />,
}));

import { AdminAdministration } from "./AdminAdministration";

function points(seed: number) {
  return Array.from({ length: 30 }, (_, index) => ({
    count: seed + index,
    date: `2026-06-${String(index + 1).padStart(2, "0")}`,
  }));
}

const metric = (seed: number) => ({
  delta: seed,
  deltaPercent: seed === 0 ? null : 12.5,
  points: points(seed),
  priorTotal: 100,
  total: 100 + seed,
});

const data = {
  activeAccountsApprox: 42,
  generatedAt: "2026-07-18T00:00:00.000Z",
  growth: {
    keywords: metric(3),
    projects: metric(2),
    rankChecks: metric(4),
    users: metric(1),
  },
  monthStart: "2026-07-01T00:00:00.000Z",
  topConsumption: Array.from({ length: 11 }, (_, index) => ({
    billableUnits: 2_000 - index,
    checks: 1_000 - index,
    projectId: `project_${index + 1}`,
    provider: index % 2 === 0 ? "serpapi" : "dataforseo",
    providerLabel: index % 2 === 0 ? "SerpApi" : "DataForSEO",
    rateBasis: index % 2 === 0 ? "Production plan equivalent" : "Live depth pricing",
    referenceCostCents: 12_345 - index,
    referenceCostKnown: true,
    sharePercent: index === 0 ? 37.5 : 5,
  })),
} as const;

describe("AdminAdministration", () => {
  it("renders four 30-day growth sparklines and the approximate activity label", () => {
    const { container } = render(<AdminAdministration data={data} />);

    for (const label of ["Users", "Projects", "Keywords", "Rank checks"]) {
      const sparkline = screen.getByRole("img", { name: `${label} daily count trend` });
      expect(sparkline).toHaveAttribute("preserveAspectRatio", "none");
    }
    const paths = container.querySelectorAll('svg[aria-label$="daily count trend"] path');
    expect(paths).toHaveLength(4);
    for (const path of paths) {
      expect(path).toHaveAttribute("vector-effect", "non-scaling-stroke");
    }
    expect(screen.getByText("Active accounts (approx.)")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(
      screen.getByText("Distinct accounts with session activity in the last 7 days."),
    ).toHaveClass("mb-0", "mt-auto", "pt-2");
    expect(screen.getAllByText("+12.5% vs prior 30 days")).toHaveLength(4);
  });

  it("renders at most ten project/provider rows with reference usage and share bars", () => {
    render(<AdminAdministration data={data} />);

    const table = screen.getByRole("table", {
      name: "Top project and provider consumption this month",
    });
    expect(within(table).getAllByRole("row")).toHaveLength(11);
    expect(within(table).getByText("project_1")).toBeInTheDocument();
    expect(within(table).queryByText("project_11")).not.toBeInTheDocument();
    expect(within(table).getByText("1,000")).toBeInTheDocument();
    expect(within(table).getByText("2,000")).toBeInTheDocument();
    expect(within(table).getAllByText("SerpApi").length).toBeGreaterThan(0);
    expect(within(table).getAllByText("Production plan equivalent").length).toBeGreaterThan(0);
    expect(within(table).getByText("$123.45")).toBeInTheDocument();
    expect(within(table).getByText("37.5%")).toBeInTheDocument();
    expect(
      within(table).getByRole("img", { name: "37.5% of instance reference cost" }).firstChild,
    ).toHaveStyle({ width: "37.5%" });
  });

  it("renders honest consumption empty state", () => {
    render(<AdminAdministration data={{ ...data, topConsumption: [] }} />);

    expect(screen.getByText("No completed SERP checks recorded this month.")).toHaveClass(
      "text-fg-muted",
    );
  });
});
