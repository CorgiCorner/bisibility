import { deferred } from "@/tests/deferred";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AliasPills } from "./AliasPills";

const mocks = vi.hoisted(() => ({ updateCompetitorAliases: vi.fn() }));

const projectId = "prj_abcdefghijklmnopqrstuvwx";
const competitorId = "cmp_abcdefghijklmnopqrstuvwx";

function renderPills(aliases = ["Contentful", "Contentful CMS"]) {
  return render(
    <AliasPills
      aliases={aliases}
      canEdit
      competitorId={competitorId}
      projectId={projectId}
      updateAliases={mocks.updateCompetitorAliases}
    />,
  );
}

describe("AliasPills", () => {
  beforeEach(() => {
    mocks.updateCompetitorAliases.mockReset();
  });

  it("adds and removes aliases through the committed competitor-set action", async () => {
    const user = userEvent.setup();
    mocks.updateCompetitorAliases.mockResolvedValue({});
    renderPills();

    await user.click(screen.getByRole("button", { name: "Add alias" }));
    await user.type(screen.getByLabelText("New brand alias"), "Contentful Platform");
    await user.click(screen.getByRole("button", { name: "Save alias" }));

    await waitFor(() =>
      expect(mocks.updateCompetitorAliases).toHaveBeenLastCalledWith({
        aliases: ["Contentful", "Contentful CMS", "Contentful Platform"],
        competitorId,
        projectId,
      }),
    );
    expect(screen.getByText("Contentful Platform")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Remove alias Contentful CMS" }));

    await waitFor(() =>
      expect(mocks.updateCompetitorAliases).toHaveBeenLastCalledWith({
        aliases: ["Contentful", "Contentful Platform"],
        competitorId,
        projectId,
      }),
    );
  });

  it.each(["", "   ", "contentful"])(
    "keeps a local field error and makes no action call for %j",
    async (alias) => {
      const user = userEvent.setup();
      renderPills();

      await user.click(screen.getByRole("button", { name: "Add alias" }));
      if (alias) await user.type(screen.getByLabelText("New brand alias"), alias);
      await user.click(screen.getByRole("button", { name: "Save alias" }));

      expect(screen.getByRole("alert")).toHaveTextContent(
        alias.toLowerCase() === "contentful"
          ? "Aliases must be unique."
          : "Aliases cannot be empty.",
      );
      expect(mocks.updateCompetitorAliases).not.toHaveBeenCalled();
    },
  );

  it("keeps the previous aliases visible when the action rejects", async () => {
    const user = userEvent.setup();
    mocks.updateCompetitorAliases.mockRejectedValue(new Error("Denied"));
    renderPills();

    await user.click(screen.getByRole("button", { name: "Remove alias Contentful CMS" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Denied"));
    expect(screen.getByText("Contentful CMS")).toBeVisible();
  });

  it("serializes quick alias removals with their full snapshots", async () => {
    const user = userEvent.setup();
    const firstSave = deferred<unknown>();
    const secondSave = deferred<unknown>();
    mocks.updateCompetitorAliases
      .mockImplementationOnce(() => firstSave.promise)
      .mockImplementationOnce(() => secondSave.promise);
    renderPills(["Contentful", "Contentful CMS", "Contentful Platform"]);

    await user.click(screen.getByRole("button", { name: "Remove alias Contentful CMS" }));
    await waitFor(() => expect(mocks.updateCompetitorAliases).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "Remove alias Contentful Platform" }));

    expect(mocks.updateCompetitorAliases).toHaveBeenLastCalledWith({
      aliases: ["Contentful", "Contentful Platform"],
      competitorId,
      projectId,
    });
    firstSave.resolve({});

    await waitFor(() =>
      expect(mocks.updateCompetitorAliases).toHaveBeenLastCalledWith({
        aliases: ["Contentful"],
        competitorId,
        projectId,
      }),
    );
    secondSave.resolve({});

    await waitFor(() => expect(screen.queryByText("Contentful CMS")).not.toBeInTheDocument());
    expect(screen.queryByText("Contentful Platform")).not.toBeInTheDocument();
  });

  it("drops stale queued aliases after a failed save and retries from confirmed aliases", async () => {
    const user = userEvent.setup();
    const firstSave = deferred<unknown>();
    mocks.updateCompetitorAliases
      .mockImplementationOnce(() => firstSave.promise)
      .mockResolvedValue({});
    renderPills(["Contentful", "Contentful CMS", "Contentful Platform"]);

    await user.click(screen.getByRole("button", { name: "Remove alias Contentful CMS" }));
    await waitFor(() => expect(mocks.updateCompetitorAliases).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "Remove alias Contentful Platform" }));
    firstSave.reject(new Error("Denied"));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Denied"));
    expect(mocks.updateCompetitorAliases).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Contentful CMS")).toBeVisible();
    expect(screen.getByText("Contentful Platform")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Remove alias Contentful CMS" }));

    await waitFor(() =>
      expect(mocks.updateCompetitorAliases).toHaveBeenLastCalledWith({
        aliases: ["Contentful", "Contentful Platform"],
        competitorId,
        projectId,
      }),
    );
  });

  it("keeps the add-alias control keyboard reachable", async () => {
    const user = userEvent.setup();
    renderPills();

    await user.tab();

    expect(screen.getByRole("button", { name: "Remove alias Contentful" })).toHaveFocus();
  });
});
