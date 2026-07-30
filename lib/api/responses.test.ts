import { describe, expect, it } from "vitest";
import { dataResponse, errorResponse, listResponse, methodNotAllowed } from "./responses";

describe("API responses", () => {
  it("wraps successful payloads in a data envelope", async () => {
    const response = dataResponse(
      { id: "kw_1" },
      { headers: { "RateLimit-Limit": "60" }, meta: { limit: 1 } },
    );

    await expect(response.json()).resolves.toEqual({
      data: { id: "kw_1" },
      meta: { limit: 1 },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("RateLimit-Limit")).toBe("60");
  });

  it("wraps list payloads with cursor metadata", async () => {
    const response = listResponse([{ id: "kw_1" }], "cursor_1");

    await expect(response.json()).resolves.toEqual({
      data: [{ id: "kw_1" }],
      meta: { next_cursor: "cursor_1" },
    });
  });

  it("returns RFC problem details for errors", async () => {
    const response = errorResponse("not_found", "Keyword not found.", 404);

    await expect(response.json()).resolves.toMatchObject({
      detail: "Keyword not found.",
      docs_url: expect.stringContaining("#not_found"),
      status: 404,
      title: "Not found",
      type: "https://bisibility.com/problems/not_found",
    });
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
  });

  it("sets Allow on method errors", () => {
    const response = methodNotAllowed(["GET"]);

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });
});
