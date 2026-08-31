import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVisitedMarks } from "./useVisitedMarks";

const KEY = "bisibility:search-insights:visited:prj_1";

describe("useVisitedMarks", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts with nothing seen and remembers what was opened, per project", () => {
    const { result } = renderHook(() => useVisitedMarks("prj_1"));

    expect(result.current.seen.size).toBe(0);

    act(() => result.current.mark("query:stored query"));

    expect(result.current.seen.has("query:stored query")).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? "[]")).toEqual(["query:stored query"]);
    expect(window.localStorage.getItem("bisibility:search-insights:visited:prj_2")).toBeNull();
  });

  it("reads what an earlier visit stored", () => {
    window.localStorage.setItem(KEY, JSON.stringify(["page:https://example.com/guide"]));

    const { result } = renderHook(() => useVisitedMarks("prj_1"));

    expect(result.current.seen.has("page:https://example.com/guide")).toBe(true);
  });

  it("treats unreadable storage as nothing seen, because the dot is only cosmetic", () => {
    window.localStorage.setItem(KEY, "not json");

    const { result } = renderHook(() => useVisitedMarks("prj_1"));

    expect(result.current.seen.size).toBe(0);

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });

    expect(() => act(() => result.current.mark("query:stored query"))).not.toThrow();
  });
});
