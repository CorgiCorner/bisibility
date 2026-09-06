import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  VISIBILITY_DESCRIPTION,
  VISIBILITY_REQUIRED_DEPTH_COPY,
  VISIBILITY_SHALLOW_CHECK_COPY,
  VISIBILITY_UNKNOWN_DEPTH_COPY,
} from "./definition";

async function cloudImportDocs() {
  const page = await readFile(resolve("docs/api/cloud-import.mdx"), "utf8");
  return page;
}

function requestedDepthRow(docs: string) {
  const row = docs.split("\n").find((line) => line.startsWith("| `requestedDepth`"));
  if (!row) throw new Error("Missing requestedDepth documentation row.");
  return row.replaceAll(/\s+/g, " ");
}

describe("Visibility definition copy", () => {
  it("keeps the import documentation aligned with the product definition", async () => {
    const docs = await cloudImportDocs();
    const normalizedDocs = docs.replaceAll(/\s+/g, " ");
    const requestedDepth = requestedDepthRow(docs);

    expect(normalizedDocs).toContain(VISIBILITY_DESCRIPTION);
    expect(normalizedDocs).toContain(VISIBILITY_SHALLOW_CHECK_COPY);
    expect(requestedDepth).toContain(VISIBILITY_REQUIRED_DEPTH_COPY);
    expect(requestedDepth).toContain(VISIBILITY_UNKNOWN_DEPTH_COPY);
  });
});
