import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaProject } = vi.hoisted(() => ({ prismaProject: { findUnique: vi.fn() } }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { project: prismaProject } }));

import type { PersonalTokenAuth } from "./auth";
import { effectiveScopes, PROJECT_HEADER, resolvePersonalProjectScope } from "./personal-scope";

describe("personal-token effective scopes", () => {
  it.each([
    { expected: ["read"], role: "viewer", token: ["read", "write", "admin"] },
    { expected: ["read"], role: "auditor", token: ["read", "write", "admin"] },
    { expected: ["read", "write"], role: "member", token: ["read", "write", "admin"] },
    { expected: ["read", "write"], role: "owner", token: ["read", "write"] },
    { expected: ["read", "write", "admin"], role: "admin", token: ["read", "write", "admin"] },
  ] as const)("intersects $role membership with the token tier", ({ expected, role, token }) => {
    expect(effectiveScopes(token, role)).toEqual(expected);
  });
});

const PRJ_A = "prj_a00000000000000000000000";
const PRJ_B = "prj_b00000000000000000000000";
const PRJ_C = "prj_c00000000000000000000000";
const INTERNAL_A = "internal-a";
const ctx = { headers: new Headers(), instance: "urn:test" };

function auth(memberships: Array<{ projectId: string; role: "member" }>): PersonalTokenAuth {
  return {
    kind: "personal_token",
    memberships,
    token: {
      id: "pat1",
      name: "t",
      prefix: "bsb_pat",
      publicId: null,
      scopes: ["read"],
      userId: "u1",
    },
    user: { email: "u@e.com", id: "u1", name: "U", publicId: null },
  };
}

function projectRow(id: string, publicId: string) {
  return {
    createdAt: new Date(),
    domain: "example.com",
    id,
    name: "Test",
    ownerId: "u1",
    publicId,
    updatedAt: new Date(),
    writeMode: null,
  };
}

describe("personal-token project selection precedence", () => {
  beforeEach(() => prismaProject.findUnique.mockReset());

  it("path beats header and query", async () => {
    prismaProject.findUnique.mockResolvedValue(projectRow(INTERNAL_A, PRJ_A));
    const req = new Request(`https://api.test/keywords?project=${PRJ_C}`, {
      headers: { [PROJECT_HEADER]: PRJ_B },
    });
    const result = await resolvePersonalProjectScope(
      req,
      new URL(req.url),
      ["projects", PRJ_A],
      auth([{ projectId: INTERNAL_A, role: "member" }]),
      ctx,
    );
    expect("response" in result).toBe(false);
    expect(prismaProject.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { publicId: PRJ_A } }),
    );
  });

  it("header beats query", async () => {
    prismaProject.findUnique.mockResolvedValue(projectRow(INTERNAL_A, PRJ_A));
    const req = new Request(`https://api.test/keywords?project=${PRJ_B}`, {
      headers: { [PROJECT_HEADER]: PRJ_A },
    });
    const result = await resolvePersonalProjectScope(
      req,
      new URL(req.url),
      [],
      auth([{ projectId: INTERNAL_A, role: "member" }]),
      ctx,
    );
    expect("response" in result).toBe(false);
    expect(prismaProject.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { publicId: PRJ_A } }),
    );
  });

  it("query beats inference", async () => {
    prismaProject.findUnique.mockResolvedValue(projectRow(INTERNAL_A, PRJ_A));
    const req = new Request(`https://api.test/keywords?project=${PRJ_A}`);
    const result = await resolvePersonalProjectScope(
      req,
      new URL(req.url),
      [],
      auth([{ projectId: INTERNAL_A, role: "member" }]),
      ctx,
    );
    expect("response" in result).toBe(false);
    expect(prismaProject.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { publicId: PRJ_A } }),
    );
  });

  it("one membership permits inference", async () => {
    prismaProject.findUnique.mockResolvedValue(projectRow(INTERNAL_A, PRJ_A));
    const req = new Request("https://api.test/keywords");
    const result = await resolvePersonalProjectScope(
      req,
      new URL(req.url),
      [],
      auth([{ projectId: INTERNAL_A, role: "member" }]),
      ctx,
    );
    expect("response" in result).toBe(false);
    expect(prismaProject.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: INTERNAL_A } }),
    );
  });

  it("multiple memberships with no selector returns 400", async () => {
    const req = new Request("https://api.test/keywords");
    const result = await resolvePersonalProjectScope(
      req,
      new URL(req.url),
      [],
      auth([
        { projectId: INTERNAL_A, role: "member" },
        { projectId: "internal-b", role: "member" },
      ]),
      ctx,
    );
    expect("response" in result).toBe(true);
    expect((result as { response: Response }).response.status).toBe(400);
  });
});
