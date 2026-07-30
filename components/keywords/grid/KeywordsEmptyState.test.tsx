import { ProjectWriteModeProvider } from "@/components/shell/ProjectWriteModeProvider";
import { appPath } from "@/lib/routing/app-path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  it("renders Search Console, manual, CSV, and guide paths", () => {
    renderEmpty(true);

    expect(
      screen.getByRole("heading", { name: "Find opportunities in Search Console" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Add keywords manually" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Find Search Console queries" })).toBeEnabled();
    expect(screen.getByRole("textbox", { name: "Keyword" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import CSV" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Read the first-keywords guide" })).toHaveAttribute(
      "href",
      "https://bisibility.com/docs/guides/choose-first-keywords",
    );
  });

  it("keeps the guide readable while hiding create paths below member", () => {
    renderEmpty(false, { canCreateKeyword: false, canManageProviders: false });

    expect(screen.queryByText("Find opportunities in Search Console")).not.toBeInTheDocument();
    expect(screen.queryByText("Add keywords manually")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Import CSV" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /connect one/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Read the first-keywords guide" })).toHaveAttribute(
      "href",
      "https://bisibility.com/docs/guides/choose-first-keywords",
    );
  });

  it("hides the checks-consequence note when a provider is connected", () => {
    renderEmpty(true);

    expect(
      screen.queryByText(/rank checks need a connected serp provider/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /connect one/i })).not.toBeInTheDocument();
  });

  it("states the truthful checks consequence, outside the manual-add card, when no provider", () => {
    renderEmpty(false);

    // Relocated from inside the manual-add card; keywords are not auto-paused, so the copy
    // describes the real behavior (checks wait for a provider), not a false "added as paused".
    expect(screen.getByText(/rank checks need a connected serp provider/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /connect one/i })).toHaveAttribute(
      "href",
      "/app/prj_1/integrations",
    );
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

    fireEvent.click(screen.getByRole("button", { name: "Find Search Console queries" }));

    const confirm = await screen.findByRole("button", { name: /Add 2 keywords/i });
    fireEvent.click(confirm);

    expect(onImportQueries).toHaveBeenCalledWith(["rank tracker", "seo api"]);
  });

  it("links to Integrations when no Search Console source is connected", async () => {
    renderEmpty(true, {
      importTopQueriesAction: vi.fn(async () => ({ queries: [], reason: "no_source" as const })),
    });

    fireEvent.click(screen.getByRole("button", { name: "Find Search Console queries" }));

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

    fireEvent.click(screen.getByRole("button", { name: "Find Search Console queries" }));

    expect(await screen.findByText("Google authorization has expired.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reconnect your Google account" })).toHaveAttribute(
      "href",
      appPath("prj_1", "integrations"),
    );
  });

  it("explains an empty Search Console result", async () => {
    renderEmpty(true, { importTopQueriesAction: vi.fn(async () => ({ queries: [] })) });

    fireEvent.click(screen.getByRole("button", { name: "Find Search Console queries" }));

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

    fireEvent.click(screen.getByRole("button", { name: "Find Search Console queries" }));

    expect(await screen.findByText("Rate limited, try again shortly.")).toBeInTheDocument();
  });

  it("disables all mutation paths in read-only mode", async () => {
    const props = renderEmpty(true, {}, "migration_hold");

    expect(screen.getByRole("button", { name: "Find Search Console queries" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Import CSV" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Find Search Console queries" }));
    await waitFor(() => expect(props.importTopQueriesAction).not.toHaveBeenCalled());
  });
});
