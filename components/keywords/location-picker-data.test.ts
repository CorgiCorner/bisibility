import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  countryOptions,
  countryValueForCode,
  resetInvalidSearchResponseReport,
  useLocationSearch,
} from "./location-picker-data";

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

  it("keeps a cached region from the search contract as a selectable suggestion", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            canonical_key: "ES/Andalusia",
            city_name: null,
            country_code: "ES",
            display_name: "Andalusia, Spain",
            hl: "es",
            id: "location:region:ES/Andalusia",
            kind: "region",
            language_code: "es",
            language_label: "Spanish",
            region_code: null,
            region_name: "Andalusia",
          },
        ],
      }),
    } as Response);
    const { result } = renderHook(() => useLocationSearch(null));

    await search(result, "Andalusia");

    expect(result.current.suggestions).toEqual([
      expect.objectContaining({ canonicalKey: "ES/Andalusia", kind: "region" }),
    ]);
  });
});

describe("offline country picker data", () => {
  it("exposes the expanded Google SERP country catalog", () => {
    expect(countryOptions).toEqual(
      expect.arrayContaining(
        ["CZ", "SK", "HU", "RO", "UA", "GR", "KR", "ID", "AR"].map((code) =>
          expect.objectContaining({ code }),
        ),
      ),
    );
    expect(countryValueForCode("CZ")).toMatchObject({
      canonicalKey: "CZ",
      displayName: "Czechia",
      hl: "cs",
      kind: "country",
    });
  });
});
