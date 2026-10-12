import { act, renderHook } from "@testing-library/react";
import { expect, test } from "vitest";
import type { ProjectChainProps, ProjectChainSnapshot } from "./provider-project-controller";
import { useProjectChainController } from "./provider-project-controller";

function snapshot(): ProjectChainSnapshot {
  return {
    identity: crypto.randomUUID(),
    revision: "v1",
    entries: [
      { id: "a", label: "Alpha", enabled: true, revision: "a1" },
      { id: "b", label: "Beta", enabled: true, revision: "b1" },
    ],
  };
}

test.each(["conflict", "forbidden"] as const)(
  "fresh props recover a terminal %s without an explicit reload callback",
  async (outcome) => {
    const initial = snapshot();
    const props: ProjectChainProps = {
      mode: "project",
      snapshot: initial,
      evidence: initial,
      canEdit: true,
      onCommit: async (command) => ({ commandId: command.commandId, outcome }),
    };
    const r = renderHook(useProjectChainController, { initialProps: props });
    act(() => r.result.current.change([...initial.entries].reverse()));
    await act(async () => r.result.current.save());
    expect(r.result.current.editable).toBe(false);
    const fresh = { ...initial, revision: "v2" };
    r.rerender({ ...props, snapshot: fresh, evidence: fresh });
    expect(r.result.current.editable).toBe(true);
    expect(r.result.current.draft.map((row) => row.id)).toEqual(["a", "b"]);
  },
);

test("undoing a dirty draft accepts its deferred snapshot", () => {
  const initial = snapshot();
  const props: ProjectChainProps = {
    mode: "project",
    snapshot: initial,
    evidence: initial,
    canEdit: true,
    onCommit: async (command) => ({ commandId: command.commandId, outcome: "success" }),
  };
  const r = renderHook(useProjectChainController, { initialProps: props });
  act(() => r.result.current.change([...initial.entries].reverse()));
  const fresh = {
    ...initial,
    revision: "v2",
    entries: initial.entries.map((row) => ({ ...row, revision: row.revision + "next" })),
  };
  r.rerender({ ...props, snapshot: fresh, evidence: fresh });
  expect(r.result.current.base.revision).toBe("v1");
  act(() => r.result.current.change(initial.entries));
  expect(r.result.current.base.revision).toBe("v2");
  expect(r.result.current.draft.map((row) => row.revision)).toEqual(["a1next", "b1next"]);
});

test("a host reload keeps control over a conflicting dirty draft", async () => {
  const initial = snapshot();
  const fresh = { ...initial, revision: "v2" };
  const props: ProjectChainProps = {
    mode: "project",
    snapshot: initial,
    evidence: initial,
    canEdit: true,
    onCommit: async (command) => ({ commandId: command.commandId, outcome: "conflict" }),
    onReload: async () => fresh,
  };
  const r = renderHook(useProjectChainController, { initialProps: props });
  act(() => r.result.current.change([...initial.entries].reverse()));
  await act(async () => r.result.current.save());
  r.rerender({ ...props, snapshot: fresh, evidence: fresh });
  expect(r.result.current.base.revision).toBe("v1");
  expect(r.result.current.draft.map((row) => row.id)).toEqual(["b", "a"]);
  await act(async () => r.result.current.reload());
  expect(r.result.current.base.revision).toBe("v2");
  expect(r.result.current.editable).toBe(true);
});

test.each(["add", "remove"] as const)(
  "fresh props recover a dirty draft after a connection is %s",
  (kind) => {
    const initial = snapshot();
    const props: ProjectChainProps = {
      mode: "project",
      snapshot: initial,
      evidence: initial,
      canEdit: true,
      onCommit: async (command) => ({ commandId: command.commandId, outcome: "success" }),
    };
    const r = renderHook(useProjectChainController, { initialProps: props });
    act(() => r.result.current.change([...initial.entries].reverse()));
    const fresh = {
      ...initial,
      revision: "v2",
      entries:
        kind === "add"
          ? [...initial.entries, { id: "c", label: "Gamma", enabled: true, revision: "c1" }]
          : initial.entries.filter((row) => row.id !== "b"),
    };
    r.rerender({ ...props, snapshot: fresh, evidence: fresh });
    expect(r.result.current.base.revision).toBe("v2");
    expect(r.result.current.editable).toBe(true);
  },
);

test("deferred refresh retains notice of a rejected write until the next edit", async () => {
  const initial = snapshot();
  const props: ProjectChainProps = {
    mode: "project",
    snapshot: initial,
    evidence: initial,
    canEdit: true,
    onCommit: async (command) => ({ commandId: command.commandId, outcome: "conflict" }),
  };
  const r = renderHook(useProjectChainController, { initialProps: props });
  act(() => r.result.current.change([...initial.entries].reverse()));
  const fresh = { ...initial, revision: "v2" };
  r.rerender({ ...props, snapshot: fresh, evidence: fresh });
  await act(async () => r.result.current.save());
  expect(r.result.current.base.revision).toBe("v2");
  expect(r.result.current.editable).toBe(true);
  expect(r.result.current.notice).toBe("not_applied");
  act(() => r.result.current.change([...fresh.entries].reverse()));
  expect(r.result.current.notice).toBeNull();
});
