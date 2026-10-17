import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { getMcpToolDefinitions } from "./definitions";

const root = join(process.cwd(), "plugins/bisibility");
const definitions = getMcpToolDefinitions();
const names = new Set(definitions.map((tool) => tool.name));
const prefixes = new Set(definitions.map((tool) => tool.name.split("_")[0]));
// These identifiers are intentionally documented as tools that do not exist.
const DOCUMENTED_NON_TOOLS = new Set([
  "get_audit_status",
  "get_audit_issues",
  "get_audit_pages",
  // A reserved report kind; ai_* tools make its noun prefix a candidate too.
  "ai_visibility",
]);

function schemaProperties(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => [
    ...(key === "properties" && child && typeof child === "object" ? Object.keys(child) : []),
    ...schemaProperties(child),
  ]);
}

const properties = new Set(definitions.flatMap((tool) => schemaProperties(tool.inputSchema)));

function markdownFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? markdownFiles(path) : entry.name.endsWith(".md") ? [path] : [];
  });
}

const files = [join(root, "README.md"), ...markdownFiles(join(root, "skills"))];
const documents = files.map((path) => ({ path, text: readFileSync(path, "utf8") }));

describe("plugin skill MCP tool references", () => {
  it.each([...DOCUMENTED_NON_TOOLS])("keeps documented non-tool %s current", (name) => {
    expect(names.has(name), `Documented non-tool is now a real tool: ${name}`).toBe(false);
    expect(
      documents.some((document) => document.text.includes(`\`${name}\``)),
      `Stale documented non-tool: ${name}`,
    ).toBe(true);
  });

  it.each(documents)("uses only exposed tool names in $path", ({ path, text }) => {
    const identifiers = [...text.matchAll(/`([a-z][a-z0-9_]*)`/g)]
      .map((match) => match[1])
      .filter((name) => name.includes("_") && prefixes.has(name.split("_")[0]));
    const unknown = [
      ...new Set(
        identifiers.filter(
          (name) => !names.has(name) && !properties.has(name) && !DOCUMENTED_NON_TOOLS.has(name),
        ),
      ),
    ];
    expect(unknown, `Unknown MCP tools in ${relative(root, path)}: ${unknown.join(", ")}`).toEqual(
      [],
    );
  });
});
