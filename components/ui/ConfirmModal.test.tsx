import { describe, expect, it } from "vitest";
import { CONFIRM } from "./ConfirmModal";

describe("instance-admin confirmation copy", () => {
  it("documents account state and rolling-spend consequences", () => {
    expect(CONFIRM.deactivateAccount.body).toContain("revoke every session");
    expect(CONFIRM.deactivateAccount.body).toContain("pause scheduled checks");
    expect(CONFIRM.reactivateAccount.body).toContain("reconverge");
    expect(CONFIRM.resetAccountLimits.body).toContain(
      "Monthly spend is a rolling window and cannot be reset",
    );
  });
});
