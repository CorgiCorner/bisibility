import { permanentRedirect } from "@/tests/next-navigation";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn(), extension: vi.fn() }));
vi.mock("@/lib/auth/instance-admin", () => ({ requireInstanceAdmin: mocks.access }));
vi.mock("@/lib/instance-admin/legacy-extension", () => ({
  legacyAdminDestination: mocks.extension,
}));

import { redirectLegacyAdmin } from "./legacy-redirect";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.extension.mockReturnValue(undefined);
});

it.each([
  ["", "/app/admin/overview/status"],
  ["administration", "/app/admin/users/accounts"],
  ["metering", "/app/admin/overview/status"],
  ["metering/recovery", "/app/admin/operations/tasks"],
])("redirects the shared %s path permanently", async (path, destination) => {
  await redirectLegacyAdmin(path);
  expect(permanentRedirect).toHaveBeenCalledWith(destination);
  expect(mocks.access).toHaveBeenCalledOnce();
});

it.each(["", "administration", "metering", "metering/recovery", "billing", "signups", "insights"])(
  "rejects unauthorized %s before inspecting the edition or query",
  async (path) => {
    mocks.access.mockRejectedValueOnce(new Error("NEXT_NOT_FOUND"));
    // biome-ignore lint/suspicious/noThenProperty: verify the authorization gate never awaits untrusted input.
    const params = { then: vi.fn() };
    await expect(redirectLegacyAdmin(path, params as never)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(params.then).not.toHaveBeenCalled();
    expect(mocks.extension).not.toHaveBeenCalled();
    expect(permanentRedirect).not.toHaveBeenCalled();
  },
);

it("preserves query values and encodes them without changing the destination", async () => {
  await redirectLegacyAdmin(
    "administration",
    Promise.resolve({
      search: "name+admin@example.com",
      account: ["one", "two"],
      next: "//example.com",
      empty: undefined,
    }),
  );
  expect(permanentRedirect).toHaveBeenCalledWith(
    "/app/admin/users/accounts?search=name%2Badmin%40example.com&account=one&account=two&next=%2F%2Fexample.com",
  );
});

it.each(["metering", "metering/recovery"])(
  "preserves task links from %s in both editions",
  async (path) => {
    mocks.extension.mockReturnValue("/app/admin/usage-costs/accounting-health");
    await redirectLegacyAdmin(
      path,
      Promise.resolve({ tab: "incidents", case: "case_1", incident: "inc_1" }),
    );
    expect(permanentRedirect).toHaveBeenCalledWith(
      "/app/admin/operations/tasks?tab=incidents&case=case_1&incident=inc_1",
    );
  },
);
