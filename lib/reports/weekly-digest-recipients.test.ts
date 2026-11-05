import { afterEach, expect, it, vi } from "vitest";

const findFirst = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/prisma", () => ({ prisma: { user: { findFirst } } }));
import { digestCandidates, digestRecipient } from "./weekly-digest-recipients";

afterEach(() => vi.unstubAllEnvs());
it("excludes the viewer both from candidates and at the final recipient read", async () => {
  vi.stubEnv("DEMO_MODE", "editable");
  vi.stubEnv("DEMO_USER_ID", "usr_abcdefghijklmnopqrstuvwx");
  vi.stubEnv("DEMO_OWNER_ID", "usr_bcdefghijklmnopqrstuvwxy");
  vi.stubEnv("DEMO_PROJECT_ID", "prj_abcdefghijklmnopqrstuvwx");
  const viewer = { id: "viewer", publicId: "usr_abcdefghijklmnopqrstuvwx", emailVerified: true, notificationPreferences: [] };
  const owner = { ...viewer, id: "owner", publicId: "usr_bcdefghijklmnopqrstuvwxy" };
  expect(digestCandidates({ owner, members: [{ user: viewer }] })).toEqual(["owner"]);
});
it("rechecks the viewer at the final recipient read", async () => {
  vi.stubEnv("DEMO_MODE", "editable");
  vi.stubEnv("DEMO_USER_ID", "usr_abcdefghijklmnopqrstuvwx");
  vi.stubEnv("DEMO_OWNER_ID", "usr_bcdefghijklmnopqrstuvwxy");
  vi.stubEnv("DEMO_PROJECT_ID", "prj_abcdefghijklmnopqrstuvwx");
  const viewer = { id: "viewer", publicId: "usr_abcdefghijklmnopqrstuvwx", emailVerified: true, notificationPreferences: [] };
  findFirst.mockResolvedValue({ ...viewer, email: "viewer@example.org" });
  expect(await digestRecipient("viewer", "project")).toBeNull();
});
