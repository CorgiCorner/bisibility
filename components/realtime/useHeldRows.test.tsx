import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useHeldRows } from "./useHeldRows";

const a = { id: "a", value: 1 };
const b = { id: "b", value: 2 };
function setup() {
  return renderHook(({ rows, scope, version }) => useHeldRows(rows, scope, version), {
    initialProps: { rows: [a, b], scope: "default", version: 0 },
  });
}
describe("held realtime rows", () => {
  it.each([[[b, a]], [[b, a, { id: "c", value: 3 }]]])(
    "holds realtime order and new rows until show",
    (incoming) => {
      const view = setup();
      view.rerender({ rows: incoming, scope: "default", version: 1 });
      expect(view.result.current.rows.map((row) => row.id)).toEqual(["a", "b"]);
      expect(view.result.current.pending).toBe(true);
      act(() => view.result.current.show());
      expect(view.result.current.rows).toEqual(incoming);
      expect(view.result.current.pending).toBe(false);
    },
  );
  it("arms before delayed server props and updates existing values without a banner", () => {
    const view = setup();
    const input = view.result.current.rows;
    view.rerender({ rows: input, scope: "default", version: 1 });
    view.rerender({ rows: [{ ...a, value: 4 }, b], scope: "default", version: 1 });
    expect(view.result.current.rows[0].value).toBe(4);
    expect(view.result.current.pending).toBe(false);
  });
  it.each(["sort", "filter", "search", "pagination", "market"])(
    "applies user %s immediately and clears held results",
    (scope) => {
      const view = setup();
      view.rerender({ rows: [b, a], scope: "default", version: 1 });
      view.rerender({ rows: [b, a], scope, version: 1 });
      expect(view.result.current.rows).toEqual([b, a]);
      expect(view.result.current.pending).toBe(false);
    },
  );
  it("applies action results immediately even while a realtime refresh is pending", () => {
    const view = setup();
    act(() => view.result.current.immediate());
    view.rerender({ rows: [b], scope: "default", version: 1 });
    expect(view.result.current.rows).toEqual([b]);
    expect(view.result.current.pending).toBe(false);
  });
  it("applies user mutations without a new realtime invalidation even with a held update", () => {
    const view = setup();
    view.rerender({ rows: [b, a], scope: "default", version: 1 });
    view.rerender({ rows: [b], scope: "default", version: 1 });
    expect(view.result.current.rows).toEqual([b]);
    expect(view.result.current.pending).toBe(false);
  });
  it("holds child order and additions within expanded groups", () => {
    const row = { id: "group", subRows: [a, b] };
    const view = renderHook(({ rows, version }) => useHeldRows(rows, "grouped", version), {
      initialProps: { rows: [row], version: 0 },
    });
    view.rerender({ rows: [{ ...row, subRows: [b, { ...a, value: 9 }] }], version: 1 });
    expect(view.result.current.rows[0].subRows).toEqual([{ ...a, value: 9 }, b]);
    expect(view.result.current.pending).toBe(true);
  });
});
