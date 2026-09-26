import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import { withProviderCredentialDefaults } from "./provider-credential-defaults";

function client(domain: string | null) {
  return { project: { findUnique: vi.fn().mockResolvedValue({ domain }) } };
}

describe("withProviderCredentialDefaults", () => {
  it("fills a missing login from the tracked project domain", async () => {
    const db = client("example.com");
    await expect(
      withProviderCredentialDefaults(
        { id: "plausible", loginDefaultsToProjectDomain: true },
        "project_1",
        { apiKey: "token" },
        db as never,
      ),
    ).resolves.toEqual({ apiKey: "token", login: "example.com" });
    expect(db.project.findUnique).toHaveBeenCalledWith({
      select: { domain: true },
      where: { id: "project_1" },
    });
  });

  it("keeps an explicit login", async () => {
    const db = client("example.com");
    await expect(
      withProviderCredentialDefaults(
        { id: "plausible", loginDefaultsToProjectDomain: true },
        "project_1",
        { apiKey: "token", login: "other.example.com" },
        db as never,
      ),
    ).resolves.toEqual({ apiKey: "token", login: "other.example.com" });
    expect(db.project.findUnique).not.toHaveBeenCalled();
  });

  it("leaves credentials alone for providers without the default", async () => {
    const db = client("example.com");
    await expect(
      withProviderCredentialDefaults(
        { id: "dataforseo" },
        "project_1",
        { apiKey: "token" },
        db as never,
      ),
    ).resolves.toEqual({ apiKey: "token" });
    expect(db.project.findUnique).not.toHaveBeenCalled();
  });

  it("does not invent a login for a project without a tracked domain", async () => {
    await expect(
      withProviderCredentialDefaults(
        { id: "plausible", loginDefaultsToProjectDomain: true },
        "project_1",
        { apiKey: "token" },
        client(null) as never,
      ),
    ).resolves.toEqual({ apiKey: "token" });
  });
});
