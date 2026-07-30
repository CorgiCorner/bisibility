import type { BetterAuthOptions } from "better-auth";
import { parseUserInput } from "better-auth/db";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/deployment/runtime-env.generated", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import { auth } from "./auth";

describe("Better Auth user input", () => {
  it("replaces client-supplied instance administration with the safe create default", () => {
    const parsed = parseUserInput(
      auth.options as BetterAuthOptions,
      {
        email: "operator@example.com",
        isInstanceAdmin: true,
        name: "Operator",
      },
      "create",
    );

    expect(parsed).toHaveProperty("isInstanceAdmin", false);
  });

  it("rejects client-supplied instance administration on update", () => {
    expect(() =>
      parseUserInput(
        auth.options as BetterAuthOptions,
        {
          email: "operator@example.com",
          isInstanceAdmin: true,
          name: "Operator",
        },
        "update",
      ),
    ).toThrow("isInstanceAdmin is not allowed to be set");
  });

  it.each(["create", "update"] as const)(
    "does not expose project roles or deactivation on %s",
    (action) => {
      const parsed = parseUserInput(
        auth.options as BetterAuthOptions,
        {
          email: "operator@example.com",
          deactivatedAt: new Date("2026-07-18T00:30:00.000Z"),
          name: "Operator",
          role: "owner",
        },
        action,
      );

      if (action === "create") {
        expect(parsed).toHaveProperty("isInstanceAdmin", false);
      } else {
        expect(parsed).not.toHaveProperty("isInstanceAdmin");
      }
      expect(parsed).not.toHaveProperty("deactivatedAt");
      expect(parsed).not.toHaveProperty("role");
    },
  );
});
