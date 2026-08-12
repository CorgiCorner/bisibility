import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("websiteProjectIdentity", () => {
  let websiteProjectIdentity: typeof import("./website.server").websiteProjectIdentity;

  beforeAll(async () => {
    ({ websiteProjectIdentity } = await import("./website.server"));
  });

  it("normalizes a full URL without changing its registrable website", () => {
    expect(
      websiteProjectIdentity("https://www.example.com/products/rank-tracker?source=onboarding"),
    ).toEqual({ domain: "example.com", name: "example" });
  });

  it("derives the name across a multi-label public suffix", () => {
    expect(websiteProjectIdentity("www.example.co.uk/about")).toEqual({
      domain: "example.co.uk",
      name: "example",
    });
  });

  it("rejects hosts without a registrable domain", () => {
    expect(() => websiteProjectIdentity("localhost:3000")).toThrow(
      "Enter a website like example.com.",
    );
  });
});
