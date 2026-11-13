import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("prompt playground redirect", () => {
  it("keeps the query on the way to Model Playground and no longer owns a page", () => {
    const workspace = resolve("app/(regional)/app/(workspace)/[project]");
    const config = readFileSync("next.config.ts", "utf8");
    expect(existsSync(resolve(workspace, "prompt-playground/page.tsx"))).toBe(false);
    expect(existsSync(resolve(workspace, "prompt-playground/loading.tsx"))).toBe(false);
    expect(config).toContain('source: "/app/:project/prompt-playground"');
    expect(config).toContain('destination: "/app/:project/model-playground"');
  });
});
