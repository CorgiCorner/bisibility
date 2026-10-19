import { ref } from "./openapi-components";
import { problemResponse } from "./openapi-problem";

function json(schema: object) {
  return { "application/json": { schema } };
}

function response(schema: object, description = "JSON response") {
  return { content: json(schema), description };
}

const stringSchema = { type: "string" };
const jobIdSchema = { pattern: "^imp_[a-z][a-z0-9]{23}$", type: "string" };

function pathParameter(name: string, schema: object = stringSchema) {
  return { in: "path", name, required: true, schema };
}

const migrationSecurity = [{ MigrationToken: [] }];
const migrationProblemResponses = {
  "400": problemResponse("Bad request"),
  "401": problemResponse("Unauthorized"),
  "409": problemResponse("Conflict"),
  "413": problemResponse("Payload too large"),
  "419": problemResponse("Migration token invalid or expired"),
  "423": problemResponse("Project read-only"),
  "429": problemResponse("Rate limited"),
  "500": problemResponse("Import failed"),
};
const sessionProblemResponses = {
  ...migrationProblemResponses,
  "404": problemResponse("Import session not found"),
};

export const migrationSecuritySchemes = {
  MigrationToken: {
    bearerFormat: "mig_...",
    description: "Migration token sent as `Authorization: Bearer mig_...`.",
    scheme: "bearer",
    type: "http",
  },
};

export const migrationPaths = {
  "/cloud/import": {
    post: {
      operationId: "importCloudExport",
      requestBody: { content: json(ref("CloudImportPackage")), required: true },
      responses: {
        "201": response(ref("CloudImportFinalizeResponse"), "Import completed"),
        ...migrationProblemResponses,
      },
      security: migrationSecurity,
      summary: "Import an export package with a migration token",
    },
  },
  "/cloud/import/compatibility": {
    get: {
      operationId: "getCloudImportCompatibility",
      responses: {
        "200": response(ref("CloudImportCompatibility"), "Compatibility preflight"),
        "429": problemResponse("Rate limited"),
      },
      summary: "Check instance import schema compatibility",
    },
  },
  "/cloud/import/sessions": {
    post: {
      operationId: "createCloudImportSession",
      requestBody: { content: json(ref("CloudImportSessionCreate")), required: true },
      responses: {
        "201": response(ref("CloudImportSessionCreateResponse"), "Import session created"),
        ...migrationProblemResponses,
      },
      security: migrationSecurity,
      summary: "Create a chunked instance import session",
    },
  },
  "/cloud/import/sessions/{sessionId}/chunks/{index}": {
    put: {
      operationId: "uploadCloudImportChunk",
      parameters: [
        pathParameter("sessionId", jobIdSchema),
        pathParameter("index", { minimum: 0, type: "integer" }),
        {
          description: "Set to gzip when the JSON chunk body is gzip compressed.",
          in: "header",
          name: "Content-Encoding",
          required: false,
          schema: { enum: ["gzip"], type: "string" },
        },
      ],
      requestBody: { content: json(ref("CloudImportUploadChunk")), required: true },
      responses: {
        "200": response(ref("CloudImportChunkResponse"), "Chunk accepted"),
        ...sessionProblemResponses,
      },
      security: migrationSecurity,
      summary: "Upload one chunk to an instance import session",
    },
  },
  "/cloud/import/sessions/{sessionId}/finalize": {
    post: {
      operationId: "finalizeCloudImportSession",
      parameters: [pathParameter("sessionId", jobIdSchema)],
      requestBody: {
        content: json({ additionalProperties: false, properties: {}, type: "object" }),
        required: false,
      },
      responses: {
        "200": response(ref("CloudImportFinalizeResponse"), "Import session finalized"),
        ...sessionProblemResponses,
      },
      security: migrationSecurity,
      summary: "Finalize a chunked instance import session",
    },
  },
};
