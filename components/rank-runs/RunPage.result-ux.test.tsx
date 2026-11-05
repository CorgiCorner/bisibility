import { renderWithProjectRunsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { RunPage } from "./RunPage";
import { runPageFixture } from "./RunPageFixtures";

vi.mock("@/components/shell/AppRealtimeProvider", () => ({
  useAppRealtime: () => ({ operations: [], rankDataVersion: 0 }),
}));

function page(
  options: {
    indeterminate?: boolean;
    queued?: boolean;
    cost?: number | null;
    coverage?: number | null;
    completeness?: string | null;
  } = {},
) {
  const base = runPageFixture.items[0];
  const run = {
    ...runPageFixture.run,
    status: options.queued ? ("queued" as const) : ("completed" as const),
    providerLabel: "DataForSEO",
    rankedCount: 0,
    executedProviders: ["serpapi"],
    counts: { ...runPageFixture.run.counts, total: 1, completed: 1, failed: 0, skipped: 0 },
    childRuns: [{ publicId: "rcr_newer", parentRelation: "retry_failed" }],
    parentRunPublicId: "rcr_original",
  };
  render(
    <RunPage
      {...runPageFixture}
      run={run}
      canMutate={false}
      projectRef="prj_example"
      items={[
        {
          ...base,
          actualCostCents: options.cost === undefined ? 0.12 : options.cost,
          status: options.queued ? "queued" : options.indeterminate ? "failed" : "completed",
          rankCheck: {
            ...base.rankCheck,
            publicId: "check_example",
            rankingUrl: null,
            position: null,
            requestedDepth: 20,
            provider: "serpapi",
            observationCompleteness:
              options.completeness === undefined
                ? options.indeterminate
                  ? "unknown"
                  : "complete"
                : options.completeness,
            organicCoverageDepth:
              options.coverage === undefined
                ? options.indeterminate
                  ? null
                  : 20
                : options.coverage,
            errorCode: options.indeterminate ? "organic_depth_not_covered" : null,
            attempts: [
              {
                provider: "dataforseo",
                providerLabel: "DataForSEO",
                detail: "Internal SE Server Error.",
                outcome: "provider_failed",
                costCents: null,
                durationMs: null,
                degradedToCountry: false,
              },
            ],
          },
        },
      ]}
    />,
  );
}

it("shows a no-match result, exact provider amount, actual provider and checked/ranked summary", () => {
  page();
  expect(screen.getByText("Not in top 20")).toBeVisible();
  expect(screen.getByText("$0.0012")).toBeVisible();
  expect(screen.getByText("1 checked, 0 ranked")).toBeVisible();
  expect(
    screen.getAllByText(/DataForSEO failed \(Internal SE Server Error\.\), completed with SerpApi/)
      .length,
  ).toBeGreaterThan(0);
  expect(screen.queryByText("chosen at launch")).toBeNull();
});
it("keeps incomplete coverage indeterminate", () => {
  page({ indeterminate: true, cost: null });
  expect(screen.queryByText("Not in top 20")).toBeNull();
  expect(screen.getByText(/did not cover the requested depth/)).toBeVisible();
  expect(screen.getByText("Cost not recorded")).toBeVisible();
});
it("shows queued targets as waiting and hides their previous result", () => {
  page({ queued: true });
  expect(screen.getAllByText("Queued").length).toBeGreaterThan(0);
  expect(screen.queryByText("Not in top 20")).toBeNull();
  expect(screen.queryByText(/Internal SE Server Error/)).toBeNull();
});
it("links the retry and original run in both directions", () => {
  page();
  expect(screen.getByRole("link", { name: "Retry of rcr_original" })).toHaveAttribute(
    "href",
    "/app/prj_example/rank-tracker/runs/rcr_original",
  );
  expect(screen.getByRole("link", { name: "Retried in rcr_newer" })).toHaveAttribute(
    "href",
    "/app/prj_example/rank-tracker/runs/rcr_newer",
  );
});

it.each([null, "complete"])(
  "keeps no-match indeterminate without prefix proof (%s provenance)",
  (completeness) => {
    page({ completeness, coverage: null });
    expect(screen.queryByText("Not in top 20")).toBeNull();
    expect(screen.getByText("Coverage unknown")).toBeVisible();
  },
);
it("does not use a shallower organic prefix as proof of the requested depth", () => {
  page({ coverage: 19 });
  expect(screen.queryByText("Not in top 20")).toBeNull();
  expect(screen.getByText("Coverage unknown")).toBeVisible();
});
