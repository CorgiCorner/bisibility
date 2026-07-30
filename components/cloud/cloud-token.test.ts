import { describe, expect, it } from "vitest";
import { mintMigrationTokenFormSchema, revokeMigrationTokenFormSchema } from "./cloud-token";

const projectId = "prj_abcdefghijklmnopqrstuvwx";
const tokenId = "ferry_abcdefghijklmnopqrstuvwx";

describe("cloud migration token form IDs", () => {
  it("accepts exact v3 project and token public IDs", () => {
    expect(mintMigrationTokenFormSchema.safeParse({ projectId, scope: "full" }).success).toBe(true);
    expect(revokeMigrationTokenFormSchema.safeParse({ projectId, tokenId }).success).toBe(true);
  });

  it.each(["project_1", ` ${projectId}`, projectId.toUpperCase()])(
    "rejects a non-exact project ID: %s",
    (value) => {
      expect(
        mintMigrationTokenFormSchema.safeParse({ projectId: value, scope: "full" }).success,
      ).toBe(false);
    },
  );

  it("rejects a raw migration token ID", () => {
    expect(
      revokeMigrationTokenFormSchema.safeParse({ projectId, tokenId: "token_1" }).success,
    ).toBe(false);
  });
});
