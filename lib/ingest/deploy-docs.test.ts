import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const docs = readFileSync(resolve(process.cwd(), "docs/api/deploy-webhooks.mdx"), "utf8");
const examplePaths = [
  "examples/deploy-webhooks/vercel.md",
  "examples/deploy-webhooks/netlify.md",
  "examples/deploy-webhooks/amplify-eventbridge.md",
];

describe("deploy webhook documentation", () => {
  it("states the authentication trust boundary and numeric limits", () => {
    expect(docs).toContain("does not verify provider-native webhook signatures");
    expect(docs).toMatch(/ingest token\s+is the only authentication/);
    expect(docs).toMatch(/60 anonymous requests per\s+client address per minute/);
    expect(docs).toMatch(/600\s+authenticated requests per hook per minute/);
    expect(docs).toContain("Query tokens can appear in proxy, CDN, and access logs.");
  });

  it.each(examplePaths)("%s matches the replay and security policy", (path) => {
    const example = readFileSync(resolve(process.cwd(), path), "utf8");

    expect(example).toContain("does not verify provider-native webhook signatures");
    expect(example).toMatch(/ingest token\s+is the only authentication/);
    expect(example).toMatch(/60 anonymous requests/);
    expect(example).toMatch(/600 authenticated requests/);
    expect(example).toMatch(/deployment identifier.*60 minutes/s);
  });
});
