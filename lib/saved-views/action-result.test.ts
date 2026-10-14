import { describe, expect, it, vi } from "vitest";
import { savedViewActionResult } from "./action-result";
import {
  PrivateViewCreationUnavailableError,
  SavedViewConflictError,
  ViewPreferenceConflictError,
} from "./errors";

vi.mock("server-only", () => ({}));
describe("personal display action transport", () => {
  it("preserves handled409 as JSON while rethrowing unexpected runtime errors", async () => {
    for (const error of [new SavedViewConflictError(), new ViewPreferenceConflictError()]) {
      const result = await savedViewActionResult(async () => {
        throw error;
      });
      expect(JSON.parse(JSON.stringify(result))).toMatchObject({
        ok: false,
        error: { code: "conflict", status: 409 },
      });
    }
    const runtime = new Error("Unexpected runtime defect");
    await expect(
      savedViewActionResult(async () => {
        throw runtime;
      }),
    ).rejects.toBe(runtime);
  });
});

it("returns a typed private creation denial through the action transport", async () => {
  expect(
    await savedViewActionResult(async () => {
      throw new PrivateViewCreationUnavailableError();
    }),
  ).toMatchObject({ ok: false, error: { code: "private_view_creation_unavailable", status: 403 } });
});
