import {
  type ProjectChainProps,
  type ProjectChainSnapshot,
  useProjectChainController,
} from "@/components/usagekit/provider-project-controller";
import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const snapshot = (identity: string): ProjectChainSnapshot => ({
  identity,
  revision: "one",
  entries: [
    { id: "a", label: "A", enabled: true, revision: "a1" },
    { id: "b", label: "B", enabled: true, revision: "b1" },
  ],
});
const props = (value: ProjectChainSnapshot): ProjectChainProps => ({
  mode: "project",
  snapshot: value,
  evidence: value,
  canEdit: true,
  onCommit: vi.fn(async (command) => ({
    commandId: command.commandId,
    outcome: "success" as const,
  })),
});

it("preserves an unsaved order when refreshed parent props carry a new revision", () => {
  const initial = props(snapshot("draft-refresh"));
  const view = renderHook(useProjectChainController, { initialProps: initial });
  act(() => view.result.current.change([...initial.snapshot.entries].reverse()));
  const latest = { ...initial.snapshot, revision: "two" };
  view.rerender({ ...initial, snapshot: latest, evidence: latest });
  expect(view.result.current.draft.map((row) => row.id)).toEqual(["b", "a"]);
  expect(view.result.current.base.revision).toBe("one");
});

it("retains exactly the committed enabled-first order after success", async () => {
  const initial = props(snapshot("committed-order"));
  const view = renderHook(useProjectChainController, { initialProps: initial });
  act(() =>
    view.result.current.change([
      { ...initial.snapshot.entries[1], enabled: false },
      initial.snapshot.entries[0],
    ]),
  );
  await act(() => view.result.current.save());
  expect(initial.onCommit).toHaveBeenCalledWith(
    expect.objectContaining({
      entries: [
        { id: "a", enabled: true, expectedRevision: "a1" },
        { id: "b", enabled: false, expectedRevision: "b1" },
      ],
    }),
  );
  expect(view.result.current.base.entries.map((row) => row.id)).toEqual(["a", "b"]);
  expect(view.result.current.draft).toEqual(view.result.current.base.entries);
});
