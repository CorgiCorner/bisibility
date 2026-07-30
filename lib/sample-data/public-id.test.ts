import { parsePublicId } from "@/lib/db/public-id";
import { describe, expect, it } from "vitest";
import { makeSamplePublicId } from "./public-id";

describe("makeSamplePublicId", () => {
  it("creates a normal v2 project ID because sample state is persisted", () => {
    const publicId = makeSamplePublicId();

    expect(parsePublicId(publicId)?.resource).toBe("project");
  });
});
