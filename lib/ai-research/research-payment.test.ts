import { expect, it, vi } from "vitest";
import { capabilities } from "./catalog-fixtures.test-support";
import { prepareResearchAiPayment } from "./research-payment";
import { promptSchema } from "./schema";

vi.mock("@/lib/providers/crypto", () => ({ getPurposeSecretKeys: () => [Buffer.alloc(32, 7)] }));
const bounded = vi.hoisted(() => vi.fn());
vi.mock("@/lib/action-payment/session", () => ({ prepareActionPayment: bounded }));
const source = {
  project: { id: "project", ownerId: "owner" },
  connection: {
    id: "connection",
    publicId: "conn_aaaaaaaaaaaaaaaaaaaaaaaa",
    provider: "dataforseo",
    credentialSource: "own",
    credentialsEncrypted: "fictional-cipher",
  },
  provider: {
    id: "dataforseo",
    label: "DataForSEO",
    payment: { unit: { kind: "currency", code: "USD" }, basis: "provider_cost" },
  },
} as unknown as Parameters<typeof prepareResearchAiPayment>[3];
const context = { projectId: "project", actorId: "actor", origin: { source: "app" as const } };
it("passes cache-free state into the bounded quote without treating historical price as today's debit", async () => {
  const input = promptSchema.parse({
    brand: "Acme",
    domain: "acme.com",
    prompt: "question",
    max_cost_cents: 5,
    estimate_only: true,
  });
  await prepareResearchAiPayment(
    context,
    "prompt_explorer",
    input,
    source,
    { policy: "legacy_dated", estimate: 3 },
    true,
  );
  expect(bounded).toHaveBeenLastCalledWith(
    expect.objectContaining({
      children: [
        expect.objectContaining({ cached: true }),
        expect.objectContaining({ cached: true }),
      ],
    }),
  );
});
it("does not convert own actual-cost forecast/advisory amount into a provider hard limit", async () => {
  const input = promptSchema.parse({
    brand: "Acme",
    domain: "acme.com",
    prompt: "question",
    models: ["gpt-4.1-mini"],
    cost_policy: "provider_actual_cost",
    actual_cost_acknowledgement: "non_guaranteed_estimate_v1",
    estimated_cost_limit_cents: 5,
    estimate_only: true,
  });
  const admission = {
    policy: "provider_actual_cost" as const,
    estimate: 0.5,
    capabilities,
    credentialReference: "fixture",
  };
  const preview = await prepareResearchAiPayment(
    context,
    "prompt_explorer",
    input,
    source,
    admission,
  );
  expect(preview).not.toBeNull();
  const accepted = await prepareResearchAiPayment(
    context,
    "prompt_explorer",
    {
      ...input,
      estimate_only: false,
      accepted_payment: { quote_token: preview!.quote.quoteToken },
      require_payment: true,
    },
    source,
    admission,
  );
  const child = accepted!.child("gpt-4.1-mini");
  expect(child).toBeDefined();
  expect(child).not.toHaveProperty("costLimit");
  expect(child?.snapshot.credentialSource).toBe("own");
  accepted!.bindExecution("retained-run");
  expect(accepted!.consent).toBeDefined();
});

it("keeps bounded settlement evidence live after child accounting finishes", async () => {
  let attempted = false;
  bounded.mockResolvedValueOnce({
    quote: { id: "quote" },
    options: [],
    get hasAttempted() {
      return attempted;
    },
    receipt: () => ({ state: attempted ? "settled" : "free" }),
    child: () => undefined,
  });
  const input = promptSchema.parse({
    brand: "Acme",
    domain: "acme.com",
    prompt: "question",
    max_cost_cents: 5,
    estimate_only: true,
  });
  const payment = await prepareResearchAiPayment(context, "prompt_explorer", input, source, {
    policy: "legacy_dated",
    estimate: 3,
  });
  expect(payment?.hasAttempted).toBe(false);
  attempted = true;
  expect(payment?.hasAttempted).toBe(true);
});
