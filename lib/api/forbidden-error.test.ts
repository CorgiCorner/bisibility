import { AuthorizationError } from "@/lib/auth/authorize";
import { describe, expect, it, vi } from "vitest";
import { errorFromUnknown } from "./error-mapper";
import { ApiForbiddenError } from "./errors";
import { domainError } from "./surface";

vi.mock("server-only", () => ({}));

/**
 * Domain services (team, saved views, notification channels) throw AuthorizationError when the
 * caller's role is too low. Over the REST API that is a 403, not a generic 400.
 */
describe("authorization failures over the API", () => {
  it("maps a domain authorization failure to the forbidden error", () => {
    expect(() =>
      domainError(new AuthorizationError("forbidden", "Only the owner can change admins.")),
    ).toThrow(ApiForbiddenError);
  });

  it("renders the forbidden error as a 403 problem response", async () => {
    const response = errorFromUnknown(
      new ApiForbiddenError("Only the owner can change admins."),
      new Headers(),
      new URL("https://example.test/api/v1/projects/prj_1/team/members/mbr_1"),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Only the owner can change admins.",
      status: 403,
      title: "Forbidden",
    });
  });
});
