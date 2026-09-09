import { deferred } from "@/tests/deferred";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OverrideCell } from "./OverrideCell";

const mocks = vi.hoisted(() => ({ replaceCompetitorMarkets: vi.fn() }));

const projectId = "prj_abcdefghijklmnopqrstuvwx";
const competitorId = "cmp_abcdefghijklmnopqrstuvwx";
const flanders = { id: "pmkt_abcdefghijklmnopqrstuvwx", label: "Flanders" };
const lisbon = { id: "pmkt_zbcdefghijklmnopqrstuvwx", label: "Lisbon" };

function renderCell(
  overrides: React.ComponentProps<typeof OverrideCell>["overrides"] = [],
  scopePolicy: "all_markets" | "selected_markets" = "all_markets",
  availableMarkets = [flanders],
) {
  return render(
    <OverrideCell
      availableMarkets={availableMarkets}
      canEdit
      competitorId={competitorId}
      overrides={overrides}
      projectId={projectId}
      replaceMarkets={mocks.replaceCompetitorMarkets}
      scopePolicy={scopePolicy}
    />,
  );
}

describe("OverrideCell", () => {
  beforeEach(() => {
    mocks.replaceCompetitorMarkets.mockReset();
  });

  it("keeps All markets inside the selector and persists exclusions", async () => {
    const user = userEvent.setup();
    mocks.replaceCompetitorMarkets.mockResolvedValue({});
    const { container } = renderCell();

    expect(screen.getByText("All markets")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Competitor markets" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Flanders" }));

    await waitFor(() =>
      expect(mocks.replaceCompetitorMarkets).toHaveBeenCalledWith({
        competitorId,
        marketIds: [flanders.id],
        projectId,
        scopePolicy: "all_markets",
      }),
    );
    expect(screen.getByRole("menuitemradio", { name: "All markets" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("menuitemcheckbox", { name: "Flanders" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Competitor markets" })).toHaveTextContent(
      "No markets",
    );
    expect(container.querySelectorAll("[data-override-delta]")).toHaveLength(0);
  });

  it("distinguishes selected markets from All and can switch policies", async () => {
    const user = userEvent.setup();
    mocks.replaceCompetitorMarkets.mockResolvedValue({});
    renderCell([], "selected_markets");

    expect(screen.getByText("No markets")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Competitor markets" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Flanders" }));

    await waitFor(() =>
      expect(mocks.replaceCompetitorMarkets).toHaveBeenCalledWith({
        competitorId,
        marketIds: [flanders.id],
        projectId,
        scopePolicy: "selected_markets",
      }),
    );
    expect(screen.getByRole("menuitemradio", { name: "All markets" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await user.click(screen.getByRole("menuitemradio", { name: "All markets" }));
    await waitFor(() =>
      expect(mocks.replaceCompetitorMarkets).toHaveBeenLastCalledWith({
        competitorId,
        marketIds: [],
        projectId,
        scopePolicy: "all_markets",
      }),
    );
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Competitor markets" })).toHaveTextContent(
      "All markets",
    );
    expect(JSON.stringify(mocks.replaceCompetitorMarkets.mock.calls)).not.toContain(
      "location_database",
    );
  });

  it("does not expose an archived market and keeps prior state after a rejected mutation", async () => {
    const user = userEvent.setup();
    mocks.replaceCompetitorMarkets.mockRejectedValue(new Error("Project market not found."));
    const { container } = renderCell();

    await user.click(screen.getByRole("button", { name: "Competitor markets" }));
    const menu = screen.getByRole("menu", { name: "Competitor markets" });
    expect(within(menu).queryByText("Archived Flanders")).not.toBeInTheDocument();
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Flanders" }));

    await waitFor(() =>
      expect(container.querySelector('[role="alert"]')).toHaveTextContent(
        "Project market not found.",
      ),
    );
    expect(screen.getByRole("menuitemradio", { name: "All markets" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitemcheckbox", { name: "Flanders" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("serializes quick override additions with their full snapshots", async () => {
    const user = userEvent.setup();
    const firstSave = deferred<unknown>();
    const secondSave = deferred<unknown>();
    mocks.replaceCompetitorMarkets
      .mockImplementationOnce(() => firstSave.promise)
      .mockImplementationOnce(() => secondSave.promise);
    renderCell([], "all_markets", [flanders, lisbon]);

    await user.click(screen.getByRole("button", { name: "Competitor markets" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Flanders" }));
    await waitFor(() => expect(mocks.replaceCompetitorMarkets).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Lisbon" }));

    expect(mocks.replaceCompetitorMarkets).toHaveBeenLastCalledWith({
      competitorId,
      marketIds: [flanders.id],
      projectId,
      scopePolicy: "all_markets",
    });
    firstSave.resolve({});

    await waitFor(() =>
      expect(mocks.replaceCompetitorMarkets).toHaveBeenLastCalledWith({
        competitorId,
        marketIds: [flanders.id, lisbon.id],
        projectId,
        scopePolicy: "all_markets",
      }),
    );
    secondSave.resolve({});

    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Competitor markets" })).toHaveTextContent(
      "No markets",
    );
  });

  it("drops stale queued overrides after a failed save and retries from confirmed overrides", async () => {
    const user = userEvent.setup();
    const firstSave = deferred<unknown>();
    mocks.replaceCompetitorMarkets
      .mockImplementationOnce(() => firstSave.promise)
      .mockResolvedValue({});
    const { container } = renderCell([], "all_markets", [flanders, lisbon]);

    await user.click(screen.getByRole("button", { name: "Competitor markets" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Flanders" }));
    await waitFor(() => expect(mocks.replaceCompetitorMarkets).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Lisbon" }));
    firstSave.reject(new Error("Denied"));

    await waitFor(() =>
      expect(container.querySelector('[role="alert"]')).toHaveTextContent("Denied"),
    );
    expect(mocks.replaceCompetitorMarkets).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("menuitemradio", { name: "All markets" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitemcheckbox", { name: "Flanders" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitemcheckbox", { name: "Lisbon" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Flanders" }));

    await waitFor(() =>
      expect(mocks.replaceCompetitorMarkets).toHaveBeenLastCalledWith({
        competitorId,
        marketIds: [flanders.id],
        projectId,
        scopePolicy: "all_markets",
      }),
    );
  });
});
