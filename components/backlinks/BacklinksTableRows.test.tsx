import { DateFormatProvider } from "@/components/dates/DateFormatProvider";
import { renderWithBacklinksMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { BacklinksRow } from "@/lib/backlinks/types";
import { fireEvent, screen } from "@testing-library/react";
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
function RowsHarness({
  slice = "one_per_domain",
  sourceRows = rows,
}: Readonly<{ slice?: BacklinksSlice; sourceRows?: readonly BacklinksRow[] }>) {
  const grouped = groupBacklinksByDomain(sourceRows, now);
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
        groups={grouped}
        onRunExpand={expandRun}
        onToggle={toggleDomain}
        rows={sourceRows}
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
    const collapsed = screen.getByText("34 more pages carry the same footer link");
    expect(collapsed.closest("a")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.queryByText("34 more pages carry the same footer link")).not.toBeInTheDocument();
    expect(screen.getByText("/35/product/example-page")).toBeInTheDocument();
  });

  it("renders flat links without group controls in the all-links slice", () => {
    render(<RowsHarness slice="all_links" />);

    expect(screen.queryByRole("button", { name: /Expand/ })).not.toBeInTheDocument();
    expect(screen.getByText("/discussions/example-page")).toBeInTheDocument();
  });

  it("opens an http source in a new tab and leaves other rows as text", () => {
    const sourceRows = [
      fixtureRow({
        sourceDomain: "notes.example.com",
        sourceUrl: "https://notes.example.com/a",
      }),
      fixtureRow({
        sourceDomain: "files.example.com",
        sourceUrl: "ftp://files.example.com/notes",
      }),
      fixtureRow({
        anchor: "First group page",
        sourceDomain: "group.example.com",
        sourceUrl: "https://group.example.com/one",
      }),
      fixtureRow({
        anchor: "Second group page",
        sourceDomain: "group.example.com",
        sourceUrl: "https://group.example.com/two",
      }),
    ];
    const { unmount } = render(<RowsHarness slice="all_links" sourceRows={sourceRows} />);
    const link = screen.getByRole("link", { name: "https://notes.example.com/a" });
    expect(link).toHaveAttribute("href", "https://notes.example.com/a");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
    expect(link).toHaveTextContent("/a");
    expect(screen.getByText("/notes").closest("a")).toBeNull();
    expect(
      screen.queryByRole("link", { name: "ftp://files.example.com/notes" }),
    ).not.toBeInTheDocument();
    unmount();

    render(<RowsHarness sourceRows={sourceRows} />);
    expect(screen.getByRole("button", { name: "Expand group.example.com" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /group\.example\.com/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand notes.example.com" }));
    const groupedLink = screen.getByRole("link", { name: "https://notes.example.com/a" });
    fireEvent.click(groupedLink);
    expect(screen.getByRole("button", { name: "Collapse notes.example.com" })).toBeInTheDocument();
    expect(groupedLink).toBeInTheDocument();
  });
});
