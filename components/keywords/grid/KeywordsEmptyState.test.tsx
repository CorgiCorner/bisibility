import { ProjectWriteModeProvider } from "@/components/shell/ProjectWriteModeProvider";
import { appPath } from "@/lib/routing/app-path";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { KeywordsEmptyState } from "./KeywordsEmptyState";

type EmptyStateProps = ComponentProps<typeof KeywordsEmptyState>;

function renderEmpty(
  providerConnected?: boolean,
  overrides: Partial<EmptyStateProps> = {},
  writeMode: "active" | "migration_hold" = "active",
) {
  const props = {
    canCreateKeyword: true,
    canManageProviders: true,
    importTopQueriesAction: vi.fn(async () => ({ queries: ["rank tracker"] })),
    onAddKeyword: vi.fn(),
    onImportCsv: vi.fn(),
    onImportQueries: vi.fn(),
    projectId: "prj_1",
    providerConnected,
    searchConsoleConnected: true,
    ...overrides,
  } satisfies EmptyStateProps;
  render(
    <ProjectWriteModeProvider projectRef="prj_1" writeMode={writeMode}>
      <KeywordsEmptyState {...props} />
    </ProjectWriteModeProvider>,
  );
  return props;
}

describe("KeywordsEmptyState", () => {
  it("keeps Add keywords primary and both import paths secondary", () => {
    const props = renderEmpty(true);

    const table = screen.getByRole("table", { name: "Rank tracker keywords" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Keyword", "Pos", "Change", "Volume", "Tags"]);
    const emptyCell = within(table).getByRole("cell");
    expect(emptyCell).toHaveAttribute("aria-colspan", "5");
    expect(within(emptyCell).getByRole("heading", { name: "No keywords yet" })).toBeInTheDocument();
    expect(within(table).queryByRole("checkbox")).not.toBeInTheDocument();
    const findQueries = screen.getByRole("button", { name: "From Search Console" });
    expect(findQueries).toBeEnabled();
    expect(findQueries.querySelector("[data-button-start-icon]")).toBeNull();
    expect(screen.queryByRole("link", { name: "Connect Search Console" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Keyword" })).not.toBeInTheDocument();
    const addKeywords = screen.getByRole("button", { name: "Add keywords" });
    const importCsv = screen.getByRole("button", { name: "Import CSV" });
    expect(addKeywords).toHaveAttribute("data-variant", "primary");
    expect(importCsv).toHaveAttribute("data-variant", "ghost");
    expect(
      importCsv.compareDocumentPosition(addKeywords) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(findQueries).toHaveAttribute("data-variant", "ghost");
    expect(addKeywords.querySelector("[data-button-start-icon]")).toBeNull();
    expect(importCsv.querySelector("[data-button-start-icon]")).toBeNull();
    fireEvent.click(addKeywords);
    fireEvent.click(importCsv);
    expect(props.onAddKeyword).toHaveBeenCalledOnce();
    expect(props.onImportCsv).toHaveBeenCalledOnce();
  });

  it("hides create paths below member", () => {
    renderEmpty(false, { canCreateKeyword: false, canManageProviders: false });

    expect(screen.queryByRole("button", { name: "From Search Console" })).not.toBeInTheDocument();
    expect(screen.queryByText("Add keywords")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add keywords" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Import CSV" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /connect one/i })).not.toBeInTheDocument();
  });

  it("hides the checks-consequence note when a provider is connected", () => {
    renderEmpty(true);

    expect(
      screen.queryByText(/rank checks need a connected serp provider/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /connect one/i })).not.toBeInTheDocument();
  });

  it("states the truthful checks consequence when no provider is connected", () => {
    renderEmpty(false);

    expect(screen.getByText(/rank checks need a connected serp provider/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /connect one/i })).toHaveAttribute(
      "href",
      "/app/prj_1/integrations",
    );
  });

  it("omits the connection prompt when Search Console is not connected", () => {
    renderEmpty(true, { searchConsoleConnected: false });

    expect(screen.queryByText("Connect Search Console")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "From Search Console" })).not.toBeInTheDocument();
  });

  it("opens the suggestion picker and imports the confirmed queries", async () => {
    const onImportQueries = vi.fn();
    renderEmpty(true, {
      importTopQueriesAction: vi.fn(async () => ({
        hidden: [],
        hiddenCount: 0,
        queries: ["rank tracker", "seo api"],
        suggestions: [
          { clicks: 9, impressions: 90, query: "rank tracker" },
          { clicks: 4, impressions: 40, query: "seo api" },
        ],
      })),
      onImportQueries,
    });

    fireEvent.click(screen.getByRole("button", { name: "From Search Console" }));

    const confirm = await screen.findByRole("button", { name: /Add 2 keywords/i });
    fireEvent.click(confirm);

    expect(onImportQueries).toHaveBeenCalledWith(["rank tracker", "seo api"]);
  });

  it("links to Integrations when no Search Console source is connected", async () => {
    renderEmpty(true, {
      importTopQueriesAction: vi.fn(async () => ({ queries: [], reason: "no_source" as const })),
    });

    fireEvent.click(screen.getByRole("button", { name: "From Search Console" }));

    expect(await screen.findByText("No Search Console source is connected.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Integrations" })).toHaveAttribute(
      "href",
      appPath("prj_1", "integrations"),
    );
  });

  it("links to reconnect when Search Console authorization is dead", async () => {
    renderEmpty(true, {
      importTopQueriesAction: vi.fn(async () => ({
        queries: [],
        reason: "needs_reauth" as const,
      })),
    });

    fireEvent.click(screen.getByRole("button", { name: "From Search Console" }));

    expect(await screen.findByText("Google authorization has expired.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reconnect your Google account" })).toHaveAttribute(
      "href",
      appPath("prj_1", "integrations"),
    );
  });

  it("explains an empty Search Console result", async () => {
    renderEmpty(true, { importTopQueriesAction: vi.fn(async () => ({ queries: [] })) });

    fireEvent.click(screen.getByRole("button", { name: "From Search Console" }));

    expect(
      await screen.findByText(
        "No queries observed yet - new Search Console properties can take a few days.",
      ),
    ).toBeInTheDocument();
  });

  it("shows a friendly provider error", async () => {
    renderEmpty(true, {
      importTopQueriesAction: vi.fn(async () => {
        throw new Error("Rate limited, try again shortly.");
      }),
    });

    fireEvent.click(screen.getByRole("button", { name: "From Search Console" }));

    expect(await screen.findByText("Rate limited, try again shortly.")).toBeInTheDocument();
  });

  it("disables all mutation paths in read-only mode", async () => {
    const props = renderEmpty(true, {}, "migration_hold");

    expect(screen.getByRole("button", { name: "From Search Console" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add keywords" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Import CSV" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "From Search Console" }));
    await waitFor(() => expect(props.importTopQueriesAction).not.toHaveBeenCalled());
  });
});
