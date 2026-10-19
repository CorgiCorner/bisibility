import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  DeploymentAdmissionExhaustedError,
  OwnProviderKeyRequiredError,
} from "@/lib/providers/execution-extension-errors";
import { ProviderChainError } from "@/lib/rank-check/provider-chain-error";
import { errorFromUnknown } from "./error-mapper";

const url = new URL("https://example.com/api/v1/projects/prj_a00000000000000000000000/backlinks");
const refusal = () =>
  new OwnProviderKeyRequiredError({
    capability: "backlinks",
    projectId: "project_1",
    provider: "dataforseo",
  });

async function problem(response: Response) {
  expect(response.headers.get("Content-Type")).toBe("application/problem+json");
  return response.json();
}

describe("byok_required problem", () => {
  it("names the provider and capability, with no credits or retry hint", async () => {
    const response = errorFromUnknown(
      refusal(),
      new Headers({ "Retry-After": "60", "X-Request-Id": "synthetic-request" }),
      url,
      { balance_cents: 100, top_up_url: "/app/prj_a00000000000000000000000/settings/billing" },
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("Retry-After")).toBeNull();
    expect(response.headers.get("X-Request-Id")).toBe("synthetic-request");
    const body = await problem(response);
    expect(body).toMatchObject({
      type: "https://bisibility.com/problems/byok_required",
      title: "Own provider key required",
      status: 403,
      details: { capability: "backlinks", provider: "dataforseo" },
    });
    expect(body.detail).toContain("Connect your own DataForSEO key");
    expect(body.details).not.toHaveProperty("top_up_url");
  });

  it("surfaces the refusal from an exhausted rank-check provider chain", async () => {
    const chain = new ProviderChainError(
      [{ message: "refused", provider: "dataforseo", reason: "allocation_exhausted" }],
      refusal(),
    );
    const body = await problem(errorFromUnknown(chain, new Headers(), url));
    expect(body.type).toBe("https://bisibility.com/problems/byok_required");
  });

  it("keeps credits_exhausted for an ordinary balance refusal", async () => {
    const response = errorFromUnknown(
      new DeploymentAdmissionExhaustedError("balance"),
      new Headers(),
      url,
    );
    expect(response.status).toBe(402);
    expect((await problem(response)).type).toBe(
      "https://bisibility.com/problems/credits_exhausted",
    );
  });
});
