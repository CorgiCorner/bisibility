import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it.each([
  ["write permission", "Previewing and creating runs require write permission."],
  [
    "owner identity",
    "A project key acts as the project owner. Quotes, consent records and the content deduplication window belong to the owner.",
  ],
  [
    "conditional replay",
    "An accepted quote can replay its saved admission only while its access, configuration, consent and saved attempt mappings remain valid.",
  ],
])("documents REST %s", (topic, text) => {
  const guide = readFileSync("docs/guides/model-playground.mdx", "utf8").replace(/\s+/g, " ");
  expect(guide).toContain(text);
  if (topic === "conditional replay") {
    expect(guide).toContain("A spent confirmation can also prevent replay.");
    expect(guide).toContain("A failed replay does not prove that earlier attempts were uncharged.");
    expect(guide).not.toContain("Reusing a quote returns its saved admission");
  }
});

it("documents the separate connection and legacy manual-cost surfaces", () => {
  const doc = readFileSync("docs/api/providers.mdx", "utf8");
  expect(doc).toContain("PATCH updates only `enabled` and `priority` for every provider");
  expect(doc).toContain("SERP and data providers can set `cost_per_check` on connect");
  expect(doc).toContain("Priority does not select or reorder Model Playground columns");
  expect(doc).toContain("Model connections reject `cost_per_check` on connect");
});

it("registers the public guide in navigation and uses the actual evidence labels", () => {
  const navigation = JSON.parse(readFileSync("docs/docs.json", "utf8"));
  const pages = (value: unknown): string[] =>
    typeof value === "string"
      ? [value]
      : Array.isArray(value)
        ? value.flatMap(pages)
        : value && typeof value === "object"
          ? Object.values(value).flatMap(pages)
          : [];
  expect(pages(navigation).filter((value) => value === "guides/model-playground")).toHaveLength(1);
  const guide = readFileSync("docs/guides/model-playground.mdx", "utf8");
  expect(guide).toContain("**Provider-returned sources**");
  expect(guide).toContain("**Citation occurrences**");
  expect(guide).toContain("POST /api/v1/projects/{id}/model-playground/runs");
  expect(guide).toContain("`Idempotency-Key` header");
  expect(guide).not.toContain("not available yet");
  expect(guide).not.toContain("Running\ncomparisons is not enabled");
});
