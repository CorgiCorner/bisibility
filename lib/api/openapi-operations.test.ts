import { describe, expect, it } from "vitest";
import { withRequiredBody } from "./openapi-operations";

describe("withRequiredBody", () => {
  it("marks an existing request body as required", () => {
    expect(withRequiredBody({ requestBody: { content: { "application/json": {} } } })).toEqual({
      requestBody: { content: { "application/json": {} }, required: true },
    });
  });

  it("leaves operations without request bodies unchanged", () => {
    const operation = { responses: {} };

    expect(withRequiredBody(operation)).toBe(operation);
  });
});
