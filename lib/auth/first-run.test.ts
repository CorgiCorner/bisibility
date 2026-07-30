import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  findFirst: vi.fn(),
  redirect: vi.fn(),
  selfHost: true,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { user: { findFirst: mocks.findFirst } },
}));
vi.mock("@/lib/deployment/deployment", () => ({
  get isSelfHost() {
    return mocks.selfHost;
  },
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/server", () => ({ connection: mocks.connection }));

import {
  isFirstRun,
  isFirstRunAdministratorPending,
  prepareFirstRunUserCreation,
  redirectToSetupIfFirstRun,
} from "./first-run";
import { withFirstRunCreation } from "./first-run-context";

const requestContext = {
  appVersion: "test",
  correlationId: "correlation_1",
  sourceIpHash: null,
  sourceIpMasked: null,
  userAgent: null,
};

function hookContext(accountCount: number) {
  return {
    context: {
      generateId: () => "user_admin",
      internalAdapter: {
        countTotalUsers: vi.fn().mockResolvedValue(accountCount),
      },
    },
  };
}

describe("self-host first-run detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selfHost = true;
    mocks.findFirst.mockResolvedValue(null);
  });

  it("detects an empty self-hosted installation", async () => {
    await expect(isFirstRun()).resolves.toBe(true);
    expect(mocks.findFirst).toHaveBeenCalledWith({ select: { id: true } });
  });

  it("never enables first-run setup in cloud mode", async () => {
    mocks.selfHost = false;

    await expect(isFirstRun()).resolves.toBe(false);
    await expect(isFirstRunAdministratorPending()).resolves.toBe(false);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("keeps wizard registration open until an administrator exists", async () => {
    await expect(isFirstRunAdministratorPending()).resolves.toBe(true);
    expect(mocks.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: { isInstanceAdmin: true },
    });

    mocks.findFirst.mockResolvedValue({ id: "user_admin" });
    await expect(isFirstRunAdministratorPending()).resolves.toBe(false);
  });

  it("keeps cloud routes static and unchanged", async () => {
    mocks.selfHost = false;

    await expect(redirectToSetupIfFirstRun()).resolves.toBeUndefined();
    expect(mocks.connection).not.toHaveBeenCalled();
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("waits for a live self-host request before checking setup state", async () => {
    await redirectToSetupIfFirstRun();

    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.findFirst).toHaveBeenCalledOnce();
    expect(mocks.redirect).toHaveBeenCalledWith("/setup");
  });

  it("leaves setup after any account exists", async () => {
    mocks.findFirst.mockResolvedValue({ id: "user_1" });
    await expect(isFirstRun()).resolves.toBe(false);
  });

  it("rechecks setup state after account creation in the same request", async () => {
    mocks.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "user_admin" });

    await expect(isFirstRun()).resolves.toBe(true);
    await expect(isFirstRun()).resolves.toBe(false);
    expect(mocks.findFirst).toHaveBeenCalledTimes(2);
  });

  it("allows the setup context to create a regular user before promotion", async () => {
    const result = await withFirstRunCreation(requestContext, () =>
      prepareFirstRunUserCreation({ email: "admin@example.com", name: "Admin" }, hookContext(0)),
    );

    expect(result).toEqual({
      data: expect.objectContaining({
        email: "admin@example.com",
        id: "user_admin",
        isInstanceAdmin: false,
      }),
    });
  });

  it("blocks public registration while setup is pending", async () => {
    await expect(
      prepareFirstRunUserCreation({ email: "bypass@example.com", name: "Bypass" }, hookContext(0)),
    ).rejects.toMatchObject({ body: { code: "SETUP_REQUIRED" } });
  });

  it("allows concurrent wizard account creation until an administrator exists", async () => {
    await expect(
      withFirstRunCreation(requestContext, () =>
        prepareFirstRunUserCreation(
          { email: "second@example.com", name: "Second" },
          hookContext(1),
        ),
      ),
    ).resolves.toEqual({
      data: expect.objectContaining({
        email: "second@example.com",
        isInstanceAdmin: false,
      }),
    });
  });

  it("rejects a setup submission after another promotion wins", async () => {
    mocks.findFirst.mockResolvedValue({ id: "user_admin" });

    await expect(
      withFirstRunCreation(requestContext, () =>
        prepareFirstRunUserCreation(
          { email: "second@example.com", name: "Second" },
          hookContext(1),
        ),
      ),
    ).rejects.toMatchObject({ body: { code: "SETUP_ALREADY_COMPLETED" } });
  });

  it("preserves normal registration after setup completes", async () => {
    mocks.findFirst.mockResolvedValue({ id: "user_admin" });

    await expect(
      prepareFirstRunUserCreation({ email: "member@example.com", name: "Member" }, hookContext(1)),
    ).resolves.toBeUndefined();
  });
});
