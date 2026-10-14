import { describe, expect, it } from "vitest";
import { measurementRecovery } from "./recovery";

const id = `prj_${"a".repeat(24)}`;
describe("named settings recovery", () => {
  it.each(["provider_missing", "provider_disabled", "provider_disconnected", "needs_reauth"])(
    "points %s to the installed connection page, not policy configuration",
    (reason) => {
      expect(measurementRecovery(id, reason)).toEqual({
        href: `/app/${id}/integrations`,
        label: "provider",
      });
    },
  );
  it("separates missing defaults, active geography and actual policy", () => {
    expect(measurementRecovery(id, "defaults_missing").label).toBe("defaults");
    expect(measurementRecovery(id, "default_geo_unavailable").label).toBe("market");
    expect(measurementRecovery(id, "measurement_policy_unconfigured").label).toBe("policy");
    expect(measurementRecovery(id, "source_unavailable").label).toBe("review");
  });
});
