import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ update: vi.fn(), demo: false }));
vi.mock("@/lib/demo/config", () => ({
  readDemoConfig: () => ({ kind: m.demo ? "editable" : "disabled" }),
}));
vi.mock("@/lib/providers/crypto", () => ({
  getPurposeSecretKeys: (purpose: string) => [
    Buffer.alloc(32, purpose === "achievement-email-unsubscribe" ? 7 : 8),
  ],
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { achievementState: { updateMany: m.update } } }));

import {
  createAchievementUnsubscribeToken,
  unsubscribeAchievementEmail,
  verifyAchievementUnsubscribeToken,
} from "./unsubscribe";

beforeEach(() => {
  vi.clearAllMocks();
  m.demo = false;
});
it("authenticates category-only unsubscribe and rejects tampering without changing other preferences", async () => {
  const token = createAchievementUnsubscribeToken("user-a");
  expect(verifyAchievementUnsubscribeToken(token)).toBe("user-a");
  expect(verifyAchievementUnsubscribeToken(`${token.slice(0, -3)}abc`)).toBeNull();
  expect(verifyAchievementUnsubscribeToken("")).toBeNull();
  expect(await unsubscribeAchievementEmail(token)).toBe(true);
  expect(m.update).toHaveBeenCalledWith({
    where: { userId: "user-a" },
    data: { emailEnabled: false, revision: { increment: 1 } },
  });
});

it("never writes to a demo even with a valid signed token", async () => {
  m.demo = true;
  expect(await unsubscribeAchievementEmail(createAchievementUnsubscribeToken("user-a"))).toBe(
    false,
  );
  expect(m.update).not.toHaveBeenCalled();
});
