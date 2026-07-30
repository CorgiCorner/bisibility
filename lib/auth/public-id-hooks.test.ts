import { parsePublicId } from "@/lib/db/public-id";
import { describe, expect, it } from "vitest";
import { addAuthPublicId } from "./public-id-hooks";

describe("Better Auth public-ID hooks", () => {
  it("keeps server-owned public IDs while preserving hook data", () => {
    const result = addAuthPublicId({ email: "member@example.com", id: "user_raw" }, "usr", {
      data: { isInstanceAdmin: false },
    });

    expect(result.data).toMatchObject({ email: "member@example.com", isInstanceAdmin: false });
    expect(parsePublicId(String(result.data.publicId))?.resource).toBe("user");
  });
});
