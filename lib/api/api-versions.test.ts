import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getApiVersionCapabilities } from "./api-versions";

describe("API version contract", () => {
  it("advertises exactly the API versions backed by versioned route directories", () => {
    const routedVersions = readdirSync(join(process.cwd(), "app/api"), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory() && /^v\d+$/.test(entry.name))
      .map((entry) => entry.name)
      .sort();

    expect(getApiVersionCapabilities().apiVersions).toEqual(routedVersions);
  });
});
