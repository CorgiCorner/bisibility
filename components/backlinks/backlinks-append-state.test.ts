import type { LoadMoreBacklinkRowsAction } from "@/lib/actions/backlinks";
import type { BacklinksSnapshot } from "@/lib/backlinks/types";
import type { Dispatch, SetStateAction } from "react";
import { expect, it, vi } from "vitest";
import { loadMoreWorkspaceRows } from "./backlinks-append-state";

it("advances the continuation before a second append without charging cumulative cost", async () => {
  let visible = {
    snapshotRef: "initial",
    rows: [],
    includeSubdomains: true,
    target: "example.com",
    targetScope: "site",
    provider: "dataforseo",
    fetchedRowCount: 100,
  } as unknown as BacklinksSnapshot;
  const action = vi.fn(async (_input: unknown) => ({
    ...visible,
    ok: true,
    snapshotRef: "next",
    costCents: 1,
    rows: [],
    fetchedRowCount: 200,
  }));
  const spend = vi.fn();
  const setSnapshot: Dispatch<SetStateAction<BacklinksSnapshot | null>> = (update) => {
    const next = typeof update === "function" ? update(visible) : update;
    if (next) visible = next;
  };
  await loadMoreWorkspaceRows(
    action as LoadMoreBacklinkRowsAction,
    "prj_example",
    visible,
    spend,
    setSnapshot,
  );
  expect(visible.snapshotRef).toBe("next");
  await loadMoreWorkspaceRows(
    action as LoadMoreBacklinkRowsAction,
    "prj_example",
    visible,
    spend,
    setSnapshot,
  );
  expect(action.mock.lastCall?.[0]).toMatchObject({ snapshotRef: "next" });
  expect(spend.mock.calls).toEqual([[1], [1]]);
});
