import { ProjectReadOnlyError } from "@/lib/deployment/project-write-mode";
import { describe, expect, it } from "vitest";
import {
  actionFailureResult,
  destinationRejectionFailure,
  handledActionResult,
  mapActionFailure,
  unwrapActionFailureResult,
  unwrapActionResult,
} from "./action-result";
import {
  MigrationTokenAlreadyConsumedError,
  MigrationTokenNotActiveError,
} from "./migration-errors";

describe("handledActionResult", () => {
  it("serializes project read-only failures with the REST boundary semantics", async () => {
    const result = await handledActionResult(async () => {
      throw new ProjectReadOnlyError("project_1");
    });

    expect(result).toEqual({
      error: {
        code: "project_read_only",
        message:
          "Project is in read-only mode while migration hold is active. Release the migration hold before writing to this project.",
        status: 423,
      },
      ok: false,
    });
    expect(() => unwrapActionResult(result)).toThrow("Project is in read-only mode");
  });

  it("maps migration token errors through the shared helper", async () => {
    const notActive = await handledActionResult(async () => {
      throw new MigrationTokenNotActiveError("gone");
    });
    expect(notActive).toEqual({
      error: {
        code: "migration_token_not_active",
        message: "This migration token is no longer active. Create a new token to continue.",
        status: 409,
      },
      ok: false,
    });

    const consumed = await handledActionResult(async () => {
      throw new MigrationTokenAlreadyConsumedError("used");
    });
    expect(consumed).toEqual({
      error: {
        code: "migration_token_already_consumed",
        message: "This migration token has already been used. Create a new token to continue.",
        status: 409,
      },
      ok: false,
    });
  });

  it("does not hide unexpected action failures", async () => {
    await expect(
      handledActionResult(async () => {
        throw new Error("Database unavailable.");
      }),
    ).rejects.toThrow("Database unavailable.");
    expect(mapActionFailure(new Error("boom"))).toBeNull();
  });
});

describe("destinationRejectionFailure", () => {
  it("maps known destination statuses even without a detail body", () => {
    expect(destinationRejectionFailure(419, null)).toEqual({
      code: "remote_migration_rejected",
      message: "The migration token was revoked or expired on the destination.",
      status: 419,
    });
    expect(destinationRejectionFailure(423, null)?.status).toBe(423);
    expect(destinationRejectionFailure(409, null)?.status).toBe(409);
  });

  it("prefers a destination-provided detail message", () => {
    expect(destinationRejectionFailure(409, "session already active")).toEqual({
      code: "remote_migration_rejected",
      message: "session already active",
      status: 409,
    });
  });

  it("maps other 4xx only when a detail is present", () => {
    expect(destinationRejectionFailure(400, null)).toBeNull();
    expect(destinationRejectionFailure(400, "bad request")).toEqual({
      code: "remote_migration_rejected",
      message: "bad request",
      status: 400,
    });
  });

  it("never handles 5xx or success statuses", () => {
    expect(destinationRejectionFailure(500, "boom")).toBeNull();
    expect(destinationRejectionFailure(502, null)).toBeNull();
    expect(destinationRejectionFailure(200, "ok")).toBeNull();
  });
});

describe("unwrapActionFailureResult", () => {
  it("keeps raw successes and throws handled action failures with their metadata", () => {
    expect(unwrapActionFailureResult({ value: "ready" })).toEqual({ value: "ready" });

    const failure = actionFailureResult({
      code: "invalid_migration_target",
      message: "Target URL must be an absolute URL.",
      status: 400,
    });

    expect(() => unwrapActionFailureResult(failure)).toThrow(
      expect.objectContaining({
        code: "invalid_migration_target",
        message: "Target URL must be an absolute URL.",
        status: 400,
      }),
    );
  });
});
