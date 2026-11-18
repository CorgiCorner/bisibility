import { interceptedFetch, json } from "@/lib/providers/model/transport.test-support";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import text from "./__fixtures__/text.json";
import { vercelAiGatewayProvider } from "./adapter";
import { context, observer, request } from "./adapter.test-support";

vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: vi.fn(async () => ({ success: true })),
}));
let network: ReturnType<typeof interceptedFetch>;
beforeEach(() => {
  network = interceptedFetch();
});
afterEach(() => vi.unstubAllGlobals());
// All selections are synthetic; shapes come from the official REST reference.
it("sends only provider eligibility and preserves out-of-set answers and money", async () => {
  const input = request();
  Object.assign(input.column.settings, { allowedProviders: ["bedrock"] });
  const body = structuredClone(text);
  Object.assign(body.choices[0].message, {
    provider_metadata: {
      gateway: { cost: "0.001", routing: { finalProvider: "anthropic", modelAttempts: [] } },
    },
  });
  network.mockResolvedValueOnce(json(JSON.stringify(body)));
  const value = await vercelAiGatewayProvider.generate(context(), input, observer());
  expect(value).toMatchObject({
    state: "completed",
    answer: body.choices[0].message.content,
    actualProviderId: "anthropic",
    routingViolation: "provider_outside_allowed_set",
    routingAttemptCredentials: { completeness: "partial" },
  });
  expect(value.usage.inputTokens).toBe(body.usage.prompt_tokens);
  const sent = JSON.parse(String(network.mock.calls[0][1]?.body));
  expect(sent.providerOptions).toEqual({ gateway: { only: ["bedrock"] } });
  expect(sent).not.toHaveProperty("providerOptions.gateway.order");
  expect(network).toHaveBeenCalledOnce();
});
it("rejects an empty set before admission or fetch", async () => {
  const input = request();
  Object.assign(input.column.settings, { allowedProviders: [] });
  const callbacks = observer();
  await expect(vercelAiGatewayProvider.generate(context(), input, callbacks)).rejects.toMatchObject(
    { code: "invalid_request", dispatched: false },
  );
  expect(callbacks.beforeDispatch).not.toHaveBeenCalled();
  expect(network).not.toHaveBeenCalled();
});
it("returns a normal failure with no relaxed retry when the allowed providers cannot serve", async () => {
  const input = request();
  Object.assign(input.column.settings, { allowedProviders: ["bedrock"] });
  network.mockResolvedValueOnce(
    json('{"error":"synthetic provider unavailable"}', { status: 503 }),
  );
  await expect(
    vercelAiGatewayProvider.generate(context(), input, observer()),
  ).rejects.toMatchObject({ code: "provider_error", dispatched: true });
  expect(network).toHaveBeenCalledOnce();
});

it("retains reported cost and failed-attempt evidence when the final provider violates eligibility", async () => {
  const { default: routed } = await import("./__fixtures__/routed.json");
  const input = request();
  input.column.settings.allowedProviders = ["anthropic"];
  network.mockResolvedValueOnce(json(JSON.stringify(routed)));
  const value = await vercelAiGatewayProvider.generate(context(), input, observer());
  expect(value).toMatchObject({
    state: "completed",
    routingViolation: "provider_outside_allowed_set",
    actualProviderId: "bedrock",
    providerCost: {
      amount: routed.choices[0].message.provider_metadata.gateway.cost,
      certainty: "reported",
    },
    costEvidence: {
      providerReported: {
        money: { amount: routed.choices[0].message.provider_metadata.gateway.cost },
      },
    },
    routingAttemptCredentials: { completeness: "partial" },
  });
});
it.each([null, "bedrock"])(
  "does not infer a violation for missing or eligible final identity %s",
  async (finalProvider) => {
    const input = request();
    input.column.settings.allowedProviders = ["bedrock"];
    const body = structuredClone(text);
    Object.assign(body.choices[0].message, {
      provider_metadata: { gateway: { routing: finalProvider === null ? {} : { finalProvider } } },
    });
    network.mockResolvedValueOnce(json(JSON.stringify(body)));
    const value = await vercelAiGatewayProvider.generate(context(), input, observer());
    expect(value.actualProviderId).toBe(finalProvider);
    expect(value.routingViolation).toBeUndefined();
    expect(value.state).toBe("completed");
  },
);
it("omits provider restrictions when the setting is absent", async () => {
  network.mockResolvedValueOnce(json(JSON.stringify(text)));
  await vercelAiGatewayProvider.generate(context(), request(), observer());
  expect(JSON.parse(String(network.mock.calls[0][1]?.body))).not.toHaveProperty("providerOptions");
});
