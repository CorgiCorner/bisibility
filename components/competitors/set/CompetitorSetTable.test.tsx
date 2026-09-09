import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CompetitorSetTable } from "./CompetitorSetTable";

const projectId = "prj_abcdefghijklmnopqrstuvwx";
const rows = Array.from({ length: 10 }, (_, index) => ({
  aliases: index === 0 ? ["Contentful", "Contentful CMS"] : [`Brand ${index + 1}`],
  createdAt: new Date(`2026-09-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`),
  domain: `competitor-${index + 1}.example.com`,
  evidence: index === 0 ? { bestPosition: 3, of: 12, seenOn: 9 } : null,
  overrides: [],
  publicId: `cmp_abcdefghijklmnopqrstuvwx${index}`,
  scopePolicy: "all_markets" as const,
  source: index === 0 ? ("suggested" as const) : ("manual" as const),
}));

function renderTable(overrides: Partial<React.ComponentProps<typeof CompetitorSetTable>> = {}) {
  return render(
    <CompetitorSetTable
      addCompetitor={vi.fn()}
      canDelete
      canEdit
      competitors={rows.slice(0, 5)}
      markets={[{ id: "pmkt_abcdefghijklmnopqrstuvwx", label: "Flanders" }]}
      projectId={projectId}
      removeCompetitor={vi.fn()}
      replaceMarkets={vi.fn()}
      updateCompetitor={vi.fn()}
      {...overrides}
    />,
  );
}

describe("CompetitorSetTable", () => {
  it("renders the five Settings columns and preserves suggested provenance", () => {
    renderTable();

    for (const heading of ["Domain", "Brand aliases", "In markets", "Source", "Added"]) {
      expect(screen.getByRole("columnheader", { name: heading })).toBeVisible();
    }
    expect(screen.getByRole("button", { name: "why?" })).toHaveAttribute("aria-describedby");
    expect(screen.getAllByText("manual")).toHaveLength(4);
    expect(screen.getAllByText("suggested")).toHaveLength(1);
  });

  it("covers the empty, few, and many visual fixtures with the Add competitor affordance", () => {
    const { rerender } = renderTable({ competitors: [] });
    expect(screen.getByText("No competitors added")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add competitor" })).toBeVisible();

    rerender(
      <CompetitorSetTable
        addCompetitor={vi.fn()}
        canDelete
        canEdit
        competitors={rows.slice(0, 5)}
        markets={[]}
        projectId={projectId}
        removeCompetitor={vi.fn()}
        replaceMarkets={vi.fn()}
        updateCompetitor={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("row")).toHaveLength(6);

    rerender(
      <CompetitorSetTable
        addCompetitor={vi.fn()}
        canDelete
        canEdit
        competitors={rows}
        markets={[]}
        projectId={projectId}
        removeCompetitor={vi.fn()}
        replaceMarkets={vi.fn()}
        updateCompetitor={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("row")).toHaveLength(11);
    expect(screen.getByRole("textbox", { name: "Search competitors" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add competitor" })).toBeVisible();
  });

  it("keeps aliases, overrides, and the add affordance read-only for a viewer", () => {
    renderTable({ canDelete: false, canEdit: false });

    expect(screen.queryByRole("button", { name: /^Actions for/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add alias" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add market override" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add competitor" })).not.toBeInTheDocument();
  });

  it("opens a manual add form without promising suggestions after another check", () => {
    renderTable({ competitors: [] });

    expect(screen.getByText(/Rank checks do not add them automatically/)).toBeVisible();
    expect(screen.queryByText(/After a rank check/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add competitor" }));
    expect(screen.getByRole("heading", { name: "Add competitor" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Competitor domain" })).toBeVisible();
  });
});

describe("competitor row actions", () => {
  it("opens the exact competitor domain in a new tab with an external link icon", () => {
    renderTable({ competitors: [{ ...rows[0], domain: "docs.serpbear.com" }] });
    const link = screen.getByRole("link", { name: "docs.serpbear.com" });
    expect(link).toHaveAttribute("href", "https://docs.serpbear.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(link.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it("confirms the selected competitor before removing and refreshes on success", async () => {
    const removeCompetitor = vi.fn().mockResolvedValue({ removed: true });
    renderTable({ removeCompetitor });
    fireEvent.click(screen.getByRole("button", { name: `Actions for ${rows[1].domain}` }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove" }));
    const dialog = screen.getByRole("dialog", { name: "Remove competitor" });
    expect(dialog).toHaveTextContent(rows[1].domain);
    expect(dialog).toHaveTextContent("Saved rank checks and SERP results are kept.");
    expect(removeCompetitor).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(removeCompetitor).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: `Actions for ${rows[1].domain}` }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalled());
    await waitFor(() =>
      expect(removeCompetitor).toHaveBeenCalledWith({
        competitorId: rows[1].publicId,
        projectId,
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps a failed removal open for retry and does not offer removal to members", async () => {
    const removeCompetitor = vi.fn().mockRejectedValue(new Error("Could not remove competitor."));
    const { unmount } = renderTable({ removeCompetitor });
    fireEvent.click(screen.getByRole("button", { name: `Actions for ${rows[0].domain}` }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not remove competitor.");
    expect(screen.getByRole("dialog")).toBeVisible();
    unmount();
    renderTable({ canDelete: false });
    fireEvent.click(screen.getByRole("button", { name: `Actions for ${rows[0].domain}` }));
    expect(screen.queryByRole("menuitem", { name: "Remove" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeVisible();
  });
});

it("moves alias editing into a prefilled dialog and saves normalized details together", async () => {
  const updateCompetitor = vi.fn().mockResolvedValue({});
  renderTable({ updateCompetitor });
  expect(screen.queryByRole("button", { name: "Add alias" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Remove alias/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: `Actions for ${rows[0].domain}` }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
  const dialog = screen.getByRole("dialog", { name: "Edit competitor" });
  expect(within(dialog).getByRole("textbox", { name: "Competitor domain" })).toHaveValue(
    rows[0].domain,
  );
  const aliases = within(dialog).getByRole("textbox", { name: "Competitor brand aliases" });
  expect(aliases).toHaveValue("Contentful, Contentful CMS");
  fireEvent.change(aliases, { target: { value: "Brand, brand" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Aliases must be unique.");
  expect(updateCompetitor).not.toHaveBeenCalled();
  fireEvent.change(aliases, { target: { value: "SerpBear, Serp Bear" } });
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Competitor domain" }), {
    target: { value: "https://docs.serpbear.com/start" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(updateCompetitor).toHaveBeenCalledWith({
      aliases: ["SerpBear", "Serp Bear"],
      domain: "docs.serpbear.com",
      competitorId: rows[0].publicId,
      projectId,
    }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(routerMock.refresh).toHaveBeenCalled();
});

it("does not save a cancelled edit and resets its draft on reopen", async () => {
  const updateCompetitor = vi.fn();
  renderTable({ updateCompetitor });
  const open = () => {
    fireEvent.click(screen.getByRole("button", { name: `Actions for ${rows[0].domain}` }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
  };
  open();
  fireEvent.change(screen.getByRole("textbox", { name: "Competitor brand aliases" }), {
    target: { value: "Discard me" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(updateCompetitor).not.toHaveBeenCalled();
  open();
  expect(screen.getByRole("textbox", { name: "Competitor brand aliases" })).toHaveValue(
    "Contentful, Contentful CMS",
  );
});
