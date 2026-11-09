import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  issue: vi.fn(),
  check: vi.fn(),
  resource: vi.fn(),
}));
vi.mock("@/lib/domain-verification/service", () => ({
  readDomainVerification: mocks.read,
  issueDomainVerification: mocks.issue,
  checkDomainVerification: mocks.check,
  verificationResource: mocks.resource,
  DomainVerificationDisabledError: class extends Error {},
  DomainVerificationNotStartedError: class extends Error {},
}));

import type { ApiContext } from "./context";
import { domainVerification } from "./domain-verification";

const actor = { id: "user", memberships: [{ projectId: "internal", role: "owner" as const }] };
function context(pathProject = "prj_example", body: unknown = {}) {
  return {
    auth: { project: { id: "internal", publicId: "prj_example" } },
    actor,
    actorId: "user",
    path: ["projects", pathProject, "domain-verification"],
    headers: new Headers(),
    instance: "test",
    req: new Request("http://example.com/", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  } as unknown as ApiContext;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.resource.mockReturnValue({ domain: "example.com", verified_at: null });
});
it("returns the shared state in the API envelope", async () => {
  mocks.read.mockResolvedValue({ id: "row" });
  const result = await domainVerification(context(), "read");
  expect(await result.json()).toEqual({ data: { domain: "example.com", verified_at: null } });
  expect(mocks.read).toHaveBeenCalledWith("internal", actor);
});
it("starts verification using validated input and caller audit identity", async () => {
  await domainVerification(context("prj_example", { method: "dns_txt" }), "issue");
  expect(mocks.issue).toHaveBeenCalledWith("internal", actor, { method: "dns_txt" }, "user");
});
it("rejects a mismatched project without calling the service", async () => {
  const result = await domainVerification(context("prj_other"), "read");
  expect(result.status).toBe(403);
  expect(mocks.read).not.toHaveBeenCalled();
});
it("forwards user and project-key audit identities on checks", async () => {
  await domainVerification(context(), "check");
  expect(mocks.check).toHaveBeenLastCalledWith("internal", actor, "user", undefined);
  const keyed = context();
  keyed.actorId = null;
  keyed.auth.apiKey = { id: "key-id" } as ApiContext["auth"]["apiKey"];
  await domainVerification(keyed, "check");
  expect(mocks.check).toHaveBeenLastCalledWith("internal", actor, null, "key-id");
});
