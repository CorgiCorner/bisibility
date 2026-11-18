import "./model-playground-real.test-helpers";
import { ModelTransportError, type ModelTransportErrorCode } from "@/lib/providers/model/errors";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { realServiceHarness, seams } from "./model-playground-real.test-helpers";
import { getModelPlaygroundService } from "./model-playground-service";

const h = realServiceHarness();
const categories: [ModelTransportErrorCode, number][] = [
  ["invalid_request", 400],
  ["invalid_credentials", 400],
  ["refused", 400],
  ["observer_required", 500],
  ["admission_refused", 500],
  ["rate_limited", 500],
  ["provider_error", 500],
  ["invalid_response", 500],
  ["timeout", 500],
  ["aborted", 500],
  ["network_error", 500],
  ["accounting_unknown", 500],
];

it.each(
  categories.flatMap(([code, status]) =>
    [false, true].flatMap((dispatched) =>
      ["catalog", "preview"].map((operation) => ({
        code,
        dispatched,
        operation,
        status: dispatched ? 500 : status,
      })),
    ),
  ),
)(
  "maps $operation $code (dispatched=$dispatched) to $status",
  async ({ code, dispatched, operation, status }) => {
    const provider = await seams.provider();
    seams.provider.mockResolvedValue({
      ...provider,
      probe: async () => {
        throw new ModelTransportError(code, dispatched);
      },
    });
    const response =
      operation === "catalog"
        ? await h.request("GET", h.catalogPath())
        : await h.request("POST", "runs/preview", h.input);
    expect(response.status).toBe(status);
    const body = await response.json();
    if (status === 400) expect(body.details.reason).toBe("validation_failed");
    else expect(body.data).toBeUndefined();
    expect(await h.count()).toBe(0);
    expect(h.calls).toHaveLength(0);
    // A working probe on the same connection is the positive control.
    seams.provider.mockResolvedValue(provider);
    expect((await h.request("GET", h.catalogPath())).status).toBe(200);
  },
);

it.each(["catalog", "preview"])(
  "keeps a server-side Zod error in %s a server failure",
  async (operation) => {
    const provider = await seams.provider();
    seams.provider.mockResolvedValue({
      ...provider,
      probe: async () => z.object({ models: z.array(z.string()) }).parse({ models: null }),
    });
    const response =
      operation === "catalog"
        ? await h.request("GET", h.catalogPath())
        : await h.request("POST", "runs/preview", h.input);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.data).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("models");
    seams.provider.mockResolvedValue(provider);
    expect((await h.request("GET", h.catalogPath())).status).toBe(200);
    expect(await h.count()).toBe(0);
    expect(h.calls).toHaveLength(0);
  },
);

it("rejects a workspace on another provider at the router before either connection parse", async () => {
  const column = h.input.columns[0];
  expect(column.providerId).not.toBe("anthropic");
  const check = vi.spyOn(getModelPlaygroundService(), "checkConnection");
  const invalid = structuredClone(h.input);
  invalid.columns[0].settings.workspaceId = "wrkspc_Fixture";
  const catalog = await h.request("GET", `${h.catalogPath()}&workspace_id=wrkspc_Fixture`);
  const preview = await h.request("POST", "runs/preview", invalid);
  expect([catalog.status, preview.status]).toEqual([400, 400]);
  for (const response of [catalog, preview])
    expect((await response.json()).type).toContain("validation_failed");
  expect(check).not.toHaveBeenCalled();
  expect(seams.decrypt).not.toHaveBeenCalled();
  expect(seams.provider).not.toHaveBeenCalled();
  // Same connection and columns without the invalid workspace pass both boundaries.
  expect((await h.request("GET", h.catalogPath())).status).toBe(200);
  expect((await h.request("POST", "runs/preview", h.input)).status).toBe(200);
  expect(check).toHaveBeenCalledTimes(2);
  expect(await h.count()).toBe(0);
  expect(h.calls).toHaveLength(0);
});
