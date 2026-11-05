import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ viewer: vi.fn(), refresh: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { user: { findUnique: mocks.viewer } } }));
vi.mock("./provider-feedback-store", () => ({
  assertMailNotSuppressed: vi.fn(async () => undefined),
  recordMailReceipt: vi.fn(),
}));
vi.mock("./instance-mail-store", () => ({ refreshInstanceMailRuntime: mocks.refresh }));
vi.mock("./registry", () => ({
  resolveEmailProvider: () => ({ isConfigured: () => false, send: mocks.send }),
}));

import { sendEmail } from "./send";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it.each(["weekly digest", "alert", "achievement", "check summary"])(
  "blocks a stale %s delivery to the viewer before transport",
  async (subject) => {
    vi.stubEnv("DEMO_MODE", "editable");
    vi.stubEnv("DEMO_USER_ID", "usr_abcdefghijklmnopqrstuvwx");
    vi.stubEnv("DEMO_OWNER_ID", "usr_bcdefghijklmnopqrstuvwxy");
    vi.stubEnv("DEMO_PROJECT_ID", "prj_abcdefghijklmnopqrstuvwx");
    mocks.viewer.mockResolvedValue({ email: "viewer@example.org" });
    await expect(
      sendEmail({ category: "bulk", html: "x", text: "x", subject, to: "VIEWER@example.org" }),
    ).rejects.toThrow("not eligible");
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  },
);
it("logs loudly but still delivers Owner mail if the configured viewer row is missing", async () => {
  vi.stubEnv("DEMO_MODE", "editable");
  vi.stubEnv("DEMO_USER_ID", "usr_abcdefghijklmnopqrstuvwx");
  vi.stubEnv("DEMO_OWNER_ID", "usr_bcdefghijklmnopqrstuvwxy");
  vi.stubEnv("DEMO_PROJECT_ID", "prj_abcdefghijklmnopqrstuvwx");
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.viewer.mockResolvedValue(null);
  await sendEmail({
    category: "bulk",
    from: "reports@example.com",
    html: "x",
    text: "x",
    subject: "weekly digest",
    to: "owner@example.com",
  });
  expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ to: "owner@example.com" }));
  expect(error).toHaveBeenCalledWith(expect.stringContaining("demo viewer"));
  expect(String(error.mock.calls[0])).not.toContain("owner@example.com");
  error.mockRestore();
});
it("allows owner mail and blocks viewer transactional mail", async () => {
  vi.stubEnv("DEMO_MODE", "editable");
  vi.stubEnv("DEMO_USER_ID", "usr_abcdefghijklmnopqrstuvwx");
  vi.stubEnv("DEMO_OWNER_ID", "usr_bcdefghijklmnopqrstuvwxy");
  vi.stubEnv("DEMO_PROJECT_ID", "prj_abcdefghijklmnopqrstuvwx");
  mocks.viewer.mockResolvedValue({ email: "viewer@example.org" });
  const message = { from: "reports@example.com", html: "x", text: "x", subject: "test" };
  await sendEmail({ ...message, category: "bulk", to: "owner@example.com" });
  await sendEmail({ ...message, category: "transactional", to: "owner@example.com" });
  await expect(
    sendEmail({ ...message, category: "transactional", to: "viewer@example.org" }),
  ).rejects.toThrow("not eligible");
  expect(mocks.send).toHaveBeenCalledTimes(2);
  expect(mocks.viewer).toHaveBeenCalledTimes(3);
});
