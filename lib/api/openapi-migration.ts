import { ref } from "./openapi-components";

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
  "400": response(ref("Problem"), "Bad request"),
  "401": response(ref("Problem"), "Unauthorized"),
  "409": response(ref("Problem"), "Conflict"),
  "413": response(ref("Problem"), "Payload too large"),
  "419": response(ref("Problem"), "Migration token invalid or expired"),
  "423": response(ref("Problem"), "Project read-only"),
  "429": response(ref("Problem"), "Rate limited"),
  "500": response(ref("Problem"), "Import failed"),
};
const sessionProblemResponses = {
  ...migrationProblemResponses,
  "404": response(ref("Problem"), "Import session not found"),
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
        "429": response(ref("Problem"), "Rate limited"),
      },
      summary: "Check cloud import schema compatibility",
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
      summary: "Create a chunked cloud import session",
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
      summary: "Upload one chunk to a cloud import session",
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
      summary: "Finalize a chunked cloud import session",
    },
  },
};
