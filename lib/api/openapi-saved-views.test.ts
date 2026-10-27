import { describe, expect, it } from "vitest";
import { savedViewSchema } from "./openapi-saved-views";

describe("shared saved-view public schema", () => {
  it("documents real revisions/shared visibility and both versioned definitions without an owner field", () => {
    expect(savedViewSchema.properties).toMatchObject({
      created_by_id: { type: ["string", "null"], pattern: "^usr_[a-z][a-z0-9]{23}$" },
      revision: { minimum: 1 },
      visibility: { enum: ["project"] },
      definition: expect.any(Object),
    });
    expect(savedViewSchema.required).toEqual(
      expect.arrayContaining(["revision", "visibility", "definition", "created_by_id"]),
    );
    const source = JSON.stringify(savedViewSchema);
    expect(source).toContain('"page_size"');
    expect(source).toContain('"report_scope"');
    expect(source).toContain('"registry_version"');
    expect(source).not.toMatch(/owner_id|can_edit|pageSize|reportScope|registryVersion/);
  });
});
