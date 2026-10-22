import type { GooglePropertyOption } from "@/lib/integrations/types";
import { describe, expect, it } from "vitest";
import { defaultGoogleProperty } from "./google-property-grouping";

function property(kind: GooglePropertyOption["kind"], value: string): GooglePropertyOption {
  return { kind, label: value, permissionLevel: "siteOwner", value };
}

const projectDomain = "example.com";

describe("defaultGoogleProperty", () => {
  it("uses the preferred property when it is listed", () => {
    expect(
      defaultGoogleProperty({
        options: [
          property("domain", "sc-domain:example.com"),
          property("url-prefix", "https://other.example.org/"),
        ],
        preferred: "https://other.example.org/",
        projectDomain,
      }),
    ).toBe("https://other.example.org/");
  });

  it("ignores a preferred value that is not listed and selects the matching domain property", () => {
    expect(
      defaultGoogleProperty({
        options: [
          property("domain", "sc-domain:aaa.example.org"),
          property("domain", "sc-domain:example.com"),
        ],
        preferred: "sc-domain:missing.example.org",
        projectDomain,
      }),
    ).toBe("sc-domain:example.com");
  });

  it("prefers a matching domain property over an earlier url prefix", () => {
    expect(
      defaultGoogleProperty({
        options: [
          property("url-prefix", "https://example.com/"),
          property("domain", "sc-domain:example.com"),
        ],
        projectDomain,
      }),
    ).toBe("sc-domain:example.com");
  });

  it("matches a subdomain and a www host against the project domain", () => {
    expect(
      defaultGoogleProperty({
        options: [
          property("domain", "sc-domain:aaa.example.org"),
          property("url-prefix", "https://www.blog.example.com/"),
        ],
        projectDomain: "www.example.com",
      }),
    ).toBe("https://www.blog.example.com/");
    expect(
      defaultGoogleProperty({
        options: [
          property("url-prefix", "https://other.example.org/"),
          property("domain", "sc-domain:www.example.com"),
        ],
        projectDomain,
      }),
    ).toBe("sc-domain:www.example.com");
  });

  it("keeps the first analytics property because its id does not match a domain", () => {
    expect(
      defaultGoogleProperty({
        options: [property("ga4", "properties/123"), property("ga4", "properties/456")],
        projectDomain,
      }),
    ).toBe("properties/123");
  });

  it("returns an empty string when there are no options", () => {
    expect(
      defaultGoogleProperty({
        options: [],
        preferred: "sc-domain:example.com",
        projectDomain,
      }),
    ).toBe("");
  });
});
