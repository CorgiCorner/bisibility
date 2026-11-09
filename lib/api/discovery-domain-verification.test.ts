import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ enabled: vi.fn() }));
vi.mock("@/lib/domain-verification/feature", () => ({ domainVerificationEnabled: mocks.enabled }));

import { getOpenApi } from "./discovery";

const path = "/projects/{project_id}/domain-verification";
beforeEach(() => {
  vi.clearAllMocks();
});
it("omits the domain verification contract when the feature is disabled", async () => {
  mocks.enabled.mockResolvedValue(false);
  const body = await (await getOpenApi({ headers: new Headers() })).json();
  expect(body.paths).not.toHaveProperty(path);
  expect(body.components.schemas).not.toHaveProperty("DomainVerification");
});
it("exposes the complete contract when enabled", async () => {
  mocks.enabled.mockResolvedValue(true);
  const body = await (await getOpenApi({ headers: new Headers() })).json();
  expect(body.paths).toHaveProperty(path);
  expect(body.components.schemas).toHaveProperty("DomainVerification");
});
it("hides the contract if the setting cannot be read", async () => {
  mocks.enabled.mockRejectedValue(new Error("unavailable"));
  const body = await (await getOpenApi({ headers: new Headers() })).json();
  expect(body.paths).not.toHaveProperty(path);
});
