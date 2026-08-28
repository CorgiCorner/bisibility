import { describe, expect, it, vi } from "vitest";
import { removeMembershipSideEffects } from "./membership-cleanup";

vi.mock("server-only", () => ({}));

function txStub() {
  return {
    alertRuleRecipient: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    notificationPreference: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
}

describe("removeMembershipSideEffects", () => {
  it("drops alert recipient rows for the project the member left", async () => {
    const tx = txStub();

    await removeMembershipSideEffects(tx as never, { projectId: "p1", userId: "u1" });

    expect(tx.alertRuleRecipient.deleteMany).toHaveBeenCalledWith({
      where: { rule: { projectId: "p1" }, userId: "u1" },
    });
  });

  it("drops the notification preference row for the project the member left", async () => {
    const tx = txStub();

    await removeMembershipSideEffects(tx as never, { projectId: "p1", userId: "u1" });

    expect(tx.notificationPreference.deleteMany).toHaveBeenCalledWith({
      where: { projectId: "p1", userId: "u1" },
    });
  });
});
