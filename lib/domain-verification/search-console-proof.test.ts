import { describe, expect, it } from "vitest";
import { matchesSearchProperty } from "./search-console-proof";

describe("Search Console domain proof", () => {
  it.each(["sc-domain:example.com", "https://example.com/"])("accepts %s", (propertyKey) => {
    expect(
      matchesSearchProperty("example.com", {
        propertyKey,
        status: "active",
        permissionLevel: "siteOwner",
      }),
    ).toBe(true);
  });
  it("accepts a URL prefix only for its specific target host", () => {
    expect(
      matchesSearchProperty(
        "example.com",
        {
          propertyKey: "https://www.example.com/",
          status: "active",
          permissionLevel: "siteFullUser",
        },
        "www.example.com",
      ),
    ).toBe(true);
  });
  it.each([
    { propertyKey: "sc-domain:example.org", status: "active", permissionLevel: "siteOwner" },
    { propertyKey: "https://www.example.com/", status: "active", permissionLevel: "siteOwner" },
    { propertyKey: "https://example.com/subpath", status: "active", permissionLevel: "siteOwner" },
    { propertyKey: "sc-domain:example.com", status: "archived", permissionLevel: "siteOwner" },
    {
      propertyKey: "sc-domain:example.com",
      status: "active",
      permissionLevel: "siteRestrictedUser",
    },
    { propertyKey: "sc-domain:example.com", status: "active", permissionLevel: null },
  ])("rejects insufficient proof %#", (property) => {
    expect(matchesSearchProperty("example.com", property)).toBe(false);
  });
});
