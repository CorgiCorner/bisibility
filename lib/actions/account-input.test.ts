import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  revalidatePath: vi.fn(),
  updateProfileNameRecord: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/account/profile-service", () => ({
  updateProfileNameRecord: mocks.updateProfileNameRecord,
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { user: {} } }));

import { updateProfileName } from "./account";

describe("account action input", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.updateProfileNameRecord.mockResolvedValue({ name: "Safe name" });
  });

  it("does not forward instance or project role fields from profile input", async () => {
    await updateProfileName({
      isInstanceAdmin: true,
      name: "Safe name",
      role: "owner",
    });

    expect(mocks.updateProfileNameRecord).toHaveBeenCalledWith("user_1", "Safe name");
    expect(mocks.updateProfileNameRecord).toHaveBeenCalledTimes(1);
  });
});
