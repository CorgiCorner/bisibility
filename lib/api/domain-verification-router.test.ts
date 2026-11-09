import { dispatchMcpTool } from "@/lib/mcp/tools";
import { beforeEach, expect, it, vi } from "vitest";
import { handleApiRequest } from "./router";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  dns: vi.fn(),
  audit: vi.fn(),
  row: null as Record<string, unknown> | null,
  prisma: {
    $transaction: vi.fn(),
    instanceSetting: { findUnique: vi.fn() },
    project: { findUniqueOrThrow: vi.fn() },
    projectDomainVerification: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));
vi.mock("./router", async (original) =>
  (await import("./response-capture.test-support")).captureRouter(await original()),
);
vi.mock("./auth", () => ({ ApiAuthError: class extends Error {}, authenticateBearer: mocks.auth }));
vi.mock("./ratelimit", () => ({
  checkRateLimit: vi.fn(async () => ({ headers: new Headers(), success: true })),
  envInt: (_name: string, fallback: number) => fallback,
  rateLimitExceeded: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth/audit", async (original) => ({
  ...(await original<typeof import("@/lib/auth/audit")>()),
  writeAudit: mocks.audit,
}));
vi.mock("@/lib/domain-verification/dns-check", () => ({ checkDnsProof: mocks.dns }));
vi.mock("@/lib/domain-verification/model", async (original) => ({
  ...(await original<typeof import("@/lib/domain-verification/model")>()),
  newVerificationToken: () => "A".repeat(52),
}));
const project = {
  id: "project_1",
  publicId: "prj_a00000000000000000000000",
  name: "Example",
  domain: "example.com",
  ownerId: "user_1",
  writeMode: "active",
  createdAt: new Date("2026-01-01Z"),
  updatedAt: new Date("2026-01-01Z"),
};
const path = `/projects/${project.publicId}/domain-verification`;
async function call(method: string, route: string, body?: unknown) {
  const req = new Request(`https://example.com/api/v1${route}`, {
    method,
    headers: {
      authorization: "Bearer fixture",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return handleApiRequest(req, route.split("/").filter(Boolean));
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.row = null;
  mocks.auth.mockResolvedValue({
    kind: "project_key",
    apiKey: {
      id: "key_1",
      name: "Test",
      prefix: "fixture",
      projectId: project.id,
      scopes: ["admin"],
    },
    project,
  });
  mocks.prisma.instanceSetting.findUnique.mockResolvedValue({ value: "1" });
  mocks.prisma.project.findUniqueOrThrow.mockResolvedValue(project);
  mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
  mocks.prisma.projectDomainVerification.findUnique.mockImplementation(async () => mocks.row);
  mocks.prisma.projectDomainVerification.findUniqueOrThrow.mockImplementation(
    async () => mocks.row,
  );
  mocks.prisma.projectDomainVerification.upsert.mockImplementation(async ({ create }) => {
    mocks.row = { id: "row", revision: 0, ...create, updatedAt: new Date("2026-01-01Z") };
    return mocks.row;
  });
  mocks.prisma.projectDomainVerification.updateMany.mockImplementation(async ({ data }) => {
    mocks.row = { ...mocks.row, ...data, revision: Number(mocks.row?.revision ?? 0) + 1 };
    return { count: 1 };
  });
  mocks.dns.mockResolvedValue("verified");
  mocks.audit.mockResolvedValue(undefined);
});
it("starts, reads and verifies a project challenge through the router", async () => {
  const started = await call("POST", path, { method: "dns_txt" });
  expect(started.status).toBe(200);
  const read = await call("GET", path);
  expect(read.status).toBe(200);
  expect((await read.json()).data.dns_value).toBe(`bisibility-site-verification=${"A".repeat(52)}`);
  const checked = await call("POST", `${path}/check`);
  expect(checked.status).toBe(200);
  expect((await checked.json()).data.verified_at).not.toBeNull();
  expect(mocks.audit).toHaveBeenLastCalledWith(
    expect.objectContaining({
      actorId: null,
      action: "project.domain_verification.grant",
      after: expect.objectContaining({ source: "manual", apiKeyId: "key_1" }),
    }),
    mocks.prisma,
  );
});

it("returns the same verified state through MCP and REST", async () => {
  await call("POST", path, { method: "dns_txt" });
  const checked = await dispatchMcpTool(
    "check_domain_verification",
    { project_id: project.publicId },
    "fixture",
  );
  expect(checked.ok).toBe(true);
  const read = await call("GET", path);
  expect(await read.json()).toEqual(checked.payload);
  expect(
    (checked.payload as { data: { verified_at: string | null } }).data.verified_at,
  ).not.toBeNull();
});
