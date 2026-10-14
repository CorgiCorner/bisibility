import { describe, expect, it } from "vitest";
import {
  identityDefaults,
  identityFormSchema,
  identityInput,
  identityPatch,
  reviewedIdentityDraft,
} from "./identity-form";
import { northBranch } from "./test-fixtures";

const draft = () => ({
  ...identityDefaults(northBranch.identity),
  reason: "Reviewed branch identity",
});
const userinfoMapsUrl = new URL("https://www.google.com/maps");
userinfoMapsUrl.username = "synthetic-user";
userinfoMapsUrl.password = "synthetic-password";
describe("business identity form boundary", () => {
  it("preserves a CID beyond the safe integer range as exact opaque text", () => {
    expect(identityInput(draft()).identifiers?.[0]).toEqual({
      namespace: "google_business",
      engine: "google",
      type: "cid",
      value: "18446744073709551615",
    });
    expect(
      identityFormSchema.safeParse({ ...draft(), cid: Number("18446744073709551615") }).success,
    ).toBe(false);
  });
  it.each(["1e3", "+123", "123 456", "\uFEFF123"])("rejects malformed textual CID %j", (cid) => {
    expect(identityFormSchema.safeParse({ ...draft(), cid }).success).toBe(false);
  });
  it.each([
    { latitude: "91", longitude: "21" },
    { latitude: "52", longitude: "" },
    { latitude: "Infinity", longitude: "21" },
    { latitude: "52,23", longitude: "21" },
  ])("validates coordinate pairs %j", (coordinates) => {
    expect(identityFormSchema.safeParse({ ...draft(), ...coordinates }).success).toBe(false);
  });
  it("supports exact zero coordinates and explicit coordinate removal", () => {
    expect(identityInput({ ...draft(), latitude: "0", longitude: "-0" }).coordinates).toEqual({
      latitude: 0,
      longitude: -0,
    });
    expect(
      identityPatch({ ...draft(), latitude: "", longitude: "" }, northBranch.identity),
    ).toEqual({ coordinates: null });
  });
  it.each([
    "https://maps.app.goo.gl/example",
    "https://google.com.evil.test/maps",
    userinfoMapsUrl.toString(),
    "http://www.google.com/maps",
  ])("rejects unsafe Maps URL %s", (mapsUrl) => {
    expect(identityFormSchema.safeParse({ ...draft(), mapsUrl }).success).toBe(false);
  });
  it("sends only the changed field, preserving untouched address, coordinates, IDs and Maps URL", () => {
    expect(identityPatch({ ...draft(), name: "New branch name" }, northBranch.identity)).toEqual({
      name: "New branch name",
    });
    expect(identityPatch(draft(), northBranch.identity)).toBeNull();
  });
  it("requires a reason and rejects actor/auth fields", () => {
    expect(identityFormSchema.safeParse({ ...draft(), reason: "  " }).success).toBe(false);
    expect(identityFormSchema.safeParse({ ...draft(), actorId: "forged" }).success).toBe(false);
  });
  it("rebases only after explicit review: retains changed groups and refreshes untouched optional fields", () => {
    const latest = {
      ...northBranch,
      identity: {
        ...northBranch.identity,
        revision: 4,
        revisionId: "identity-v4",
        name: "Server name",
        address: "Updated address",
        coordinates: { latitude: 53, longitude: 22 },
      },
    };
    const rebased = reviewedIdentityDraft(
      { ...draft(), name: "My draft", cid: "999" },
      northBranch.identity,
      latest,
    );
    expect(rebased.name).toBe("My draft");
    expect(rebased.address).toBe("Updated address");
    expect(rebased.latitude).toBe("53");
    expect(rebased.longitude).toBe("22");
    expect(rebased.cid).toBe("999");
    expect(rebased.placeId).toBe("ChIJExampleNorth");
    expect(rebased.reason).toBe("Reviewed branch identity");
    expect(identityPatch(rebased, latest.identity)).toEqual({
      name: "My draft",
      identifiers: [
        { namespace: "google_business", engine: "google", type: "cid", value: "999" },
        {
          namespace: "google_business",
          engine: "google",
          type: "place_id",
          value: "ChIJExampleNorth",
        },
      ],
    });
  });
});
