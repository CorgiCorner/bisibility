// Every API error goes through errorResponse (lib/api/responses.ts), which sends RFC 9457
// problem documents. The spec must declare that media type, not application/json.
export const PROBLEM_CONTENT_TYPE = "application/problem+json";

const problemSchemaRef = { $ref: "#/components/schemas/Problem" };

export function problemContent(schema: object = problemSchemaRef) {
  return { [PROBLEM_CONTENT_TYPE]: { schema } };
}

export function problemResponse(description: string, schema?: object) {
  return { content: problemContent(schema), description };
}

export const problemResponses = {
  "400": problemResponse("Bad request"),
  "401": problemResponse("Unauthorized"),
  "403": problemResponse("Forbidden"),
  "404": problemResponse("Not found"),
  "429": problemResponse("Rate limited"),
};
