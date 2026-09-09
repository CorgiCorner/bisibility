import { DateFormatProvider } from "@/components/dates/DateFormatProvider";
import type { BacklinksRow } from "@/lib/backlinks/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { BacklinksRows } from "./BacklinksTableRows";
import { type BacklinksSlice, groupBacklinksByDomain } from "./backlinks-table-model";

const now = new Date("2026-07-24T12:00:00.000Z");

function fixtureRow(overrides: Partial<BacklinksRow> = {}): BacklinksRow {
  return {
    anchor: "Example page",
    domainAuthority: 40,
    firstSeen: "2026-07-20",
    flags: [],
    linksCount: 1,
    lostAt: null,
    sourceDomain: "community.example.com",
    sourceUrl: "https://community.example.com/mentions/example-page",
    spamScore: 2,
    status: "active",
    targetUrl: "https://example.org/target/example-page",
    ...overrides,
  };
}

const rows = [
  fixtureRow({
    anchor: "Example page discussion",
    domainAuthority: 91,
    sourceUrl: "https://community.example.com/discussions/example-page",
  }),
  ...Array.from({ length: 36 }, (_, index) =>
    fixtureRow({
      anchor: "Example footer link",
      domainAuthority: 41,
      flags: index === 0 ? ["sitewide"] : [],
      linksCount: index === 0 ? 3 : 1,
      sourceDomain: "footer.example.com",
      sourceUrl: `https://footer.example.com/${index === 0 ? "" : `${index}/`}product/example-page`,
      spamScore: 6,
    }),
  ),
];
const groups = groupBacklinksByDomain(rows, now);

function RowsHarness({ slice = "one_per_domain" }: Readonly<{ slice?: BacklinksSlice }>) {
  const [expandedDomains, setExpandedDomains] = useState<ReadonlySet<string>>(() => new Set());
  const [expandedRuns, setExpandedRuns] = useState<ReadonlyMap<string, ReadonlySet<string>>>(
    () => new Map(),
  );

  function toggleDomain(domain: string) {
    setExpandedDomains((current) => {
      const next = new Set(current);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  }

  function expandRun(domain: string, signature: string) {
    setExpandedRuns((current) => {
      const next = new Map(current);
      next.set(domain, new Set([...(next.get(domain) ?? []), signature]));
      return next;
    });
  }

  return (
    <DateFormatProvider value="month_first">
      <BacklinksRows
        expandedDomains={expandedDomains}
        expandedRuns={expandedRuns}
        groups={groups}
        onRunExpand={expandRun}
        onToggle={toggleDomain}
        rows={rows}
        slice={slice}
      />
    </DateFormatProvider>
  );
}

describe("BacklinksRows", () => {
  it("uses the auto DataTable layout for expandable domain and collapsed-run rows", () => {
    render(<RowsHarness />);

    expect(screen.getByRole("table", { name: "Backlinks" })).toHaveAttribute("data-layout", "auto");
    fireEvent.click(screen.getByRole("button", { name: "Expand footer.example.com" }));
    expect(screen.getByText("34 more pages carry the same footer link")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.queryByText("34 more pages carry the same footer link")).not.toBeInTheDocument();
    expect(screen.getByText("/35/product/example-page")).toBeInTheDocument();
  });

  it("renders flat links without group controls in the all-links slice", () => {
    render(<RowsHarness slice="all_links" />);

    expect(screen.queryByRole("button", { name: /Expand/ })).not.toBeInTheDocument();
    expect(screen.getByText("/discussions/example-page")).toBeInTheDocument();
  });
});
