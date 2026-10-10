import { MenuSelect } from "@/components/ui/MenuSelect";
import { renderWithResearchMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { downloadTextFile } from "@/lib/ui/download";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ResearchResultsTable } from "./ResearchResultsTable";

vi.mock("@/lib/ui/download", () => ({ downloadTextFile: vi.fn() }));

function renderExport() {
  const changeTab = vi.fn();
  render(
    <ResearchResultsTable
      activeKeyword={null}
      cached
      canRemoveSaved={false}
      deeper={null}
      fetchedAt="2026-01-01T00:00:00Z"
      fetchedCount={0}
      filterCount={0}
      onActiveChange={vi.fn()}
      onOpenFilters={changeTab}
      rows={[]}
      seed="fixture"
      selectedKeywords={[]}
      totalCount={0}
    />,
  );
  return { changeTab, trigger: screen.getByRole("button", { name: "Export" }) };
}

describe("research export menu", () => {
  it("retains modal pointer gating for existing select menus", async () => {
    render(
      <MenuSelect
        ariaLabel="Mode"
        options={[{ label: "First", value: "first" }]}
        value="first"
        onChange={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "Mode" });
    await user.click(trigger);
    await screen.findByRole("menu");
    expect(document.body.style.pointerEvents).toBe("none");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(trigger).toHaveFocus();
    expect(document.body.style.pointerEvents).toBe("");
  });
  it("dismisses and activates the adjacent control in one pointer click", async () => {
    const { changeTab, trigger } = renderExport();
    const user = userEvent.setup();
    await user.click(trigger);
    await screen.findByRole("menu");
    const filters = screen.getByRole("button", { name: "Filters", hidden: true });
    await user.click(filters);
    expect(changeTab).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(filters).toHaveFocus();
    await user.click(trigger);
    await screen.findByRole("menu");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it("restores trigger focus on Escape and stays usable on reopening", async () => {
    const { trigger } = renderExport();
    const user = userEvent.setup();
    await user.click(trigger);
    await screen.findByRole("menu");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    expect(await screen.findByRole("menu")).toBeInTheDocument();
  });

  it.each([
    ["Enter", "{Enter}"],
    ["Space", " "],
  ])("opens with %s and restores focus across three keyboard-only cycles", async (_name, key) => {
    const { changeTab, trigger } = renderExport();
    const user = userEvent.setup();
    vi.mocked(downloadTextFile).mockClear();
    trigger.focus();
    expect(trigger).toHaveFocus();

    for (let cycle = 0; cycle < 3; cycle += 1) {
      await user.keyboard(key);
      expect(await screen.findByRole("menu")).toBeInTheDocument();
      expect(document.body.style.pointerEvents).toBe("");
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
      expect(trigger).toHaveFocus();
      expect(document.body.style.pointerEvents).toBe("");
      expect(changeTab).not.toHaveBeenCalled();
      expect(downloadTextFile).not.toHaveBeenCalled();
    }
  });

  it("selects CSV with the keyboard and restores trigger focus", async () => {
    const { trigger } = renderExport();
    const user = userEvent.setup();
    await user.click(trigger);
    await screen.findByRole("menu");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(downloadTextFile).toHaveBeenCalledWith(
      "keyword,volume,kd,cpc_usd,intent,source,tracked,variants",
      "keyword-research-fixture.csv",
      "text/csv;charset=utf-8",
    );
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(trigger).toHaveFocus();
  });
});
