import { beforeEach, expect, it, vi } from "vitest";
import { handleApiRequest } from "./router";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  authenticate: vi.fn(),
  audit: vi.fn(),
  mail: vi.fn(),
  prisma: {
    project: { findUnique: vi.fn(), findFirst: vi.fn() },
    membership: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
    invite: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
    alertRuleRecipient: { deleteMany: vi.fn() },
    notificationPreference: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.session }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth/audit", () => ({
  writeAudit: mocks.audit,
  writeAuditFailure: vi.fn(async () => {}),
}));
vi.mock("./auth", async (original) => ({
  ...(await original<typeof import("./auth")>()),
  authenticateBearer: mocks.authenticate,
}));
vi.mock("./ratelimit", () => ({
  checkRateLimit: vi.fn(async () => ({ headers: new Headers(), success: true })),
}));
vi.mock("./idempotency", () => ({ withIdempotency: vi.fn((_ctx, run) => run()) }));
vi.mock("@/lib/actions/team-invite-delivery", () => ({
  assertInviteMailerReady: vi.fn(),
  deliverInvite: mocks.mail,
}));
vi.mock("@/lib/team/invite-rate-limit", () => ({ assertInviteResendAllowed: vi.fn() }));
const ref = "prj_aaaaaaaaaaaaaaaaaaaaaaaa";
const memberRef = "mbr_aaaaaaaaaaaaaaaaaaaaaaaa";
const inviteRef = "inv_aaaaaaaaaaaaaaaaaaaaaaaa";
const project = {
  id: "project-db",
  publicId: ref,
  name: "Example",
  ownerId: "owner",
  writeMode: "active",
};
function authenticate(role = "admin") {
  mocks.authenticate.mockResolvedValue({
    kind: "personal_token",
    memberships: [{ projectId: project.id, role }],
    token: { id: "pat", userId: "caller", scopes: ["read", "write", "admin"] },
    user: { id: "caller" },
  });
}
async function call(method: string, path: string[], body?: unknown) {
  return handleApiRequest(
    new Request(`https://example.test/api/v1/${path.join("/")}`, {
      method,
      headers: { authorization: "Bearer bsb_pat_live_fixture" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    path,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  authenticate();
  mocks.session.mockRejectedValue(new Error("No browser session"));
  mocks.prisma.project.findUnique.mockResolvedValue(project);
  mocks.prisma.project.findFirst.mockResolvedValue(project);
  mocks.prisma.membership.findFirst.mockResolvedValue({
    id: "member-db",
    publicId: memberRef,
    role: "member",
    userId: "member",
  });
  mocks.prisma.membership.update.mockResolvedValue({ publicId: memberRef, role: "viewer" });
  mocks.prisma.membership.findMany.mockResolvedValue([]);
  mocks.prisma.invite.findMany.mockResolvedValue([]);
  const invite = {
    id: "invite-db",
    publicId: inviteRef,
    role: "member",
    email: "fixture@example.test",
  };
  mocks.prisma.invite.findFirst.mockResolvedValue(invite);
  mocks.prisma.invite.update.mockResolvedValue(invite);
  mocks.prisma.$transaction.mockImplementation((run) => run(mocks.prisma));
  mocks.mail.mockResolvedValue({ status: "success" });
});
const mutations = [
  { method: "PATCH", tail: ["team", "members", memberRef], body: { role: "viewer" } },
  { method: "DELETE", tail: ["team", "members", memberRef] },
  { method: "POST", tail: ["team", "invites", inviteRef, "resend"] },
  { method: "DELETE", tail: ["team", "invites", inviteRef] },
];
it.each(mutations)(
  "executes authorized $method $tail using public project IDs",
  async ({ method, tail, body }) => {
    const response = await call(method, ["projects", ref, ...tail], body);
    expect(response.status).toBe(200);
    expect(mocks.prisma.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { publicId: ref } }),
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "caller", projectId: project.id }),
    );
    expect(mocks.session).not.toHaveBeenCalled();
  },
);
it.each(mutations)(
  "denies viewer $method $tail before domain access",
  async ({ method, tail, body }) => {
    authenticate("viewer");
    const response = await call(method, ["projects", ref, ...tail], body);
    expect(response.status).toBe(403);
    expect(mocks.prisma.membership.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.invite.findFirst).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  },
);
it.each(mutations)("denies another project for $method $tail", async ({ method, tail, body }) => {
  mocks.prisma.project.findUnique.mockResolvedValue({
    ...project,
    id: "other-db",
    publicId: "prj_bbbbbbbbbbbbbbbbbbbbbbbb",
  });
  const response = await call(method, ["projects", "prj_bbbbbbbbbbbbbbbbbbbbbbbb", ...tail], body);
  expect(response.status).toBe(404);
  expect(mocks.prisma.project.findFirst).not.toHaveBeenCalled();
  expect(mocks.audit).not.toHaveBeenCalled();
});
it.each(["members", "invites"])("lists team %s without a browser session", async (resource) => {
  const response = await call("GET", ["projects", ref, "team", resource]);
  expect(response.status).toBe(200);
  expect(mocks.session).not.toHaveBeenCalled();
});
it("does not let an admin PAT promote an existing member to admin", async () => {
  const response = await call("PATCH", ["projects", ref, "team", "members", memberRef], {
    role: "admin",
  });
  expect(response.status).toBe(403);
  expect(mocks.prisma.membership.update).not.toHaveBeenCalled();
});
