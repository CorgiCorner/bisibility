import { MCP_TOOL_NAMES } from "@/lib/mcp/canonical-tools";
import { describe, expect, it, vi } from "vitest";
import { capabilitiesCatalogMetadata, getCapabilities } from "./capabilities";
import { capabilities } from "./discovery";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

const catalog = getCapabilities();
const canonicalToolNames = new Set<string>(MCP_TOOL_NAMES);

type CatalogSchema = {
  properties?: Record<string, unknown>;
  required?: readonly string[];
};

type CatalogEntry = (typeof catalog)[number];

function entrySchema(entry: CatalogEntry): CatalogSchema {
  return entry.input_schema as CatalogSchema;
}

function entryByName(name: string) {
  return catalog.find((entry) => entry.name === name);
}

describe("capabilities catalog", () => {
  it("documents transport-level authentication once at the served top level", async () => {
    const response = capabilities({ headers: new Headers() });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.authentication).toEqual(capabilitiesCatalogMetadata.authentication);
    expect(body.description).toBe(capabilitiesCatalogMetadata.description);
    expect(body.authentication).toEqual({ scheme: "bearer", scope: "read write admin" });
  });

  it("keeps api_key out of every tool input schema", () => {
    expect(catalog.length).toBeGreaterThan(0);

    for (const entry of catalog) {
      const schema = entrySchema(entry);
      expect(schema.properties, entry.name).not.toHaveProperty("api_key");
      expect(schema.required ?? [], entry.name).not.toContain("api_key");
    }
  });

  it("gives addCompetitor its required domain field", () => {
    const entry = entryByName("addCompetitor");
    expect(entry).toBeDefined();

    const schema = entrySchema(entry as CatalogEntry);
    expect(schema.properties?.domain).toBeDefined();
    expect(schema.required).toContain("domain");
  });

  it("maps every catalog entry to a canonical MCP tool or an explicit null", () => {
    expect(catalog.length).toBeGreaterThan(0);

    for (const entry of catalog) {
      expect(entry, entry.name).toHaveProperty("mcp_tool");
      expect(entry.mcp_tool, entry.name).not.toBeUndefined();
      expect(
        entry.mcp_tool === null || canonicalToolNames.has(entry.mcp_tool),
        `${entry.name} -> ${String(entry.mcp_tool)}`,
      ).toBe(true);
    }

    expect(entryByName("listKeywords")?.mcp_tool).toBe("list_keywords");
    expect(entryByName("estimateSerpCost")?.mcp_tool).toBe("get_cost_estimate");
  });

  it("keeps the explicit-null set limited to operations without an MCP counterpart", () => {
    const unmapped = catalog
      .filter((entry) => entry.mcp_tool === null)
      .map((entry) => entry.name)
      .sort();

    expect(unmapped).toEqual([
      "createCloudImportSession",
      "finalizeCloudImportSession",
      "importCloudExport",
      "uploadCloudImportChunk",
    ]);
  });
});
