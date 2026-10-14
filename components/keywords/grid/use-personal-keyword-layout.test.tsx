import type { KeywordPersonalViewContext } from "@/lib/saved-views/keyword-personal-context";
import { emptyTablePresentation } from "@/lib/saved-views/presentation-model";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePersonalKeywordLayout } from "./use-personal-keyword-layout";

const columns = [
  { id: "keyword", size: 200, meta: { lockVisible: true } },
  { id: "volume", size: 100 },
];
const context = {
  presentation: {
    ...emptyTablePresentation,
    columnOrder: ["volume", "keyword"],
    visibility: { volume: false },
  },
} satisfies Pick<KeywordPersonalViewContext, "presentation">;
describe("personal keyword table layout", () => {
  it("uses the session-projected layout and keeps the locked keyboard column", () => {
    const { result } = renderHook(() => usePersonalKeywordLayout(context, columns));
    expect(result.current.order).toEqual(["volume", "keyword"]);
    expect(result.current.visibility).toEqual({ keyword: true, volume: false });
    act(() => result.current.setVisibility({ keyword: false, volume: true }));
    expect(result.current.visibility.keyword).toBe(true);
    expect(result.current.visibility.volume).toBe(true);
  });
  it("discards a draft without writing any measurement command", () => {
    const { result } = renderHook(() => usePersonalKeywordLayout(context, columns));
    act(() => result.current.setOrder(["keyword", "volume"]));
    expect(result.current.order[0]).toBe("keyword");
    act(() => result.current.discard());
    expect(result.current.order).toEqual(["volume", "keyword"]);
  });
});
