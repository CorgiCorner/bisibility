import {
  documentedInspection,
  documentedSitemap,
} from "@/lib/providers/analytics/gsc-indexing-fixtures.test-support";
import { normalizeGscInspection } from "@/lib/providers/analytics/gsc-inspection-result";
import { normalizeGscSitemap } from "@/lib/providers/analytics/gsc-sitemaps";
import { beforeEach, expect, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sleep: vi.fn(),
  startProperty: vi.fn(),
  record429: vi.fn(),
  auth: vi.fn(),
  credentials: vi.fn(),
  audit: vi.fn(),
  reauth: vi.fn(),
  emit: vi.fn(),
  provider: {
    listSitemaps: vi.fn(),
    getSitemapStatus: vi.fn(),
    createUrlInspectionSession: vi.fn(),
    inspectUrl: vi.fn(),
  },
  prisma: {
    keyword: { findMany: vi.fn() },
    providerConnection: { findFirst: vi.fn() },
    project: { findFirst: vi.fn(), findUniqueOrThrow: vi.fn() },
    auditLog: { findMany: vi.fn() },
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    urlPresence: { findMany: vi.fn(), upsert: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
    urlPresenceChange: { create: vi.fn(), findMany: vi.fn() },
    projectDefaults: { findUnique: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("./auth", async (original) => ({
  ...(await original<typeof import("./auth")>()),
  authenticateBearer: mocks.auth,
}));
vi.mock("./ratelimit", () => ({
  checkRateLimit: vi.fn(async () => ({ headers: new Headers(), success: true })),
}));
vi.mock("./idempotency", () => ({ withIdempotency: vi.fn((_ctx, execute) => execute()) }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/traffic/runtime-credentials", () => ({
  trafficRuntimeCredentials: mocks.credentials,
}));
vi.mock("@/lib/providers/analytics/gsc", () => ({ gscAnalyticsProvider: mocks.provider }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("@/lib/providers/auth-state", () => ({ markProviderNeedsReauth: mocks.reauth }));
vi.mock("@/lib/presence/inspection-retry", async (original) => {
  const module = await original<typeof import("@/lib/presence/inspection-retry")>();
  return {
    ...module,
    createInspectionRetry: () => module.createInspectionRetry({ sleep: mocks.sleep }),
  };
});
vi.mock("@/lib/presence/property-quota", async (original) => ({
  ...(await original<typeof import("@/lib/presence/property-quota")>()),
  startPropertyInspection: mocks.startProperty,
  recordProperty429: mocks.record429,
  readPropertyQuota: vi.fn(),
}));
vi.mock("@/lib/signals/emit", () => ({ emitSignal: mocks.emit }));

export const projectId = "prj_a00000000000000000000000";
export const project = {
  id: "project-db",
  publicId: projectId,
  name: "Example",
  domain: "example.com",
  ownerId: "owner",
  writeMode: "active",
  isSample: false,
};
export function authenticate(scopes = ["read", "write", "admin"]) {
  mocks.auth.mockResolvedValue({
    kind: "project_key",
    apiKey: { id: "key-db", scopes, projectId: project.id },
    project,
  });
}
export function createSearchIndexRequest(
  handleApiRequest: (req: Request, path: string[]) => Promise<Response>,
) {
  return function request(method: string, tail: string, body?: unknown, id = projectId) {
    const url = new URL(`https://example.test/api/v1/projects/${id}/search-index/${tail}`);
    return handleApiRequest(
      new Request(url, {
        method,
        headers: { authorization: "Bearer test", "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      url.pathname.slice("/api/v1/".length).split("/").map(decodeURIComponent),
    );
  };
}
export function noGoogleCalls() {
  for (const name of [
    "listSitemaps",
    "getSitemapStatus",
    "createUrlInspectionSession",
    "inspectUrl",
  ] as const)
    expect(mocks.provider[name]).not.toHaveBeenCalled();
}
beforeEach(() => {
  vi.resetAllMocks();
  authenticate();
  mocks.prisma.keyword.findMany.mockResolvedValue([]);
  mocks.prisma.project.findFirst.mockResolvedValue(project);
  mocks.prisma.providerConnection.findFirst.mockResolvedValue({
    id: "connection-db",
    provider: "gsc",
    credentialsEncrypted: "encrypted",
  });
  mocks.credentials.mockReturnValue({ apiKey: "test-refresh", login: "https://example.com/blog/" });
  mocks.prisma.urlPresence.findMany.mockResolvedValue([]);
  mocks.prisma.urlPresence.findUnique.mockImplementation(
    async ({ where }) =>
      (await mocks.prisma.urlPresence.findMany()).find(
        (row: { url: string }) => row.url === where.projectId_url.url,
      ) ?? null,
  );
  mocks.prisma.$transaction.mockImplementation((fn) => fn(mocks.prisma));
  mocks.prisma.project.findUniqueOrThrow.mockResolvedValue({
    ...project,
    defaults: { inspectionDailyLimit: 3 },
  });
  mocks.prisma.urlPresence.count.mockResolvedValue(0);
  mocks.prisma.auditLog.findMany.mockResolvedValue([]);
  mocks.prisma.$queryRaw.mockResolvedValue([{ now: new Date() }]);
  mocks.audit.mockResolvedValue({ id: "audit-db" });
  mocks.provider.listSitemaps.mockResolvedValue([normalizeGscSitemap(documentedSitemap)]);
  mocks.provider.getSitemapStatus.mockResolvedValue(normalizeGscSitemap(documentedSitemap));
  mocks.provider.createUrlInspectionSession.mockResolvedValue({
    inspectUrl: mocks.provider.inspectUrl,
  });
  mocks.provider.inspectUrl.mockResolvedValue(normalizeGscInspection(documentedInspection));
});

export { mocks };
