import { describe, expect, it } from "vitest";
import { publicAuditTargetIdOrNull, redactAuditIds, requiredPublicId } from "./audit-public-values";

const id = (prefix: string) => `${prefix}_abcdefghijklmnopqrstuvwx`;

describe("audit public value projection", () => {
  it.each([
    ["alert_rule", "alr"],
    ["api_key", "key"],
    ["cloud_import_job", "imp"],
    ["competitor", "cmp"],
    ["ingest_hook", "dwh"],
    ["invite", "inv"],
    ["keyword", "kw"],
    ["keyword_schedule", "kw"],
    ["membership", "mbr"],
    ["migration_token", "ferry"],
    ["notification", "ntf"],
    ["personal_access_token", "pat"],
    ["project", "prj"],
    ["project_defaults", "prj"],
    ["provider_connection", "conn"],
    ["rank_check", "check"],
    ["saved_keyword", "svkw"],
    ["saved_view", "viw"],
    ["session", "sid"],
    ["signal", "sig"],
    ["sitemap_monitor", "prj"],
    ["tag", "tag"],
    ["triggered_alert", "al"],
    ["user", "usr"],
    ["webhook_endpoint", "we"],
  ])("keeps the expected %s public ID", (targetType, prefix) => {
    expect(publicAuditTargetIdOrNull(id(prefix), targetType)).toBe(id(prefix));
    expect(publicAuditTargetIdOrNull(id("prj"), targetType)).toBe(
      prefix === "prj" ? id("prj") : null,
    );
  });

  it("omits non-addressable and wrong-prefix target IDs", () => {
    for (const targetType of [
      "authentication",
      "authorization",
      "instance_ops",
      "slack_connection",
      "system",
      "unknown_resource",
    ]) {
      expect(publicAuditTargetIdOrNull(id("prj"), targetType)).toBeNull();
    }
    expect(publicAuditTargetIdOrNull(id("al"), "alert_rule")).toBeNull();
  });

  it("requires the expected public prefix for required values", () => {
    expect(requiredPublicId(id("usr"), "Actor", "usr")).toBe(id("usr"));
    expect(() => requiredPublicId(id("prj"), "Actor", "usr")).toThrow(
      "Actor public ID is not available.",
    );
  });

  it("redacts only exact identifier fields", () => {
    const raw = "clx0123456789abcdefghijklm";
    expect(
      redactAuditIds({
        id: raw,
        nested: { previousAdministratorIds: [raw, 42] },
        valid: raw,
      }),
    ).toEqual({
      id: "[redacted]",
      nested: { previousAdministratorIds: ["[redacted]", "[redacted]"] },
      valid: raw,
    });
  });
});
