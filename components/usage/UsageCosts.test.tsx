import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { sharedControlTestMessages } from "@/i18n/test-support/feature-test-messages";
import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import type { UsageCostsView } from "@/lib/cost-items/view";
import costs from "@/messages/core/en/project-usage-costs.json";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { UsageCosts } from "./UsageCosts";

const messages = mergeMessageCatalogs(sharedControlTestMessages, costs);
it.each([0, 1, 2])(
  "explains global deletion when %i other projects use the item",
  async (others) => {
    const view: UsageCostsView = {
      canEdit: true,
      catalog: [],
      month: "2026-11",
      projectPublicId: "prj_a",
      projects: [],
      suggestHref: null,
      today: "2026-11-01",
      tiles: { custom: [], provider: [], seo: [], subscriptions: [] },
      rows: [
        {
          amountMinor: 999,
          billing: "monthly",
          catalogKey: null,
          currency: "USD",
          endedOn: null,
          id: "cst_example",
          itemMonthlyMinor: 999,
          kind: "custom",
          logoDomain: null,
          name: "Shared tool",
          note: null,
          planLabel: "Plan",
          priceChanges: [],
          projectShareMinor: 500,
          projects: Array.from({ length: others + 1 }, (_, i) => ({
            basisPoints: 5000,
            name: `Project ${i}`,
            publicId: i === 0 ? "prj_a" : `prj_other${i}`,
          })),
          split: "percent",
          startedOn: "2026-01-01",
        },
      ],
    };
    const remove = vi.fn().mockResolvedValue(undefined);
    const idle = async () => {};
    renderWithFeatureMessages(
      <UsageCosts
        createItem={idle}
        deleteItem={remove}
        endItem={idle}
        updateItem={idle}
        view={view}
      />,
      { messages },
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Actions for Shared tool" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    const dialog = screen.getByRole("dialog");
    if (others > 0)
      expect(dialog).toHaveTextContent(
        `This item is also used by ${others} other project${others === 1 ? "" : "s"}. Deleting it removes it from every project.`,
      );
    else expect(dialog).not.toHaveTextContent("other project");
    expect(remove).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(remove).toHaveBeenCalledWith({ projectId: "prj_a", publicId: "cst_example" });
  },
);

it("renders refreshed server subscriptions without preserving an old list", () => {
  const view: UsageCostsView = {
    canEdit: false,
    catalog: [],
    month: "2026-11",
    projectPublicId: "prj_a",
    projects: [],
    suggestHref: null,
    today: "2026-11-01",
    tiles: { custom: [], provider: [], seo: [], subscriptions: [] },
    rows: [],
  };
  const idle = async () => {};
  const props = { createItem: idle, deleteItem: idle, endItem: idle, updateItem: idle };
  const { rerender } = renderWithFeatureMessages(<UsageCosts {...props} view={view} />, {
    messages,
  });
  rerender(
    <UsageCosts
      {...props}
      view={{
        ...view,
        rows: [
          {
            amountMinor: 999,
            billing: "monthly",
            catalogKey: null,
            currency: "USD",
            endedOn: null,
            id: "cst_example",
            itemMonthlyMinor: 999,
            kind: "custom",
            logoDomain: null,
            name: "Fresh subscription",
            note: null,
            planLabel: "Plan",
            priceChanges: [],
            projectShareMinor: 999,
            projects: [],
            split: "equal",
            startedOn: "2026-01-01",
          },
        ],
      }}
    />,
  );
  expect(screen.getByText("Fresh subscription")).toBeInTheDocument();
  rerender(<UsageCosts {...props} view={view} />);
  expect(screen.queryByText("Fresh subscription")).not.toBeInTheDocument();
});
