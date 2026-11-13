import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ image: vi.fn(), resolve: vi.fn() }));
vi.mock("@/lib/report-sharing/resolve", () => ({ resolveShareToken: mocks.resolve }));
vi.mock("@/lib/report-sharing/image", () => ({ shareReportImage: mocks.image }));

import { GET } from "./route";

describe("public report image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.image.mockResolvedValue(new Response("png"));
  });

  it("returns the same not-found response for an unknown token", async () => {
    mocks.resolve.mockResolvedValue(null);
    const response = await GET(new Request("https://example.com/r/token/image"), {
      params: Promise.resolve({ token: "token" }),
    });
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.image).not.toHaveBeenCalled();
  });
});
