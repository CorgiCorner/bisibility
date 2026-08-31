import { act, renderHook } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { useDrawerStack } from "./useDrawerStack";

function stack() {
  const body = document.createElement("div");
  const ref = createRef<HTMLElement | null>() as { current: HTMLElement | null };
  ref.current = body;
  return { ...renderHook(() => useDrawerStack(ref)), body };
}

describe("useDrawerStack", () => {
  it("opens on a fresh stack, which has nothing to go back to", () => {
    const { result } = stack();

    act(() => result.current.open({ kind: "list", which: "band" }));

    expect(result.current.opened).toBe(true);
    expect(result.current.frame).toEqual({ kind: "list", which: "band" });
    expect(result.current.back).toBeNull();
  });

  it("names the frame Back would return to, never the one on screen", () => {
    const { result } = stack();

    act(() => result.current.open({ kind: "list", which: "overlap" }));
    act(() => result.current.push({ kind: "query", query: "stored query" }));

    expect(result.current.back).toBe("Page overlap");

    act(() =>
      result.current.push({ kind: "page", path: "/guide", url: "https://example.com/guide" }),
    );

    expect(result.current.back).toBe("stored query");
    expect(result.current.frame).toEqual({
      kind: "page",
      path: "/guide",
      url: "https://example.com/guide",
    });
  });

  it("returns the customer to the offset they left the previous frame at", () => {
    const { result, body } = stack();

    act(() => result.current.open({ kind: "list", which: "band" }));
    body.scrollTop = 420;
    act(() => result.current.push({ kind: "query", query: "stored query" }));

    // The frame the row opened starts at the top, not part way down the list behind it.
    expect(body.scrollTop).toBe(0);

    act(() => result.current.pop());

    expect(body.scrollTop).toBe(420);
    expect(result.current.frame).toEqual({ kind: "list", which: "band" });
    expect(result.current.back).toBeNull();
  });

  it("closes when there is nothing left to pop, and keeps the frame until the panel is gone", () => {
    const { result } = stack();

    act(() => result.current.open({ kind: "query", query: "stored query" }));
    act(() => result.current.pop());

    expect(result.current.opened).toBe(false);
    // The frame outlives the close so the panel has something to render while it slides out.
    expect(result.current.frame).not.toBeNull();

    act(() => result.current.reset());

    expect(result.current.frame).toBeNull();
  });

  it("starts a new stack rather than pushing onto the one left behind", () => {
    const { result } = stack();

    act(() => result.current.open({ kind: "list", which: "band" }));
    act(() => result.current.push({ kind: "query", query: "stored query" }));
    act(() =>
      result.current.open({ kind: "page", path: "/guide", url: "https://example.com/guide" }),
    );

    expect(result.current.back).toBeNull();
  });
});
