import { renderWithProjectRunsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RunPage } from "./RunPage";
import { runPageFixture } from "./RunPageFixtures";
import type { RunPageItem } from "./RunPageTypes";

const realtime = vi.hoisted(() => ({ version: 0 }));
vi.mock("@/components/shell/AppRealtimeProvider", () => ({
  useAppRealtime: () => ({ operations: [], rankDataVersion: realtime.version }),
}));
const first = {
  ...runPageFixture.items[0],
  id: "a",
  keyword: { ...runPageFixture.items[0].keyword, text: "Alpha" },
  finishedAt: "2026-10-24T01:00:00Z",
};
const second = {
  ...first,
  id: "b",
  keyword: { ...first.keyword, text: "Beta" },
  finishedAt: "2026-10-24T00:00:00Z",
};
const completedRun = {
  ...runPageFixture.run,
  status: "completed" as const,
  finishedAt: "2026-10-24T03:00:00Z",
};
function page(items: RunPageItem[], cursor: string | null = null, terminal = false) {
  return (
    <RunPage
      {...runPageFixture}
      items={items}
      nextCursor={cursor}
      run={terminal ? completedRun : runPageFixture.run}
      canMutate
      projectRef="prj_example"
    />
  );
}
function order() {
  return screen
    .getAllByRole("row")
    .flatMap((row) =>
      ["Alpha", "Beta", "Gamma", "Zeta"].filter((text) => row.textContent?.includes(text)),
    );
}
afterEach(() => {
  realtime.version = 0;
  vi.unstubAllGlobals();
});
describe("run targets held realtime results", () => {
  it.each([false, true])("holds realtime reordering and additions=%s until show", async (add) => {
    const view = render(page([first, second]));
    const incoming = [
      { ...second, finishedAt: "2026-10-24T02:00:00Z" },
      first,
      ...(add ? [{ ...first, id: "c", keyword: { ...first.keyword, text: "Gamma" } }] : []),
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: incoming, meta: { next_cursor: null } }),
      }),
    );
    const before = order();
    realtime.version = 1;
    view.rerender(page(incoming));
    await screen.findByText("New results");
    expect(order()).toEqual(before);
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(order()).toEqual(["Beta", ...(add ? ["Gamma"] : []), "Alpha"]);
    expect(document.activeElement).toHaveAttribute("aria-labelledby", "run-targets-title");
  });
  it("applies user filtering immediately while results are held", async () => {
    const runningFirst = { ...first, status: "running" as const };
    const view = render(page([runningFirst, second]));
    view.rerender(
      page([{ ...second, status: "completed", finishedAt: "2026-10-24T02:00:00Z" }, runningFirst]),
    );
    expect(screen.getByText("New results")).toBeVisible();
    fireEvent.click(screen.getByRole("radio", { name: "Completed" }));
    expect(screen.queryByText("New results")).toBeNull();
    expect(order()).toEqual(["Beta"]);
  });
  it("applies user pagination immediately and clears the held update", async () => {
    const view = render(page([first, second], "next-page", true));
    view.rerender(
      page([{ ...first, keyword: { ...first.keyword, text: "Zeta" } }, second], "next-page", true),
    );
    expect(screen.getByText("New results")).toBeVisible();
    const third = { ...first, id: "c", keyword: { ...first.keyword, text: "Gamma" } };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [third], meta: { next_cursor: null } }),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Gamma");
    expect(screen.queryByText("New results")).toBeNull();
    expect(order()).toEqual(["Beta", "Gamma", "Zeta"]);
  });
});
