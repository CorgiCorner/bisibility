import { renderWithProjectRunsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RunPage } from "./RunPage";
import { runPageFixture } from "./RunPageFixtures";

vi.mock("@/components/shell/AppRealtimeProvider", () => ({
  useAppRealtime: () => ({ notifications: null, operations: [], status: "live" }),
}));

describe("RunPage deferral summary", () => {
  it("shows one shared reason and that the run was deferred before a provider was chosen", () => {
    render(
      <RunPage
        {...runPageFixture}
        canMutate
        projectRef="prj_example"
        run={{
          ...runPageFixture.run,
          counts: { ...runPageFixture.run.counts, deferred: 2 },
          sharedDeferralCode: "queued_dataforseo_disabled",
        }}
      />,
    );

    expect(screen.getByText("retry on the next run")).toBeVisible();
    expect(
      screen.getByText("Scheduled DataForSEO checks are turned off on this installation."),
    ).toBeVisible();
    expect(screen.getByText("deferred before a provider was chosen")).toBeVisible();
  });
});
