import { describe, expect, it, vi } from "vitest";
import { deferredKeywordLocations } from "./deferred-keyword-location";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

describe("deferred location writes", () => {
  it("only persists a resolved location when the transaction is admitted", async () => {
    const row = {
      canonicalKey: "US",
      cityName: null,
      countryCode: "US",
      displayName: "United States",
      gl: "us",
      hl: "en",
      kind: "country" as const,
      languageCode: "en",
      languageLabel: "English",
      primaryGeoCode: null,
      primaryGeoName: "United States",
      regionCode: null,
      secondaryGeoName: "",
    };
    const upsert = vi.fn(async () => ({ ...row, id: "location_1" }));
    const client = { location: { findUnique: vi.fn(async () => null), upsert } };
    const deferred = deferredKeywordLocations(client as never);
    const staged = await deferred.store.create(row);
    expect(upsert).not.toHaveBeenCalled();
    expect(staged.id).toBe("pending:US");
    const ids = await deferred.flush(client as never);
    expect(upsert).toHaveBeenCalledOnce();
    expect(ids.get(staged.id)).toBe("location_1");
  });
});
