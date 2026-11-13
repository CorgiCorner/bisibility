import { DateDisplayProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import type { ExistingVsNewView } from "@/lib/pages/snapshot-view";
import { defaultProjectPagesQuery } from "@/lib/pages/url-state";
import pagesMessages from "@/messages/core/en/project-pages.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { stubResizeObserver } from "@/tests/observers";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { PagesExistingPanel } from "./PagesExistingPanel";
import { ProjectPagesTabs } from "./ProjectPagesTabs";

const messages = mergeMessageCatalogs(sharedMessages, pagesMessages);

const comparison: ExistingVsNewView = {
  markers: [],
  metrics: [{ disabledReason: null, id: "clicks", provider: null }],
  points: [{ day: "2026-10-01", existing: 20, fresh: 0, removed: 0 }],
  selected: "clicks",
  sessionsNote: null,
  summary: {
    existingPages: 4,
    existingValue: 24,
    freshPages: 1,
    freshValue: 3,
    removedPages: 0,
    removedValue: 0,
    snapshotPages: 5,
  },
  tags: [],
  window: { from: "2026-10-01", to: "2026-10-01" },
};

function frame(children: ReactNode) {
  return (
    <FeatureMessagesProvider locale="en" messages={messages} timeZone="UTC">
      <DateDisplayProvider>
        <TooltipProvider>{children}</TooltipProvider>
      </DateDisplayProvider>
    </FeatureMessagesProvider>
  );
}

describe("PagesExistingPanel heading", () => {
  it("uses the section heading role for the chart card", () => {
    stubResizeObserver();
    render(
      frame(
        <PagesExistingPanel
          canWrite={false}
          comparison={comparison}
          onQuery={() => undefined}
          onTaken={() => undefined}
          projectId="prj_1"
          query={{ ...defaultProjectPagesQuery, tab: "existing-vs-new" }}
          snapshot={{
            id: "snapshot_1",
            label: "Day 1",
            pageCount: 5,
            signalPublicId: null,
            source: "sitemap",
            takenOn: "2026-10-01",
          }}
          tags={[]}
          take={async () => ({ status: "conflict" })}
        />,
      ),
    );

    expect(screen.getByRole("heading", { name: "Clicks added up since the snapshot" })).toHaveClass(
      "text-ui-section",
    );
    // The repeatable action and the baseline context are separate.
    expect(screen.getByRole("button", { name: "Save page snapshot" })).toBeDisabled();
    expect(screen.getByText(/^Baseline /)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See results since this snapshot" })).toHaveAttribute(
      "href",
      expect.stringContaining("compose=performance&from=2026-10-01"),
    );
    expect(screen.getAllByText("Existing pages").length).toBeGreaterThan(0);
    expect(screen.getAllByText("New pages").length).toBeGreaterThan(0);
  });

  it("disables conversions until a source has data", () => {
    stubResizeObserver();
    render(
      frame(
        <PagesExistingPanel
          canWrite={false}
          comparison={{
            ...comparison,
            metrics: [
              ...comparison.metrics,
              { disabledReason: "no_data", id: "conversions", provider: null },
            ],
          }}
          onQuery={() => undefined}
          onTaken={() => undefined}
          projectId="prj_1"
          query={{ ...defaultProjectPagesQuery, tab: "existing-vs-new" }}
          snapshot={{
            id: "snapshot_1",
            label: "Day 1",
            pageCount: 5,
            signalPublicId: null,
            source: "sitemap",
            takenOn: "2026-10-01",
          }}
          tags={[]}
          take={async () => ({ status: "conflict" })}
        />,
      ),
    );

    expect(screen.getByRole("radio", { name: /Conversions/ })).toBeDisabled();
    expect(screen.getAllByText("Connect analytics to chart conversions").length).toBeGreaterThan(0);
  });
});

it("scrolls page tabs inside their strip", () => {
  render(
    <FeatureMessagesProvider locale="en" messages={messages} timeZone="UTC">
      <ProjectPagesTabs
        count={4}
        projectId="prj_example"
        query={defaultProjectPagesQuery}
        tagCount={1}
      />
    </FeatureMessagesProvider>,
  );
  const strip = document.querySelector("[data-tab-strip]");
  expect(strip?.className).toContain("min-w-0");
  expect(strip?.className).toContain("overflow-x-auto");
  const track = strip?.querySelector("[data-tab-track]");
  expect(track?.parentElement).toBe(strip);
  expect(track?.className).toContain("min-w-full");
  expect(track?.className).toContain("border-b");
  const nav = screen.getByRole("navigation", { name: "Page views" });
  expect(nav.className).toContain("min-w-0");
  expect(nav.className).not.toContain("border-b");
  for (const link of within(nav).getAllByRole("link")) {
    expect(link.className).toContain("whitespace-nowrap");
    expect(link.className).toContain("-mb-px");
  }
});
