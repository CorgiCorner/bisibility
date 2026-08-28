import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  getSession: vi.fn(),
  locationSearchMemberProjectId: vi.fn(),
  prisma: { membership: { findFirst: vi.fn() } },
  searchLocations: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/api/locations-search", () => ({
  locationSearchMemberProjectId: mocks.locationSearchMemberProjectId,
  searchLocations: mocks.searchLocations,
}));
vi.mock("@/lib/api/ratelimit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  rateLimitExceeded: () => new Response("limited", { status: 429 }),
}));

function request(query: string) {
  return new Request(`https://app.test/api/locations/search${query}`) as never;
}

describe("GET /api/locations/search", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.checkRateLimit.mockResolvedValue({ headers: new Headers(), success: true });
    mocks.locationSearchMemberProjectId.mockImplementation(async (userId, requested) => {
      if (!requested) {
        return null;
      }
      const membership = await mocks.prisma.membership.findFirst({
        select: { projectId: true },
        where: {
          userId,
          OR: [{ projectId: requested }, { project: { publicId: requested } }],
        },
      });
      return membership?.projectId ?? null;
    });
    mocks.searchLocations.mockResolvedValue({ candidates: [], warning: null });
    mocks.prisma.membership.findFirst.mockResolvedValue(null);
  });

  it("401s an unauthenticated request", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET(request("?q=Austin"));
    expect(response.status).toBe(401);
    expect(mocks.searchLocations).not.toHaveBeenCalled();
  });

  it("429s when the rate limit is exceeded", async () => {
    mocks.checkRateLimit.mockResolvedValue({ headers: new Headers(), success: false });
    const response = await GET(request("?q=Austin"));
    expect(response.status).toBe(429);
    expect(mocks.searchLocations).not.toHaveBeenCalled();
  });

  it("returns an empty list without querying when q is blank", async () => {
    const response = await GET(request("?q="));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual([]);
    expect(mocks.searchLocations).not.toHaveBeenCalled();
  });

  it("searches the cache for any authenticated user (no project required)", async () => {
    mocks.searchLocations.mockResolvedValue({
      candidates: [
        {
          canonical_key: "US/Texas/Austin",
          city_name: "Austin",
          country_code: "US",
          display_name: "Austin, Texas, United States",
          hl: "en",
          id: "location:US/Texas/Austin",
          kind: "city",
          language_code: "en",
          language_label: "English",
          region_code: "US-TX",
          region_name: "Texas",
        },
      ],
      warning: null,
    });

    const response = await GET(request("?q=Austin&country=United States"));
    const body = await response.json();

    expect(mocks.searchLocations).toHaveBeenCalledWith({
      country: "United States",
      projectId: null,
      query: "Austin",
    });
    expect(mocks.prisma.membership.findFirst).not.toHaveBeenCalled();
    expect(body.data).toHaveLength(1);
  });

  it("only enables project provider resolve when the caller is a member", async () => {
    mocks.prisma.membership.findFirst.mockResolvedValue({ projectId: "p_internal" });

    await GET(request("?q=Dallas&country=United States&project=prj_1"));

    expect(mocks.prisma.membership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "user_1" }),
      }),
    );
    expect(mocks.searchLocations).toHaveBeenCalledWith({
      country: "United States",
      projectId: "p_internal",
      query: "Dallas",
    });
  });

  it("surfaces the degrade warning via a response header", async () => {
    mocks.searchLocations.mockResolvedValue({ candidates: [], warning: "degraded to country" });
    const response = await GET(request("?q=Nowhere&country=United States&project=prj_1"));
    expect(response.headers.get("x-location-warning")).toBe("degraded to country");
  });

  it("returns candidates when the response contract does not match", async () => {
    const candidate = { canonical_key: "US", display_name: "United States" };
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.searchLocations.mockResolvedValue({ candidates: [candidate], warning: null });

    const response = await GET(request("?q=United States"));

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual([candidate]);
    expect(warning).toHaveBeenCalledOnce();
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining("data.0.city_name: Invalid input"),
    );
  });
});
