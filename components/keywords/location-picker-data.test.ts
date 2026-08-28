import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetInvalidSearchResponseReport, useLocationSearch } from "./location-picker-data";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

async function search(result: { current: ReturnType<typeof useLocationSearch> }, term: string) {
  act(() => result.current.search(term));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(180);
  });
}

const invalidJsonBody = { data: [{ canonical_key: "US", display_name: "United States" }] };

describe("useLocationSearch invalid responses", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    resetInvalidSearchResponseReport();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("reports a text/html response and returns an empty suggestion list", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    fetchMock.mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "text/html" }),
      json: () => Promise.reject(new SyntaxError('Unexpected token "<"')),
    } as Response);
    const { result } = renderHook(() => useLocationSearch(null));

    await search(result, "Austin");

    expect(result.current.suggestions).toEqual([]);
    expect(warning).toHaveBeenCalledOnce();
    expect(warning).toHaveBeenCalledWith(
      "[locations] Ignoring an invalid location-search response.",
    );
  });

  it("reports an invalid JSON-shaped response once across two searches", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    fetchMock.mockResolvedValue({ ok: true, json: async () => invalidJsonBody } as Response);
    const { result } = renderHook(() => useLocationSearch(null));

    await search(result, "Austin");
    await search(result, "Dallas");

    expect(result.current.suggestions).toEqual([]);
    expect(warning).toHaveBeenCalledOnce();
  });

  it("reports a fresh invalid response after resetting the report", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    fetchMock.mockResolvedValue({ ok: true, json: async () => invalidJsonBody } as Response);
    const { result } = renderHook(() => useLocationSearch(null));

    await search(result, "Austin");
    resetInvalidSearchResponseReport();
    await search(result, "Dallas");

    expect(warning).toHaveBeenCalledTimes(2);
  });
});
