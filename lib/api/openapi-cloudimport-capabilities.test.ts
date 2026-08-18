import { describe, expect, it } from "vitest";
import { API_VERSION_HEADER } from "./api-versions";
import { getCapabilities, getLlmsText } from "./capabilities";
import { getOpenApiDocument } from "./openapi";
import { ref } from "./openapi-components";
import type { Parameter } from "./openapi-test-helpers";

describe("OpenAPI document", () => {
  it("documents cloud import migration-token operations", () => {
    const doc = getOpenApiDocument();
    const importOperation = doc.paths["/cloud/import"].post;
    const createSession = doc.paths["/cloud/import/sessions"].post;
    const uploadChunk = doc.paths["/cloud/import/sessions/{sessionId}/chunks/{index}"].put;
    const finalizeSession = doc.paths["/cloud/import/sessions/{sessionId}/finalize"].post;
    const compatibility = doc.paths["/cloud/import/compatibility"].get;

    expect(doc.components.securitySchemes).toMatchObject({
      MigrationToken: { bearerFormat: "mig_...", scheme: "bearer", type: "http" },
    });
    expect(importOperation).toMatchObject({
      operationId: "importCloudExport",
      requestBody: { content: { "application/json": { schema: ref("CloudImportPackage") } } },
      security: [{ MigrationToken: [] }],
    });
    expect(createSession.responses).toMatchObject({
      "201": expect.any(Object),
      "409": expect.any(Object),
      "419": expect.any(Object),
      "423": expect.any(Object),
    });
    expect(doc.components.schemas.CloudImportSessionCreate.required).toContain("source_project_id");
    expect(doc.components.schemas.CloudImportCompetitor).toMatchObject({
      properties: { id: { pattern: "^cmp_[a-z][a-z0-9]{23}$" } },
      required: ["id", "domain"],
    });
    expect(doc.components.schemas.CloudImportAlertRuleTarget).toMatchObject({
      discriminator: { propertyName: "type" },
      oneOf: [ref("CloudImportKeywordAlertTarget"), ref("CloudImportTagAlertTarget")],
    });
    expect(doc.components.schemas.CloudImportAlertRule.properties.severity).toMatchObject({
      enum: ["info", "warning", "urgent"],
    });
    expect(uploadChunk).toMatchObject({
      operationId: "uploadCloudImportChunk",
      requestBody: { content: { "application/json": { schema: ref("CloudImportUploadChunk") } } },
    });
    expect((uploadChunk.parameters as Parameter[]).map((parameter) => parameter.name)).toEqual([
      API_VERSION_HEADER,
      "sessionId",
      "index",
      "Content-Encoding",
    ]);
    expect(finalizeSession).toMatchObject({
      requestBody: {
        content: {
          "application/json": {
            schema: { additionalProperties: false, properties: {}, type: "object" },
          },
        },
      },
      responses: { "200": expect.any(Object) },
    });
    expect(compatibility).toMatchObject({
      operationId: "getCloudImportCompatibility",
      responses: { "200": expect.any(Object), "429": expect.any(Object) },
    });
  });

  it("exposes signal operations as capabilities", () => {
    expect(getCapabilities()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "createSignal", operationId: "createSignal" }),
        expect.objectContaining({ name: "listSignals", operationId: "listSignals" }),
      ]),
    );
  });

  it("exposes cloud import operations as capabilities", () => {
    const capabilities = getCapabilities();

    expect(capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "importCloudExport" }),
        expect.objectContaining({ name: "createCloudImportSession" }),
        expect.objectContaining({ name: "uploadCloudImportChunk" }),
        expect.objectContaining({ name: "finalizeCloudImportSession" }),
        expect.objectContaining({ name: "getCloudImportCompatibility" }),
      ]),
    );
    expect(
      capabilities.find((tool) => tool.name === "uploadCloudImportChunk")?.input_schema,
    ).toMatchObject({
      additionalProperties: false,
      properties: {
        checksum: { pattern: "^sha256:[0-9a-f]{64}$" },
        session_id: { pattern: "^imp_[a-z][a-z0-9]{23}$" },
      },
      required: ["session_id", "index", "checksum", "kind"],
    });
    expect(
      capabilities.find((tool) => tool.name === "createCloudImportSession")?.input_schema,
    ).toMatchObject({
      additionalProperties: false,
      properties: {
        source_project_id: { pattern: "^prj_[a-z][a-z0-9]{23}$" },
        version: { const: 5 },
      },
      required: ["version", "chunk_count", "source_project_id"],
    });
    expect(
      capabilities.find((tool) => tool.name === "importCloudExport")?.input_schema,
    ).not.toHaveProperty("properties.migration_token");
    expect(getLlmsText()).not.toMatch(/Migration-Token|migration_token body/);
  });
});
