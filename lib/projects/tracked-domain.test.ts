import { describe, expect, it } from "vitest";
import {
  hasTrackedDomain,
  PROJECT_DOMAIN_REQUIRED_MESSAGE,
  ProjectDomainRequiredError,
  requireTrackedDomain,
} from "./tracked-domain";

describe("tracked project domain", () => {
  it("returns the stored domain when the user entered one", () => {
    expect(requireTrackedDomain({ domain: "example.com" })).toBe("example.com");
    expect(hasTrackedDomain({ domain: "example.com" })).toBe(true);
  });

  it.each([null, "", "   "])("treats %o as no domain", (domain) => {
    expect(hasTrackedDomain({ domain })).toBe(false);
    expect(() => requireTrackedDomain({ domain })).toThrow(ProjectDomainRequiredError);
  });

  it("treats a historical generated instance host as no domain", () => {
    const domain = "workspace-8abefb1f.bisibility.cloud";
    expect(hasTrackedDomain({ domain })).toBe(false);
    expect(() => requireTrackedDomain({ domain })).toThrow(PROJECT_DOMAIN_REQUIRED_MESSAGE);
  });

  it("points the user at the settings field", () => {
    expect(PROJECT_DOMAIN_REQUIRED_MESSAGE).toContain("Settings > Project details");
  });
});
