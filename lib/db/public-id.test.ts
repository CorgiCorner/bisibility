import { describe, expect, it } from "vitest";
import {
  isPublicIdOfType,
  isValidPublicId,
  makePublicId,
  PUBLIC_ID_RESOURCE_REGISTRY,
  type PublicId,
  parsePublicId,
  parsePublicIdOfType,
} from "./public-id";

const suffix = "abcdefghijklmnopqrstuvwx";

function requirePublicId(value: PublicId) {
  return value;
}

describe("public ID v3", () => {
  it("maps every addressable resource through the typed registry", () => {
    expect(PUBLIC_ID_RESOURCE_REGISTRY).toEqual({
      al: "triggeredAlert",
      alr: "alertRule",
      audit: "auditLog",
      check: "rankCheck",
      cmp: "competitor",
      conn: "providerConnection",
      dwh: "ingestHook",
      ferry: "migrationToken",
      imp: "cloudImportJob",
      inv: "invite",
      key: "apiKey",
      kw: "keyword",
      mbr: "membership",
      ntf: "notification",
      pat: "personalAccessToken",
      prj: "project",
      sid: "session",
      sig: "signal",
      svkw: "savedKeyword",
      tag: "tag",
      usr: "user",
      viw: "savedView",
      we: "webhookEndpoint",
    });
  });

  it("creates a lowercase CUID2-formatted ID that parses back to its resource", () => {
    const publicId = makePublicId("prj");

    expect(publicId).toMatch(/^prj_[a-z][a-z0-9]{23}$/);
    expect(parsePublicId(publicId)).toEqual({
      prefix: "prj",
      resource: "project",
      suffix: publicId.slice("prj_".length),
      value: publicId,
    });
  });

  it("round-trips each registry prefix deterministically", () => {
    for (const [prefix, resource] of Object.entries(PUBLIC_ID_RESOURCE_REGISTRY)) {
      const publicId = `${prefix}_${suffix}`;

      expect(isValidPublicId(publicId)).toBe(true);
      expect(parsePublicId(publicId)).toEqual({ prefix, resource, suffix, value: publicId });
      if (isValidPublicId(publicId)) {
        expect(requirePublicId(publicId)).toBe(publicId);
      }
    }
  });

  it("rejects legacy, malformed, secret, and non-resource values", () => {
    const rejected = [
      "prj_7Kd2Qf9m",
      "prj_Abcdefghijklmnopqrstuvwx",
      "prj_abcdefghijklmnopqrstuvwx_more",
      "prj_sample_abcdefghijklmnopqrstuvwx",
      "mig_abcdefghijklmnopqrstuvwx",
      "bsb_key_live_not_a_public_id",
      "bsb_pat_live_abcdefghijklmnopqrstuvwx",
      "bih_live_abcdefghijklmnopqrstuvwx",
      "bks_abcdefghijklmnopqrstuvwx",
      "cmcuidv1identifierwithoutaprefix",
      "unknown_abcdefghijklmnopqrstuvwx",
    ];

    for (const publicId of rejected) {
      expect(isValidPublicId(publicId)).toBe(false);
      expect(parsePublicId(publicId)).toBeNull();
    }
  });

  it("does not recognize the legacy sample marker until its data migration", () => {
    expect(parsePublicId(`prj_sample_${suffix}`)).toBeNull();
  });

  it("requires both a valid v3 ID and the expected resource prefix", () => {
    const projectId = `prj_${suffix}`;

    expect(parsePublicIdOfType(projectId, "prj")).toMatchObject({
      prefix: "prj",
      resource: "project",
      value: projectId,
    });
    expect(parsePublicIdOfType(projectId, "kw")).toBeNull();
    expect(isPublicIdOfType(projectId, "prj")).toBe(true);
    expect(isPublicIdOfType(projectId, "kw")).toBe(false);
    expect(isPublicIdOfType("project_internal_1", "prj")).toBe(false);
  });
});
