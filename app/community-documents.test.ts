import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { GET as getAgreement } from "@/app/CLA.md/route";
import { GET as getContributing } from "@/app/CONTRIBUTING.md/route";
import { describe, expect, it } from "vitest";

describe("community document routes", () => {
  it.each([
    ["CLA.md", getAgreement],
    ["CONTRIBUTING.md", getContributing],
  ] as const)("keeps /%s available after moving its source", async (filename, handler) => {
    const source = await readFile(join(process.cwd(), ".github", filename), "utf8");
    const response = await handler();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.text()).toBe(source.endsWith("\n") ? source : `${source}\n`);
  });
});
