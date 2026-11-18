import { CompetitorsWorkspace } from "@/components/competitors/CompetitorsWorkspace";
import { KeywordsGridDialogs } from "@/components/keywords/grid/KeywordsGridDialogs";
import { ResearchTrackingDrawer } from "@/components/research/ResearchTrackingDrawer";
import { keywordCreateReviewCases } from "@/components/schedules/keyword-create-review.test-support";
import {
  competitorsFeatureTestMessages,
  keywordManagementFeatureTestMessages,
  renderWithFeatureMessages,
  researchFeatureTestMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { makeCostContext } from "@/tests/factories/cost-context";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, vi } from "vitest";

const ports = vi.hoisted(() => ({ preview: vi.fn(), matrix: vi.fn(), close: vi.fn() }));
vi.mock("@/lib/schedules/preview-client", async (original) => ({
  ...(await original<typeof import("@/lib/schedules/preview-client")>()),
  requestScheduleChangePreview: ports.preview,
}));
vi.mock("@/lib/actions/keyword", () => ({ addKeywordsMatrix: ports.matrix }));
vi.mock("@/lib/actions/project-market-create", () => ({ createProjectMarket: vi.fn() }));
vi.mock("@/lib/actions/project-markets", () => ({ addProjectMarkets: vi.fn() }));
const projectId = `prj_${"a".repeat(24)}`;
const scheduleId = `sch_${"b".repeat(24)}`;
const location = {
  canonicalKey: "US",
  countryCode: "US",
  displayName: "United States",
  kind: "country" as const,
};
const markets = {
  projectId,
  markets: [
    {
      ...location,
      id: `pmkt_${"c".repeat(24)}`,
      languageCode: "en",
      languageLabel: "English",
      status: "active" as const,
      researchAvailable: true,
      monthlyCostCents: 0,
    },
  ],
  maxMarkets: 5,
  monthlyCostCents: 0,
  perMarketChecks: 1,
  marketCreation: {
    registry: [],
    schedules: [{ id: scheduleId, name: "Weekly", frequency: "weekly" }],
    sources: [],
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  ports.matrix.mockResolvedValue({ created: 1, keywords: [] });
});
for (const caller of ["research", "competitors", "grid"] as const)
  keywordCreateReviewCases(
    `${caller} delegates to the reviewed drawer`,
    ports.preview,
    async () => {
      const user = userEvent.setup();
      const content =
        caller === "research" ? (
          <ResearchTrackingDrawer
            addKeywordsAction={ports.matrix}
            costContext={makeCostContext()}
            draft={{
              device: "desktop",
              keywords: ["rank tracker"],
              location,
              scheduleFrequency: "weekly",
            }}
            location={location}
            project={{ id: projectId, domain: "example.com", name: "Example" }}
            projectDefaultDevice="desktop"
            projectMarkets={markets}
            onAdded={vi.fn()}
            onClose={ports.close}
          />
        ) : caller === "grid" ? (
          <KeywordsGridDialogs
            addKeywordsAction={ports.matrix}
            addDraft={{ open: true, keyword: "rank tracker", tab: "manual" }}
            exportTarget={null}
            onCloseAdd={ports.close}
            onCloseExport={vi.fn()}
            projectId={projectId}
            projectMarkets={markets}
            rows={[]}
            tagSuggestions={[]}
          />
        ) : (
          <CompetitorsWorkspace
            activeViewId={null}
            addKeywordsAction={ports.matrix}
            canCreate
            canDelete
            canUpdate
            deletableSavedViewIds={[]}
            initialFilter={{ excludedKeywordIds: [], position: "all", tag: null }}
            projectRef={projectId}
            projectMarkets={markets}
            savedViews={[]}
            view={{
              managedCompetitors: [
                { domain: "example.org", id: "competitor", initials: "EX", label: "Example" },
              ],
              market: null,
              markets: [
                {
                  canonicalKey: "US",
                  checkedKeywordCount: 0,
                  cityName: null,
                  countryCode: "US",
                  device: "desktop",
                  engine: "google",
                  hl: "en",
                  key: "location_us::desktop::google",
                  keywordCount: 0,
                  languageLabel: "English",
                  location: "United States",
                  locationId: "location_us",
                  locationKind: "country",
                  regionName: null,
                },
              ],
              projectId,
              scope: { device: "desktop", engine: "google", locationId: "location_us" },
              suggestions: [],
            }}
          />
        );
      renderWithFeatureMessages(content, {
        messages: {
          ...keywordManagementFeatureTestMessages,
          ...researchFeatureTestMessages,
          ...competitorsFeatureTestMessages,
        },
      });
      if (caller === "competitors")
        await user.click(screen.getByRole("button", { name: "Track this market" }));
      const keywords = await screen.findByLabelText("Keywords");
      fireEvent.change(keywords, { target: { value: "rank tracker" } });
      await user.click(screen.getByRole("button", { name: "Schedule" }));
      await user.click(screen.getByRole("menuitem", { name: "Weekly" }));
      return {
        action: ports.matrix,
        start: async () => {
          const form = document.querySelector<HTMLFormElement>("form#add-keyword-form");
          if (!form) throw new Error("Missing keyword form");
          fireEvent.submit(form);
        },
        assertDraft: () => {
          expect(ports.close).not.toHaveBeenCalled();
          expect(screen.getByLabelText("Keywords")).toHaveValue("rank tracker");
          expect(screen.getByRole("button", { name: "Schedule" })).toHaveTextContent("Weekly");
        },
      };
    },
  );
