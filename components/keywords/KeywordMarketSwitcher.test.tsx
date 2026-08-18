import { ProjectWriteModeProvider } from "@/components/shell/ProjectWriteModeProvider";
import { ToastProvider } from "@/components/ui";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KeywordMarketSwitcher } from "./KeywordMarketSwitcher";
import { keywordRows } from "./keywords-fixtures";

function target(id: string, device: "Desktop" | "Mobile" = "Desktop"): KeywordRow {
  return {
    ...keywordRows[0],
    device,
    id,
    location: {
      ...keywordRows[0].location,
      canonicalKey: "country:US:lang:en",
      displayName: "United States",
      languageLabel: "English",
    },
  };
}

const markets = {
  markets: [
    {
      canonicalKey: "country:US:lang:en",
      countryCode: "US",
      displayName: "United States",
      id: "pm_us",
      languageCode: "en",
      languageLabel: "English",
      monthlyCostCents: 20,
      researchAvailable: true,
      status: "active",
    },
    {
      canonicalKey: "country:NL:lang:nl",
      countryCode: "NL",
      displayName: "Netherlands",
      id: "pm_nl",
      languageCode: "nl",
      languageLabel: "Dutch",
      monthlyCostCents: 20,
      researchAvailable: true,
      status: "active",
    },
  ],
  maxMarkets: 5,
  monthlyCostCents: 40,
  perMarketChecks: 2,
  projectId: "prj_test",
} satisfies ProjectMarketsView;

describe("KeywordMarketSwitcher", () => {
  it("adds every tracked device directly and undoes only the returned targets", async () => {
    const addKeywordsAction = vi.fn(async () => ({
      keywords: [
        { id: "keyword_internal_desktop", publicId: "kw_added_desktop" },
        { id: "keyword_internal_mobile", publicId: "kw_added_mobile" },
      ],
    }));
    const bulkDeleteAction = vi.fn(async () => ({ deleted: 2 }));
    const current = target("kw_current");
    render(
      <ToastProvider>
        <KeywordMarketSwitcher
          addKeywordsAction={addKeywordsAction}
          bulkDeleteAction={bulkDeleteAction}
          canCreateKeyword
          keyword={current}
          projectId="prj_test"
          projectMarkets={markets}
          targets={[current, target("kw_mobile", "Mobile")]}
        />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /United States \/ English/ }));
    const add = await screen.findByRole("menuitem", {
      name: "Add Netherlands / Dutch, +2 checks per run",
    });
    expect(add).toHaveTextContent("+2 checks per run");
    fireEvent.click(add);

    await waitFor(() => expect(addKeywordsAction).toHaveBeenCalledOnce());
    expect(addKeywordsAction).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "prj_test",
        rows: expect.arrayContaining([
          expect.objectContaining({ device: "desktop", locationKey: "country:NL:lang:nl" }),
          expect.objectContaining({ device: "mobile", locationKey: "country:NL:lang:nl" }),
        ]),
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(bulkDeleteAction).toHaveBeenCalledWith({
        keywordIds: ["kw_added_desktop", "kw_added_mobile"],
        projectId: "prj_test",
      }),
    );
  });

  it("uses distinct screen-reader names for switching and adding", async () => {
    const current = target("kw_current");
    const belgium = {
      ...target("kw_be"),
      location: {
        ...current.location,
        canonicalKey: "country:BE:lang:nl",
        countryCode: "BE",
        displayName: "Belgium",
        languageLabel: "Dutch",
      },
    };
    render(
      <KeywordMarketSwitcher
        addKeywordsAction={vi.fn()}
        bulkDeleteAction={vi.fn()}
        canCreateKeyword
        keyword={current}
        projectId="prj_test"
        projectMarkets={markets}
        targets={[current, belgium]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /United States \/ English/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Switch to Belgium / Dutch" }));
    expect(routerMock.push).toHaveBeenCalledWith("/app/prj_test/rank-tracker/kw_be");
  });

  it("does not offer a destructive undo when the add action created no targets", async () => {
    const current = target("kw_current");
    const bulkDeleteAction = vi.fn();
    render(
      <ToastProvider>
        <KeywordMarketSwitcher
          addKeywordsAction={vi.fn(async () => ({ keywords: [] }))}
          bulkDeleteAction={bulkDeleteAction}
          canCreateKeyword
          keyword={current}
          projectId="prj_test"
          projectMarkets={markets}
          targets={[current]}
        />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /United States \/ English/ }));
    fireEvent.click(
      await screen.findByRole("menuitem", {
        name: "Add Netherlands / Dutch, +1 check per run",
      }),
    );
    expect(await screen.findByText("Netherlands / Dutch is already tracked")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
    expect(bulkDeleteAction).not.toHaveBeenCalled();
  });

  it("disables add choices in read-only mode but keeps tracked navigation enabled", async () => {
    const current = target("kw_current");
    const belgium = {
      ...target("kw_be"),
      location: {
        ...current.location,
        canonicalKey: "country:BE:lang:nl",
        countryCode: "BE",
        displayName: "Belgium",
        languageLabel: "Dutch",
      },
    };
    render(
      <ProjectWriteModeProvider projectRef="prj_test" writeMode="migration_hold">
        <KeywordMarketSwitcher
          addKeywordsAction={vi.fn()}
          bulkDeleteAction={vi.fn()}
          canCreateKeyword
          keyword={current}
          projectId="prj_test"
          projectMarkets={markets}
          targets={[current, belgium]}
        />
      </ProjectWriteModeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /United States \/ English/ }));
    const add = await screen.findByRole("menuitem", {
      name: "Add Netherlands / Dutch, +1 check per run",
    });
    expect(add).toHaveAttribute("aria-disabled", "true");
    expect(add).not.toHaveAttribute("title");
    const describedBy = add.getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();
    expect(document.getElementById(describedBy ?? "")).toHaveTextContent(
      "Read-only during migration hold",
    );

    fireEvent.click(screen.getByRole("menuitem", { name: "Switch to Belgium / Dutch" }));
    expect(routerMock.push).toHaveBeenCalledWith("/app/prj_test/rank-tracker/kw_be");
  });

  it("disables add choices when canCreateKeyword is false but keeps tracked navigation enabled", async () => {
    const current = target("kw_current");
    const belgium = {
      ...target("kw_be"),
      location: {
        ...current.location,
        canonicalKey: "country:BE:lang:nl",
        countryCode: "BE",
        displayName: "Belgium",
        languageLabel: "Dutch",
      },
    };
    render(
      <KeywordMarketSwitcher
        addKeywordsAction={vi.fn()}
        bulkDeleteAction={vi.fn()}
        canCreateKeyword={false}
        keyword={current}
        projectId="prj_test"
        projectMarkets={markets}
        targets={[current, belgium]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /United States \/ English/ }));
    const add = await screen.findByRole("menuitem", {
      name: "Add Netherlands / Dutch, +1 check per run",
    });
    expect(add).toHaveAttribute("aria-disabled", "true");

    fireEvent.click(screen.getByRole("menuitem", { name: "Switch to Belgium / Dutch" }));
    expect(routerMock.push).toHaveBeenCalledWith("/app/prj_test/rank-tracker/kw_be");
  });
});
