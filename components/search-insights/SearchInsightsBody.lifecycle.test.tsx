import type { LoadSearchInsightsRowsAction } from "@/lib/actions/search-insights-rows";
import { act, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as t from "./SearchInsightsBody.test-helpers";

const mocks = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock("@/components/ui/toast-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/ui/toast-context")>()),
  useToast: () => ({ showToast: mocks.showToast }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
});
function search(kind: "pages" | "queries") {
  fireEvent.change(document.getElementById(`search-insights-${kind}-search`)!, {
    target: { value: "rank" },
  });
}

describe("SearchInsightsBody async ownership", () => {
  it.each(["queries", "pages"] as const)(
    "cancels a pending %s search when its owner unmounts",
    async (kind) => {
      const loadRowsAction = vi.fn<LoadSearchInsightsRowsAction>(async () => ({
        kind: "queries",
        rows: [],
        total: 0,
        trackedTexts: [],
      }));
      const { unmount } = t.renderBody({ loadRowsAction });
      search(kind);
      unmount();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(loadRowsAction).not.toHaveBeenCalled();
    },
  );

  it("does not present a failed read after its owner unmounts", async () => {
    let reject!: (error: Error) => void;
    const loadRowsAction = vi.fn<LoadSearchInsightsRowsAction>(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    const { unmount } = t.renderBody({ loadRowsAction });
    search("queries");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(loadRowsAction).toHaveBeenCalledOnce();
    unmount();
    await act(async () => {
      reject(new Error("Failed read"));
    });
    expect(mocks.showToast).not.toHaveBeenCalled();
  });

  it("still reports a failed read while the owner is mounted", async () => {
    const loadRowsAction = vi
      .fn<LoadSearchInsightsRowsAction>()
      .mockRejectedValue(new Error("Failed read"));
    t.renderBody({ loadRowsAction });
    search("queries");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(loadRowsAction).toHaveBeenCalledOnce();
    expect(mocks.showToast).toHaveBeenCalledOnce();
  });
});
