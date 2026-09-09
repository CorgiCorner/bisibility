import * as r from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as v from "vitest";
import * as t from "./SearchInsightsDrawerHost.test-helpers";

const d = t.tools();

v.describe("SearchInsightsDrawerHost", () => {
  v.beforeEach(() => {
    t.resetDrawerHostMocks();
  });

  v.it("opens the band list with the chip's own count, its note and its columns", async () => {
    const user = userEvent.setup();
    t.renderHost();

    await user.click(r.screen.getByRole("button", { name: "chip band" }));

    v.expect(
      await r.screen.findByText("33 queries ranking below the top three"),
    ).toBeInTheDocument();
    v.expect(r.within(t.panel()).getByText("Positions 4 to 20")).toBeInTheDocument();
    v.expect(r.within(t.panel()).getByText("Biggest demand first")).toBeInTheDocument();
    v.expect(r.within(t.panel()).getByText(/the work is position, not demand/)).toBeInTheDocument();
    const drawer = t.panel();
    const headers = r.within(drawer).getAllByRole("columnheader");
    const queryHeader = headers.find((header) => header.textContent === "Query") as HTMLElement;
    v.expect(queryHeader).toHaveAttribute("data-column-id", "text");
    v.expect(queryHeader).not.toHaveClass("justify-end", "text-right");
    for (const label of ["Clicks", "Impr", "Avg pos"]) {
      const header = headers.find((item) => item.textContent === label) as HTMLElement;
      v.expect(header).toHaveClass("justify-end", "text-right", "tabular-nums");
    }
    v.expect(t.actions.loadBandListAction).toHaveBeenCalledWith({
      limit: undefined,
      period: "28",
      projectId: "prj_1",
      property: "sc-domain:example.com",
    });
  });

  v.it("keeps the selected comparison mode in drawer reads", async () => {
    const user = userEvent.setup();
    t.renderHost({}, { comparison: "yoy" });

    await user.click(r.screen.getByRole("button", { name: "chip band" }));

    v.expect(t.actions.loadBandListAction).toHaveBeenCalledWith({
      comparison: "yoy",
      limit: undefined,
      period: "28",
      projectId: "prj_1",
      property: "sc-domain:example.com",
    });
  });

  v.it.each([
    {
      button: "empty band no named",
      copy: "Nothing to show yet. This list needs named queries in the window, and Google has named none so far.",
      definition: "This list tracks queries where demand exists but rank can improve.",
      title: "0 queries ranking below the top three",
    },
    {
      button: "empty band named",
      copy: "None of your named queries sit at positions 4 to 20 - everything Google names ranks in the top three.",
      definition: "This list tracks queries where demand exists but rank can improve.",
      title: "0 queries ranking below the top three",
    },
    {
      button: "empty overlap no named",
      copy: "Nothing to show yet. This list needs named queries in the window, and Google has named none so far.",
      definition: "This list tracks queries where more than one of your pages appears.",
      title: "0 queries answered by more than one page",
    },
    {
      button: "empty overlap named",
      copy: "No query is answered by more than one page in this window - no overlap signal.",
      definition: "This list tracks queries where more than one of your pages appears.",
      title: "0 queries answered by more than one page",
    },
  ])("renders the zero state opened by $button", async ({ button, copy, definition, title }) => {
    const user = userEvent.setup();
    t.actions.loadBandListAction.mockResolvedValue({ rows: [], total: 0 });
    t.actions.loadOverlapListAction.mockResolvedValue({ rows: [], total: 0 });
    t.renderHost();

    await user.click(r.screen.getByRole("button", { name: button }));

    const drawer = t.panel();
    v.expect(await r.within(drawer).findByText(title)).toBeInTheDocument();
    v.expect(r.within(drawer).getByText(copy)).toBeInTheDocument();
    v.expect(r.within(drawer).getByText(definition)).toBeInTheDocument();
    v.expect(
      r.within(drawer).queryByText("Every one of these", { exact: false }),
    ).not.toBeInTheDocument();
    v.expect(
      r.within(drawer).queryByText("Google picks", { exact: false }),
    ).not.toBeInTheDocument();
    v.expect(r.within(drawer).queryByText("Biggest demand first")).not.toBeInTheDocument();
    v.expect(r.within(drawer).queryByText("Most clicks first")).not.toBeInTheDocument();
    v.expect(r.within(drawer).queryByText("0 of 0")).not.toBeInTheDocument();
    v.expect(r.within(drawer).queryByRole("table")).not.toBeInTheDocument();
    v.expect(r.within(drawer).queryByRole("columnheader")).not.toBeInTheDocument();
    v.expect(r.within(drawer).queryByRole("button", { name: /Show all/ })).not.toBeInTheDocument();
  });

  v.it(
    "puts the caret in the panel it opened, and hands it back when the panel closes",
    async () => {
      const user = userEvent.setup();
      t.renderHost();

      const opener = r.screen.getByRole("button", { name: "chip band" });
      await user.click(opener);
      await r.screen.findByText("33 queries ranking below the top three");

      v.expect(r.within(t.panel()).getByRole("button", { name: "Close drawer" })).toHaveFocus();

      await user.click(r.within(t.panel()).getByRole("button", { name: "Close drawer" }));

      await r.waitFor(() => v.expect(r.screen.queryByRole("dialog")).not.toBeInTheDocument());
      v.expect(opener).toHaveFocus();
    },
  );

  v.it("keeps Tab and Shift+Tab focus inside the open drawer", async () => {
    const user = userEvent.setup();
    t.renderHost();

    await user.click(r.screen.getByRole("button", { name: "chip band" }));
    await r.screen.findByText("33 queries ranking below the top three");

    await user.tab();
    v.expect(t.panel()).toContainElement(document.activeElement as HTMLElement | null);
    await user.tab({ shift: true });
    v.expect(t.panel()).toContainElement(document.activeElement as HTMLElement | null);
  });

  v.it("offers a second try when a read fails, rather than an empty panel", async () => {
    const user = userEvent.setup();
    t.actions.loadOverlapListAction.mockRejectedValueOnce(new Error("gone"));
    t.renderHost();

    await user.click(r.screen.getByRole("button", { name: "chip overlap" }));

    await user.click(await r.within(t.panel()).findByRole("button", { name: "Try again" }));

    v.expect(await r.within(t.panel()).findByText("Most clicks first")).toBeInTheDocument();
  });

  v.it("tells two hosts of a domain property apart under the same path", async () => {
    const user = userEvent.setup();
    t.actions.loadOverlapListAction.mockResolvedValue({
      rows: [
        {
          ...d.storyOverlapList.rows[0],
          split: [
            { clicks: 214, path: "/pricing", url: "https://www.example.com/pricing" },
            { clicks: 96, path: "/pricing", url: "https://blog.example.com/pricing" },
          ],
        },
      ],
      total: 1,
    });
    t.renderHost();

    await user.click(r.screen.getByRole("button", { name: "chip overlap" }));

    const pages = await r.within(t.panel()).findAllByTitle(/example\.com\/pricing$/);
    v.expect(pages.map((page) => page.getAttribute("title"))).toEqual([
      "https://www.example.com/pricing",
      "https://blog.example.com/pricing",
    ]);
  });
});
