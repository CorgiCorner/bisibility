import { describe, expect, it } from "vitest";
import {
  businessDomainCandidateKey,
  businessNameCandidateKey,
  identifiersFromMapsUrl,
  normalizeGoogleMapsUrl,
  opaqueBusinessIdentifier,
} from "./identity-normalization";
import { identitySnapshotSchema } from "./schema";
import { cidA, identifier } from "./test-fixtures";

const userinfoMapsUrl = new URL("https://www.google.com/maps");
userinfoMapsUrl.username = "synthetic-user";
userinfoMapsUrl.password = "synthetic-password";

describe("opaque branch identity", () => {
  it("preserves large CID, leading zeros, and Place ID bytes without numeric conversion", () => {
    expect(opaqueBusinessIdentifier(cidA, "cid")).toEqual({ ok: true, value: cidA });
    expect(opaqueBusinessIdentifier("0000123", "cid")).toEqual({ ok: true, value: "0000123" });
    expect(opaqueBusinessIdentifier("ChIJ_AbCd-123", "place_id")).toEqual({
      ok: true,
      value: "ChIJ_AbCd-123",
    });
  });
  it.each([Number(cidA), Infinity, NaN, 1.5])("never repairs an unsafe numeric CID %s", (value) => {
    expect(opaqueBusinessIdentifier(value, "cid")).toEqual({
      ok: false,
      reason: "unsafe_numeric_identifier",
    });
  });
  it.each([3, 123n, "", " 123", "12\n3", "-123", "1e3"])(
    "rejects non-text or malformed CID %s",
    (value) => {
      expect(opaqueBusinessIdentifier(value, "cid").ok).toBe(false);
    },
  );
  it("keeps Unicode/accent distinctions in weak name keys and treats domain only as a candidate key", () => {
    expect(businessNameCandidateKey("  ŻÓŁW  Firma  ")).toBe("żółw firma");
    expect(businessNameCandidateKey("Zolw Firma")).not.toBe(businessNameCandidateKey("Żółw Firma"));
    expect(businessDomainCandidateKey("https://www.firma.example/branch/a")).toBe("firma.example");
    expect(businessDomainCandidateKey("javascript:alert(1)")).toBeNull();
  });
});

describe("safe configured Maps metadata", () => {
  it("allows explicit Google Maps HTTPS paths and extracts only supported query IDs", () => {
    expect(
      identifiersFromMapsUrl(
        `https://www.google.com/maps?cid=${cidA}&query_place_id=ChIJ_AbCd-123`,
      ),
    ).toEqual([
      { type: "cid", value: cidA },
      { type: "place_id", value: "ChIJ_AbCd-123" },
    ]);
    expect(identifiersFromMapsUrl("https://maps.google.com/?q=place_id%3AChIJ_AbCd-123")).toEqual([
      { type: "place_id", value: "ChIJ_AbCd-123" },
    ]);
    expect(
      identifiersFromMapsUrl("https://www.google.com/maps/place/example/data=!4m1!3m1"),
    ).toEqual([]);
  });
  it.each([
    "http://www.google.com/maps",
    "https://maps.app.goo.gl/short",
    "https://goo.gl/maps/short",
    "https://google.com.evil.example/maps",
    "https://www.google.com/url?q=x",
    userinfoMapsUrl.toString(),
    "https://www.google.com:8443/maps",
    "https://www.google.com/maps?cid=12\n3",
  ])("refuses unsupported Maps URL without resolving it: %s", (url) => {
    expect(normalizeGoogleMapsUrl(url)).toBeNull();
  });
  it("rejects contradictory or malformed query IDs instead of picking the first", () => {
    expect(() => identifiersFromMapsUrl("https://www.google.com/maps?cid=123&cid=456")).toThrow(
      "Conflicting",
    );
    expect(() =>
      identifiersFromMapsUrl("https://www.google.com/maps?query_place_id=A&place_id=B"),
    ).toThrow("Conflicting");
    expect(() => identifiersFromMapsUrl("https://www.google.com/maps?cid=1e3")).toThrow("Invalid");
  });
  it("validates finite coordinate ranges and textual configured IDs", () => {
    for (const coordinates of [
      { latitude: 91, longitude: 0 },
      { latitude: 0, longitude: 181 },
      { latitude: NaN, longitude: 0 },
      { latitude: 0, longitude: Infinity },
    ]) {
      expect(identitySnapshotSchema.safeParse({ name: "Branch", coordinates }).success).toBe(false);
    }
    expect(identitySnapshotSchema.parse({ name: "Unverified branch" }).identifiers).toEqual([]);
    expect(
      identitySnapshotSchema.safeParse({
        name: "Branch",
        identifiers: [{ ...identifier("cid", cidA), value: Number(cidA) }],
      }).success,
    ).toBe(false);
  });
});
