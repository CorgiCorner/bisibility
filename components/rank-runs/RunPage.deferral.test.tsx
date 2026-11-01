import { renderWithProjectRunsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen, within } from "@testing-library/react";
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
  it("explains a paused approved provider without suggesting a different charge", () => {
    render(
      <RunPage
        {...runPageFixture}
        canMutate={false}
        projectRef="prj_example"
        run={{
          ...runPageFixture.run,
          status: "completed",
          outcome: "deferred",
          hasAccountDeferred: true,
          selectionSpec: { rankPaymentConsent: {} },
          counts: { ...runPageFixture.run.counts, deferred: 1 },
        }}
      />,
    );
    expect(screen.getByText(/The approved provider is paused/)).toHaveTextContent(
      "fresh cost preview",
    );
    expect(screen.getByRole("link", { name: "Start a new run" })).toHaveAttribute(
      "href",
      "/app/prj_example/rank-tracker",
    );
    expect(screen.queryByRole("button", { name: /retry deferred/i })).not.toBeInTheDocument();
  });
  it("shows the blocked connection even when a fallback produced the final result", () => {
    const item = {
      ...runPageFixture.items[0],
      accountBlocks: [
        { connectionId: "conn_a", provider: "DataForSEO", reason: "provider_billing" as const },
      ],
    };
    render(
      <RunPage {...runPageFixture} items={[item]} canMutate={false} projectRef="prj_example" />,
    );
    const cause = screen.getByText(
      "DataForSEO: not sent because billing or capacity needs attention.",
    );
    expect(cause).toBeVisible();
    const cell = cause.closest('[role="cell"]');
    expect(cell).toHaveAttribute("data-column-id", "note");
    const row = cause.closest('[role="row"]');
    expect(row).not.toBeNull();
    if (!(row instanceof HTMLElement)) throw new Error("Missing row");
    expect(
      within(row).getByText("DataForSEO: not sent because billing or capacity needs attention."),
    ).toBeVisible();
    expect(row.querySelector('[data-column-id="cost"]')).not.toHaveTextContent("not sent");
  });
  it("does not show a position for a deferred check even if the projection contains one", () => {
    const item = { ...runPageFixture.items[0], status: "deferred" as const };
    expect(item.rankCheck?.position).toBe(7);
    render(
      <RunPage {...runPageFixture} items={[item]} canMutate={false} projectRef="prj_example" />,
    );
    const row = screen.getByText(item.keyword.text).closest('[role="row"]');
    expect(row?.querySelector('[data-column-id="position"]')).not.toHaveTextContent("7");
  });
});
