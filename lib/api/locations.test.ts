import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchApiLocations } from "./locations";

const mocks = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./locations-search", () => ({ searchLocations: mocks.search }));

function context(search: string) {
  return {
    headers: new Headers({ "RateLimit-Remaining": "99" }),
    url: new URL(`https://example.test/api/v1/locations/search${search}`),
  };
}

describe("location search REST endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.search.mockResolvedValue({
      candidates: [
        {
          canonical_key: "US/Texas/Austin",
          city_name: "Austin",
          country_code: "US",
          display_name: "Austin, Texas, United States",
          hl: "en",
          kind: "city",
          language_label: "English",
          region_code: "TX",
          region_name: "Texas",
        },
      ],
      warning: null,
    });
  });

  it("maps canonical keys and forwards bounded search input", async () => {
    const response = await searchApiLocations(context("?q=Austin&country=US&limit=25"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      data: [{ display_name: "Austin, Texas, United States", location_key: "US/Texas/Austin" }],
      meta: { next_cursor: null },
    });
    expect(body.data[0]).not.toHaveProperty("id");
    expect(mocks.search).toHaveBeenCalledWith({ country: "US", limit: 25, query: "Austin" });
  });

  it.each(["?q=A", "?q=Austin&limit=101"])("rejects invalid query %s", async (search) => {
    await expect(searchApiLocations(context(search))).rejects.toThrow();
    expect(mocks.search).not.toHaveBeenCalled();
  });
});
