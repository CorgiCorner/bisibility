import type { Prisma } from "@/lib/generated/prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { HistoryExportAuthority } from "./export-authority";
import type { RetainedCredentialReadPort } from "./retained-credential-port";
import {
  authorizeRetainedProjectRead,
  retainedProjectReadAuthority,
} from "./retained-read-authority";

vi.mock("server-only", () => ({}));
const project = { id: "project-db", publicId: "prj_abcdefghijklmnopqrstuvwx" };
const now = new Date();
function database() {
  const raw = vi
    .fn<Prisma.TransactionClient["$queryRaw"]>()
    .mockResolvedValueOnce([{ id: "user-db" }])
    .mockResolvedValue([{ role: "viewer" }]);
  const valid = { revokedAt: null, expiresAt: new Date(now.getTime() + 60_000), scopes: ["read"] };
  return {
    $queryRaw: raw,
    apiKey: {
      findFirst: vi
        .fn<RetainedCredentialReadPort["apiKey"]["findFirst"]>()
        .mockResolvedValue(valid),
    },
    personalAccessToken: {
      findFirst: vi
        .fn<RetainedCredentialReadPort["personalAccessToken"]["findFirst"]>()
        .mockResolvedValue(valid),
    },
    oauthClient: {
      findUnique: vi
        .fn<RetainedCredentialReadPort["oauthClient"]["findUnique"]>()
        .mockResolvedValue({ disabled: false, scopes: ["read"] }),
    },
    oauthConsent: {
      findFirst: vi
        .fn<RetainedCredentialReadPort["oauthConsent"]["findFirst"]>()
        .mockResolvedValue({ scopes: ["read"] }),
    },
  };
}
function authority(kind: "project_key" | "personal_token" | "oauth_client") {
  const context: HistoryExportAuthority = {
    actor: { id: kind === "project_key" ? "key-db" : "user-db" },
    transport: kind === "project_key" ? "project_key" : "personal_token",
    credentialId: kind === "project_key" ? "key-db" : "credential-db",
    credential: { kind, id: kind === "project_key" ? "key-db" : "credential-db" },
  };
  return retainedProjectReadAuthority(project.id, context);
}
describe("retained project read credentials", () => {
  it("uses the real key identity and fresh project-scoped key, without looking up a fake user", async () => {
    const db = database(),
      binding = authority("project_key");
    const scope = await authorizeRetainedProjectRead(
      db,
      binding,
      binding.credential.actor,
      project,
      "entity_match",
    );
    expect(scope).toMatchObject({ actor: { id: "key-db" }, grant: { role: "admin" } });
    expect(db.apiKey.findFirst).toHaveBeenCalledWith({
      where: { id: "key-db", projectId: project.id },
      select: { revokedAt: true, expiresAt: true, scopes: true },
    });
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
  it("preserves the canonical read/write/admin scope hierarchy", async () => {
    for (const tier of ["read", "write", "admin"]) {
      const db = database(),
        binding = authority("project_key");
      db.apiKey.findFirst.mockResolvedValue({ revokedAt: null, expiresAt: null, scopes: [tier] });
      await expect(
        authorizeRetainedProjectRead(
          db,
          binding,
          binding.credential.actor,
          project,
          "entity_match",
        ),
      ).resolves.toMatchObject({ grant: { role: "admin" } });
    }
  });
  it("checks PAT/OAuth plus fresh active user and membership in the supplied read transaction", async () => {
    for (const kind of ["personal_token", "oauth_client"] as const) {
      const db = database(),
        binding = authority(kind);
      expect(
        (
          await authorizeRetainedProjectRead(
            db,
            binding,
            binding.credential.actor,
            project,
            "entity_match",
          )
        ).grant.role,
      ).toBe("viewer");
      expect(db.$queryRaw).toHaveBeenCalledTimes(2);
      if (kind === "personal_token")
        expect(db.personalAccessToken.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({ where: { id: "credential-db", userId: "user-db" } }),
        );
      else
        expect(db.oauthConsent.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({ where: { clientId: "credential-db", userId: "user-db" } }),
        );
    }
  });
  it("refuses revoked, expired, missing and ungranted keys/PATs", async () => {
    for (const kind of ["project_key", "personal_token"] as const) {
      for (const state of [
        null,
        { revokedAt: now, expiresAt: null, scopes: ["read"] },
        { revokedAt: null, expiresAt: new Date(0), scopes: ["read"] },
        { revokedAt: null, expiresAt: null, scopes: [] },
      ]) {
        const db = database(),
          binding = authority(kind);
        if (kind === "project_key") db.apiKey.findFirst.mockResolvedValue(state);
        else db.personalAccessToken.findFirst.mockResolvedValue(state);
        await expect(
          authorizeRetainedProjectRead(
            db,
            binding,
            binding.credential.actor,
            project,
            "entity_match",
          ),
        ).rejects.toMatchObject({ code: "forbidden" });
      }
    }
  });
  it("refuses disabled OAuth, consent loss, consent scope loss and deactivated users", async () => {
    for (const mode of ["disabled", "consent", "scopes", "deactivated", "membership"] as const) {
      const db = database(),
        binding = authority("oauth_client");
      if (mode === "disabled")
        db.oauthClient.findUnique.mockResolvedValue({ disabled: true, scopes: ["read"] });
      if (mode === "consent") db.oauthConsent.findFirst.mockResolvedValue(null);
      if (mode === "scopes") db.oauthConsent.findFirst.mockResolvedValue({ scopes: [] });
      if (mode === "deactivated") db.$queryRaw.mockReset().mockResolvedValue([]);
      if (mode === "membership")
        db.$queryRaw
          .mockReset()
          .mockResolvedValueOnce([{ id: "user-db" }])
          .mockResolvedValue([]);
      await expect(
        authorizeRetainedProjectRead(
          db,
          binding,
          binding.credential.actor,
          project,
          "entity_match",
        ),
      ).rejects.toMatchObject({ code: "forbidden" });
    }
  });
  it("refuses mismatched project/actor bindings before any credential or data read", async () => {
    const db = database(),
      binding = authority("project_key");
    for (const [actor, scope] of [
      [{ id: "other-user" }, project],
      [binding.credential.actor, { ...project, id: "other-project" }],
    ] as const)
      await expect(
        authorizeRetainedProjectRead(db, binding, actor, scope, "entity_match"),
      ).rejects.toMatchObject({ code: "forbidden" });
    expect(db.apiKey.findFirst).not.toHaveBeenCalled();
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
});
