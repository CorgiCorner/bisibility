import { ProjectMarketStatus } from "@/lib/generated/prisma/client";
import { notFound, permanentRedirect } from "@/tests/next-navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  resolveProjectAccess: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { projectMarket: { findFirst: mocks.findFirst, findUnique: mocks.findUnique } },
}));
vi.mock("@/lib/queries/_auth", () => ({ resolveProjectAccess: mocks.resolveProjectAccess }));

import {
  requireMarketContext,
  resolveLastMarketRef,
  resolveLegacyMarketRef,
} from "./market-context";

const PROJECT_REF = `prj_${"a".repeat(24)}`;
const PROJECT_ID = "project_internal_1";
const OTHER_PROJECT_ID = "project_internal_2";
const MARKET_REF = `pmkt_${"c".repeat(24)}`;
const LOCATION_ID = "location_internal_1";

function marketRow(overrides: Record<string, unknown> = {}) {
  return {
    location: { canonicalKey: "BE@ar" },
    locationId: LOCATION_ID,
    projectId: PROJECT_ID,
    publicId: MARKET_REF,
    status: ProjectMarketStatus.active,
    ...overrides,
  };
}

describe("requireMarketContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    permanentRedirect.mockImplementation((href: string) => {
      throw new Error(`NEXT_REDIRECT:${href}`);
    });
    mocks.resolveProjectAccess.mockResolvedValue({
      isSample: false,
      mode: "member",
      projectId: PROJECT_ID,
      publicId: PROJECT_REF,
    });
  });

  it("resolves an active market of this project from the URL alone", async () => {
    mocks.findUnique.mockResolvedValue(marketRow());

    await expect(requireMarketContext(PROJECT_REF, MARKET_REF)).resolves.toEqual({
      locationKey: "BE@ar",
      market: { locationId: LOCATION_ID, ref: MARKET_REF },
      projectId: PROJECT_ID,
      projectRef: PROJECT_REF,
    });
    expect(mocks.resolveProjectAccess).toHaveBeenCalledWith(PROJECT_REF);
  });

  it("answers 404 for an unknown market id", async () => {
    mocks.findUnique.mockResolvedValue(null);

    await expect(requireMarketContext(PROJECT_REF, MARKET_REF)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(permanentRedirect).not.toHaveBeenCalled();
  });

  it("answers 404, never a redirect, for a market belonging to another project", async () => {
    mocks.findUnique.mockResolvedValue(marketRow({ projectId: OTHER_PROJECT_ID }));

    await expect(requireMarketContext(PROJECT_REF, MARKET_REF)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(permanentRedirect).not.toHaveBeenCalled();
  });

  it("answers 404 for an archived market of another project too", async () => {
    mocks.findUnique.mockResolvedValue(
      marketRow({ projectId: OTHER_PROJECT_ID, status: ProjectMarketStatus.removed }),
    );

    await expect(requireMarketContext(PROJECT_REF, MARKET_REF)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(permanentRedirect).not.toHaveBeenCalled();
  });

  it("redirects an archived market of this project to the markets route with the note", async () => {
    mocks.findUnique.mockResolvedValue(marketRow({ status: ProjectMarketStatus.removed }));

    await expect(requireMarketContext(PROJECT_REF, MARKET_REF)).rejects.toThrow(
      `NEXT_REDIRECT:/app/${PROJECT_REF}/markets?archived-market=${MARKET_REF}`,
    );
  });

  it("never queries for a ref that is not a market publicId", async () => {
    await expect(requireMarketContext(PROJECT_REF, "loc_frankfurt")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});

describe("resolveLastMarketRef", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves a cookie naming an active market of this project", async () => {
    mocks.findUnique.mockResolvedValue(marketRow());

    await expect(resolveLastMarketRef(PROJECT_ID, MARKET_REF)).resolves.toBe(MARKET_REF);
  });

  it("refuses an absent, unknown, archived or other-project value", async () => {
    await expect(resolveLastMarketRef(PROJECT_ID, undefined)).resolves.toBeNull();

    mocks.findUnique.mockResolvedValue(null);
    await expect(resolveLastMarketRef(PROJECT_ID, MARKET_REF)).resolves.toBeNull();

    mocks.findUnique.mockResolvedValue(marketRow({ status: ProjectMarketStatus.removed }));
    await expect(resolveLastMarketRef(PROJECT_ID, MARKET_REF)).resolves.toBeNull();

    mocks.findUnique.mockResolvedValue(marketRow({ projectId: OTHER_PROJECT_ID }));
    await expect(resolveLastMarketRef(PROJECT_ID, MARKET_REF)).resolves.toBeNull();
  });

  it("refuses a malformed cookie value without a query", async () => {
    await expect(resolveLastMarketRef(PROJECT_ID, "evil;value")).resolves.toBeNull();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});

describe("resolveLegacyMarketRef", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts either identifier space the legacy lens used, scoped to this project", async () => {
    mocks.findFirst.mockResolvedValue({ publicId: MARKET_REF });

    await expect(resolveLegacyMarketRef(PROJECT_ID, LOCATION_ID)).resolves.toBe(MARKET_REF);
    expect(mocks.findFirst).toHaveBeenCalledWith({
      select: { publicId: true },
      where: {
        OR: [{ publicId: LOCATION_ID }, { locationId: LOCATION_ID }],
        projectId: PROJECT_ID,
        status: { in: [ProjectMarketStatus.active, ProjectMarketStatus.paused] },
      },
    });
  });

  it("resolves nothing for an empty or unmatched value", async () => {
    await expect(resolveLegacyMarketRef(PROJECT_ID, undefined)).resolves.toBeNull();
    await expect(resolveLegacyMarketRef(PROJECT_ID, "")).resolves.toBeNull();

    mocks.findFirst.mockResolvedValue(null);
    await expect(resolveLegacyMarketRef(PROJECT_ID, "loc_gone")).resolves.toBeNull();
  });
});
