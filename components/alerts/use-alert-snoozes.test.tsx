import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useAlertSnoozes } from "./use-alert-snoozes";

it("counts a snoozed ID once after refresh and rolls back only the failed ID", () => {
  const { result, rerender } = renderHook(
    ({ count, ids }) => useAlertSnoozes("project", count, ids),
    {
      initialProps: { count: 0, ids: [] as string[] },
    },
  );
  let rollback!: () => void;
  act(() => {
    rollback = result.current.snooze("first", "Keyword one");
  });
  act(() => {
    result.current.snooze("second", "Keyword two");
  });
  expect(result.current.count).toBe(2);
  rerender({ count: 1, ids: ["second"] });
  expect(result.current.count).toBe(2);
  act(rollback);
  expect([...result.current.ids]).toEqual(["second"]);
  expect(result.current.count).toBe(1);
  rerender({ count: 2, ids: ["second", "third"] });
  expect(result.current.count).toBe(2);
  rerender({ count: 0, ids: [] });
  expect(result.current.count).toBe(0);
  expect(result.current.ids.size).toBe(0);
});

it("does not leak local snoozes into another project", () => {
  const { result, rerender } = renderHook(({ project }) => useAlertSnoozes(project, 0, []), {
    initialProps: { project: "one" },
  });
  act(() => {
    result.current.snooze("first", "Keyword");
  });
  rerender({ project: "two" });
  expect(result.current.count).toBe(0);
  expect(result.current.ids.size).toBe(0);
});
