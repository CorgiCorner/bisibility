import { setNavigationState } from "@/tests/next-navigation";
import * as r from "@testing-library/react";
import * as v from "vitest";
import * as t from "./SearchInsightsBody.test-helpers";
import {
  GA4_SESSIONS_LABEL,
  ORGANIC_SESSIONS_LABEL,
  SESSIONS_CONNECT_TITLE,
} from "./search-insights-copy";
import { storyImportState } from "./search-insights-story-fixtures";

v.describe("SearchInsightsBody", () => {
  v.beforeEach(() => {
    t.analyticsMock().track.mockReset();
  });

  v.it("shows the connect card until sessions are connected", () => {
    t.renderBody();

    v.expect(r.screen.getByText(SESSIONS_CONNECT_TITLE)).toBeInTheDocument();
    v.expect(r.screen.getByRole("link", { name: "Connect" })).toBeInTheDocument();
  });

  v.it("keeps the sessions slot visible while a connected GA4 import catches up", () => {
    t.renderBody({
      view: t.view({
        organicSessions: {
          importState: {
            ...storyImportState,
            createdAt: "2026-07-01T00:00:00.000Z",
            daysDone: 20,
            daysTotal: 488,
            finalizedThroughDate: null,
            lastSyncStartedAt: "2026-07-08T02:00:00.000Z",
            state: "running",
            updatedAt: "2026-07-08T04:00:00.000Z",
          },
          keyEventsConfigured: null,
          property: "123456789",
          status: "connected",
        },
        sessionsKpi: null,
        sessionsReadable: false,
      }),
    });

    v.expect(r.screen.getByText(GA4_SESSIONS_LABEL)).toBeInTheDocument();
    v.expect(r.screen.getByText("Pending")).toBeInTheDocument();
    v.expect(r.screen.getByText("Running")).toBeInTheDocument();
    v.expect(r.screen.getByText("Ready in ~4 hr")).toBeInTheDocument();
    v.expect(r.screen.queryByRole("link", { name: "Connect" })).not.toBeInTheDocument();
  });

  v.it("does not infer a GA4 ETA before the import has observed progress", () => {
    t.renderBody({
      view: t.view({
        organicSessions: {
          importState: {
            ...storyImportState,
            createdAt: "2026-07-08T02:00:00.000Z",
            daysDone: 0,
            daysTotal: 488,
            finalizedThroughDate: null,
            state: "running",
            updatedAt: "2026-07-08T04:00:00.000Z",
          },
          keyEventsConfigured: null,
          property: "123456789",
          status: "connected",
        },
        sessionsKpi: null,
        sessionsReadable: false,
      }),
    });

    v.expect(r.screen.getByText("Running")).toBeInTheDocument();
    v.expect(r.screen.queryByText(/^Ready in /)).not.toBeInTheDocument();
  });

  v.it("keeps the sessions slot pending when completed GA4 data is one day behind GSC", () => {
    t.renderBody({
      importState: { ...storyImportState, newestFinalizedDate: "2026-07-08" },
      view: t.view({
        organicSessions: {
          importState: {
            ...storyImportState,
            cursorDate: null,
            finalizedThroughDate: "2026-07-07",
            state: "completed",
          },
          keyEventsConfigured: null,
          property: "123456789",
          status: "connected",
        },
        sessionsKpi: null,
        sessionsReadable: false,
      }),
    });

    v.expect(r.screen.getByText(GA4_SESSIONS_LABEL)).toBeInTheDocument();
    v.expect(r.screen.getByText("Waiting for today's GA4 data")).toBeInTheDocument();
    v.expect(r.screen.getByText("GA4 has not finalized today's data yet.")).toBeInTheDocument();
  });

  v.it("describes other completed GA4 coverage gaps without calling them today's data", () => {
    t.renderBody({
      importState: { ...storyImportState, newestFinalizedDate: "2026-07-08" },
      view: t.view({
        organicSessions: {
          importState: {
            ...storyImportState,
            cursorDate: null,
            finalizedThroughDate: "2026-07-06",
            state: "completed",
          },
          keyEventsConfigured: null,
          property: "123456789",
          status: "connected",
        },
        sessionsKpi: null,
        sessionsReadable: false,
      }),
    });

    v.expect(r.screen.getByText("Complete")).toBeInTheDocument();
    v.expect(
      r.screen.getByText("GA4 history does not cover this comparison yet."),
    ).toBeInTheDocument();
    v.expect(r.screen.queryByText("Waiting for today's GA4 data")).not.toBeInTheDocument();
  });

  v.it(
    "names a connected source that needs reauthentication instead of dropping its KPI slot",
    () => {
      t.renderBody({
        view: t.view({
          organicSessions: {
            importState: null,
            keyEventsConfigured: null,
            property: "123456789",
            status: "needs_reauth",
          },
          sessionsKpi: null,
          sessionsReadable: false,
        }),
      });

      v.expect(r.screen.getByText(GA4_SESSIONS_LABEL)).toBeInTheDocument();
      v.expect(r.screen.getByText("Needs reauth")).toBeInTheDocument();
      v.expect(
        r.screen.getByText("Reconnect GA4 before the import can continue."),
      ).toBeInTheDocument();
      v.expect(r.screen.queryByRole("link", { name: "Connect" })).not.toBeInTheDocument();
    },
  );

  v.it("keeps GSC metrics and tables around a localized GA4 setup card", () => {
    t.renderBody({ ga4Card: <div>GA4 property setup</div> });

    v.expect(r.screen.getByText("12,480")).toBeInTheDocument();
    v.expect(r.screen.getByRole("table", { name: "Top queries" })).toBeInTheDocument();
    v.expect(r.screen.getByRole("table", { name: "Top pages" })).toBeInTheDocument();
    v.expect(r.screen.getByText("GA4 property setup")).toBeInTheDocument();
    v.expect(r.screen.queryByRole("link", { name: "Connect" })).not.toBeInTheDocument();
  });

  v.it("swaps Top pages to sessions and exposes the management link once connected", () => {
    setNavigationState({ searchParams: { lens: "traffic" } });
    t.renderBody({
      view: t.view({
        organicSessions: {
          importState: null,
          keyEventsConfigured: null,
          property: "123456789",
          status: "connected",
        },
        pages: { rows: [{ ...t.pageRows(1)[0], sessions: 84 }], total: 1 },
        clicksToSessionsKpi: {
          kind: "visible",
          kpi: {
            delta: "+2.00 pp",
            dir: "up",
            label: "Clicks to sessions",
            prev: "82.00%",
            source: "GSC",
            value: "84.00%",
          },
        },
        sessionsReadable: true,
      }),
    });

    const card = t.pagesCard();
    v.expect(t.pageColumnHeader(card, ORGANIC_SESSIONS_LABEL)).toHaveAttribute(
      "title",
      "Joined from GA4 by landing page. Search Console counts clicks and GA4 counts sessions, so the two never match exactly and a gap is normal.",
    );
    v.expect(r.within(card).getByText("84")).toBeInTheDocument();
    v.expect(r.screen.getByRole("link", { name: "Manage GA4" })).toHaveAttribute(
      "href",
      "/app/prj_1/integrations?connect=ga4",
    );
    v.expect(r.screen.queryByRole("link", { name: "Connect" })).not.toBeInTheDocument();
  });

  v.it("keeps a connected import out of the sessions table until its history is readable", () => {
    t.renderBody({
      view: t.view({
        organicSessions: {
          importState: null,
          keyEventsConfigured: null,
          property: "123456789",
          status: "connected",
        },
        sessionsReadable: false,
      }),
    });

    const card = t.pagesCard();
    v.expect(
      t.pageColumnHeaders(card).some((item) => item.textContent === ORGANIC_SESSIONS_LABEL),
    ).toBe(false);
    v.expect(r.screen.queryByRole("link", { name: "Manage GA4" })).not.toBeInTheDocument();
    v.expect(r.screen.queryByRole("link", { name: "Connect" })).not.toBeInTheDocument();
  });

  v.it("keeps the management link absent until the sessions integration connects", () => {
    t.renderBody();

    v.expect(r.screen.queryByRole("link", { name: "Manage GA4" })).not.toBeInTheDocument();
  });
});
