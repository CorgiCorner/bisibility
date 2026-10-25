import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runPageFixture } from "./RunPageFixtures";
import type { RunPageItem } from "./RunPageTypes";
import { useRunPageItems } from "./useRunPageItems";

const first: RunPageItem = { ...runPageFixture.items[0], id: "first", status: "running" as const };
const second = { ...first, id: "second" };
const response = (items: RunPageItem[], cursor: string | null) => ({
  ok: true,
  json: async () => ({ data: items, meta: { next_cursor: cursor } }),
});
const onError = vi.fn();
function setup() {
  return renderHook(
    ({ version, items, project }) =>
      useRunPageItems(
        { projectRef: project, runId: "run_1" },
        items,
        "page-2",
        version,
        onError,
        "refresh-error",
      ),
    { initialProps: { version: 0, items: [first], project: "prj_1" } },
  );
}
describe("RunPage loaded target pages", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    onError.mockClear();
  });
  it("refreshes every loaded page without dropping rows order or the pagination cursor", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response([second], "page-3")));
    const view = setup();
    await act(async () => view.result.current.loadMore());
    expect(view.result.current.cursor).toBe("page-3");
    vi.mocked(fetch).mockImplementation(
      async (url) =>
        response(
          [{ ...(String(url).includes("cursor=") ? second : first), status: "completed" }],
          "different-boundary",
        ) as unknown as Response,
    );
    view.rerender({ version: 1, items: [first], project: "prj_1" });
    await act(async () => {});
    expect(view.result.current.items.map((item) => [item.id, item.status])).toEqual([
      ["first", "completed"],
      ["second", "completed"],
    ]);
    expect(view.result.current.cursor).toBe("page-3");
    expect(fetch).toHaveBeenCalledWith(
      "/api/rank-check-runs/run_1/items?project=prj_1&limit=20",
      expect.anything(),
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/rank-check-runs/run_1/items?project=prj_1&limit=50&cursor=page-2",
      expect.anything(),
    );
  });
  it("keeps loaded pages and their cursor when the first server page refreshes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response([second], "page-3")));
    const view = setup();
    await act(async () => view.result.current.loadMore());
    view.rerender({ version: 0, items: [{ ...first, status: "completed" }], project: "prj_1" });
    expect(view.result.current.items.map((item) => item.id)).toEqual(["first", "second"]);
    expect(view.result.current.items[0].status).toBe("completed");
    expect(view.result.current.cursor).toBe("page-3");
  });
  it("ignores obsolete realtime reads after a newer refresh", async () => {
    let resolveOld: (value: unknown) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveOld = resolve;
            }),
        )
        .mockResolvedValue(response([{ ...first, status: "completed" }], null)),
    );
    const view = setup();
    view.rerender({ version: 1, items: [first], project: "prj_1" });
    view.rerender({ version: 2, items: [first], project: "prj_1" });
    await act(async () => {});
    await act(async () => resolveOld(response([first], null)));
    expect(view.result.current.items[0].status).toBe("completed");
    expect(onError).not.toHaveBeenCalled();
  });
  it("discards load-more responses belonging to a previous project", async () => {
    let resolveOld: (value: unknown) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      ),
    );
    const view = setup();
    let pending: Promise<void>;
    act(() => {
      pending = view.result.current.loadMore();
    });
    view.rerender({ version: 0, items: [first], project: "prj_2" });
    await act(async () => {
      resolveOld(response([second], null));
      await pending;
    });
    expect(view.result.current.items.map((item) => item.id)).toEqual(["first"]);
    expect(view.result.current.cursor).toBe("page-2");
  });
  it("retains loaded data on a failed refresh and reports the existing error copy", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("unavailable")));
    const view = setup();
    view.rerender({ version: 1, items: [first], project: "prj_1" });
    await act(async () => {});
    expect(view.result.current.items).toEqual([first]);
    expect(onError).toHaveBeenCalledWith("refresh-error");
  });
  it("does not duplicate a page when load-more requests finish together", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response([second], "page-3")));
    const view = setup();
    await act(async () =>
      Promise.all([view.result.current.loadMore(), view.result.current.loadMore()]),
    );
    vi.mocked(fetch).mockClear();
    view.rerender({ version: 1, items: [first], project: "prj_1" });
    await act(async () => {});
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(view.result.current.items.map((item) => item.id)).toEqual(["first", "second"]);
  });
});
