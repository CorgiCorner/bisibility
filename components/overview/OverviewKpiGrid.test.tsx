import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OverviewKpiGrid } from "./OverviewKpiGrid";
import { overviewFixture } from "./overview-fixtures";

vi.mock("next-intl", () => ({
  useFormatter: () => ({ number: (value: number) => String(value) }),
  useTranslations: () => (key: string) => key,
}));

function containerAncestor(element: Element | null) {
  let parent = element?.parentElement ?? null;
  while (parent) {
    if (parent.className.includes("@container")) return parent;
    parent = parent.parentElement;
  }
  return null;
}

describe("OverviewKpiGrid", () => {
  it("applies column queries to a grid inside a container ancestor", () => {
    render(
      <OverviewKpiGrid
        kpis={[
          {
            id: "trackedKeywords",
            value: 2,
            delta: { kind: "awaitingFirstCheck" },
            deltaTone: "neutral",
          },
        ]}
        projectRef="prj_test"
        qualityReport={overviewFixture.qualityReport}
        visibilityCoverage={overviewFixture.visibilityCoverage}
      />,
    );
    const region = screen.getByRole("region", { name: "kpisAriaLabel" });
    const grid = region.querySelector("[class*='@[360px]:grid-cols-2']");
    expect(grid).not.toBeNull();
    expect(containerAncestor(grid)).not.toBeNull();
    expect(grid?.className).toContain("@[720px]:grid-cols-4");
    expect(grid?.className).not.toContain("lg:grid-cols");
    expect(grid?.className).not.toContain("@container");
    expect(screen.getByText("trackedKeywords").className).not.toContain("truncate");
  });
});
