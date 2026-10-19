import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteAccountRecords: vi.fn(),
  extension: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/account/account-deletion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/account/account-deletion")>()),
  deleteAccountRecords: mocks.deleteAccountRecords,
}));
vi.mock("./account-route-extension", () => ({
  accountRouteExtensionPolicy: () => undefined,
  dispatchAccountRouteExtension: mocks.extension,
}));

import {
  AccountDeletionConfirmationError,
  LastInstanceAdminDeletionError,
} from "@/lib/account/account-deletion";
import { dispatchAccountRoute } from "./account-routes";
import type { PersonalApiContext } from "./context";
import { operationPolicyForRequest } from "./operation-policy";

function context(method: string, path: string[], body?: unknown): PersonalApiContext {
  const url = new URL(`https://app.example.com/api/v1/${path.join("/")}`);
  return {
    auth: {
      kind: "personal_token",
      memberships: [],
      token: {
        id: "pat_1",
        name: "iPhone",
        prefix: "bsb",
        publicId: null,
        scopes: ["admin"],
        userId: "user_1",
      },
      user: { email: "owner@example.com", id: "user_1", name: "Owner", publicId: "usr_1" },
    },
    headers: new Headers(),
    instance: `urn:bisibility:api:v1:${url.pathname}`,
    method,
    path,
    req: new Request(url, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method,
    }),
    url,
  } as PersonalApiContext;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deleteAccountRecords.mockResolvedValue(undefined);
});

describe("DELETE /me", () => {
  it("requires an admin-scope personal token", () => {
    expect(operationPolicyForRequest("DELETE", ["me"])).toMatchObject({
      operationId: "deleteMe",
      requiredScope: "admin",
    });
  });

  it("deletes the account after email confirmation", async () => {
    const response = await dispatchAccountRoute(
      context("DELETE", ["me"], { confirm_email: "owner@example.com" }),
    );
    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ deleted: true });
    expect(mocks.deleteAccountRecords).toHaveBeenCalledWith({
      confirmEmail: "owner@example.com",
      source: "api",
      userId: "user_1",
    });
  });

  it("rejects a missing confirmation before touching the account", async () => {
    await expect(dispatchAccountRoute(context("DELETE", ["me"], {}))).rejects.toThrow();
    expect(mocks.deleteAccountRecords).not.toHaveBeenCalled();
  });

  it.each([
    [new AccountDeletionConfirmationError(), 422, "confirmation_mismatch"],
    [new LastInstanceAdminDeletionError(), 409, "last_instance_admin"],
  ])("maps %s to a problem response", async (error, status, code) => {
    mocks.deleteAccountRecords.mockRejectedValue(error);
    const response = await dispatchAccountRoute(
      context("DELETE", ["me"], { confirm_email: "other@example.com" }),
    );
    expect(response?.status).toBe(status);
    expect((await response?.json())?.details).toEqual({ code });
  });
});

describe("account route extension", () => {
  it("receives /me paths the core does not own", async () => {
    mocks.extension.mockReturnValue(Promise.resolve(new Response("{}")));
    const ctx = context("GET", ["me", "entitlements"]);
    await dispatchAccountRoute(ctx);
    expect(mocks.extension).toHaveBeenCalledWith(ctx);
  });
});
