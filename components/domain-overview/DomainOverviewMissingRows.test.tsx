import { paymentQuote } from "@/components/action-payment/payment-test-fixture";
import { renderWithDomainOverviewMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { DomainOverviewReport } from "@/lib/domain-overview/types";
import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DomainOverviewResults } from "./DomainOverviewResults";
import { domainOverviewReportFixture } from "./fixtures";

const credits = {
  kind: "credits" as const,
  key: "bisibility",
  singular: "Credit",
  plural: "Credits",
};

function failed(
  module: "keywords" | "pages",
  reason:
    | "lookup_failed"
    | "snapshot_expired"
    | "unexpected"
    | "payment_admission"
    | "usage_persistence",
): DomainOverviewReport {
  const failure = { costCents: 0, ok: false as const, reason };
  if (module === "keywords") {
    return { ...domainOverviewReportFixture, keywords: failure, state: "partial" };
  }
  return { ...domainOverviewReportFixture, pages: failure, state: "partial" };
}

function renderReport(
  report: DomainOverviewReport,
  extras: Partial<Parameters<typeof DomainOverviewResults>[0]> = {},
) {
  return render(
    <DomainOverviewResults
      history={null}
      historyError={false}
      historyLoading={false}
      projectRef="prj_1"
      report={report}
      tableError={null}
      tableFetchedCount={{ keywords: 0, pages: 0 }}
      tableHasMore={{ keywords: false, pages: false }}
      tableLoading={null}
      {...extras}
    />,
  );
}

it("offers a priced first page when saved keyword rows were not collected", async () => {
  const onLoad = vi.fn();
  const action = vi.fn().mockResolvedValue({
    ok: true,
    estimate: true,
    payment: paymentQuote({
      charge: { value: "9.8889", certainty: "estimate", unit: credits },
    }),
  });
  renderReport(failed("keywords", "lookup_failed"), {
    onLoadMoreKeywords: onLoad,
    onRefresh: vi.fn(),
    paymentActions: { keywords: action },
    paymentInputs: { history: null, keywords: { projectId: "prj_1" }, pages: null },
  });

  expect(screen.getByText("Loading these rows is cached for 12 hours.")).toBeInTheDocument();
  expect(
    screen.queryByText("Keyword rows were not collected with this saved result."),
  ).not.toBeInTheDocument();
  const amount = await screen.findByText("≈ 9.89 Credits");
  expect(amount).toHaveAttribute("title", "≈ 9.8889 Credits");
  const load = screen.getByRole("button", { name: /load top organic keywords/i });
  expect(load).toHaveAttribute("data-variant", "secondary");
  fireEvent.click(load);
  expect(onLoad).toHaveBeenCalledOnce();
});

it("explains an expired keyword snapshot and offers refresh instead of a row load", () => {
  renderReport(failed("keywords", "snapshot_expired"), { onRefresh: vi.fn() });

  expect(
    screen.getByText("Keyword rows were not collected with this saved result."),
  ).toBeInTheDocument();
  const refresh = screen.getAllByRole("button", { name: /refresh now/i });
  expect(refresh).toHaveLength(2);
  expect(refresh[0]).toHaveAttribute("data-variant", "outline");
  expect(refresh[1]).toHaveAttribute("data-variant", "outline");
  expect(
    screen.queryByRole("button", { name: /load top organic keywords/i }),
  ).not.toBeInTheDocument();
});

it("loads missing pages and refreshes a snapshot that cannot be loaded", () => {
  const onLoad = vi.fn();
  const { rerender } = renderReport(failed("pages", "lookup_failed"), {
    onLoadMorePages: onLoad,
    onRefresh: vi.fn(),
  });
  expect(screen.getByText("Loading these rows is cached for 12 hours.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /load top pages/i }));
  expect(onLoad).toHaveBeenCalledOnce();

  rerender(
    <DomainOverviewResults
      history={null}
      historyError={false}
      historyLoading={false}
      onLoadMorePages={onLoad}
      onRefresh={vi.fn()}
      projectRef="prj_1"
      report={failed("pages", "snapshot_expired")}
      tableError={null}
      tableFetchedCount={{ keywords: 0, pages: 0 }}
      tableHasMore={{ keywords: false, pages: false }}
      tableLoading={null}
    />,
  );
  expect(
    screen.getByText("Page rows were not collected with this saved result."),
  ).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: /refresh now/i })).toHaveLength(2);
  expect(screen.queryByRole("button", { name: /load top pages/i })).not.toBeInTheDocument();
});

it("hides row loading and refresh on a read-only stored result", () => {
  const pages = domainOverviewReportFixture.pages;
  if (!pages.ok) throw new Error("Page fixture must be available");
  renderReport(failed("keywords", "lookup_failed"), {
    onRefresh: vi.fn(),
    readOnly: true,
    storedModules: { keywords: null, pages: pages.data },
  });

  expect(
    screen.getByText("Keyword rows were not collected with this saved result."),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /refresh now/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /load top/i })).not.toBeInTheDocument();
});

it.each([
  ["keywords", "unexpected", "An unexpected error prevented collection."],
  ["pages", "payment_admission", "Payment could not be authorized before collection."],
  ["keywords", "usage_persistence", "Usage could not be confirmed. Review usage before retrying."],
] as const)(
  "shows the saved %s failure reason %s and keeps row loading",
  (kind, reason, message) => {
    const onLoad = vi.fn();
    renderReport(failed(kind, reason), {
      onLoadMoreKeywords: onLoad,
      onLoadMorePages: onLoad,
      onRefresh: vi.fn(),
    });
    expect(screen.getByText(message, { exact: false })).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: kind === "keywords" ? /load top organic keywords/i : /load top pages/i,
      }),
    );
    expect(onLoad).toHaveBeenCalledOnce();
  },
);
