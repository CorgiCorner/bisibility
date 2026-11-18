import { expect, it } from "vitest";
import { composerContentKey } from "./composer-revision";
import { input, result } from "./contract-fixtures.test-support";
import { modelColumnSchema } from "./schema";
import { modelColumnResultSchema } from "./types";

// Synthetic IDs and provider selections; no account or live-response evidence.
const workspaceId = "wrkspc_SyntheticWorkspace000001";
it.each(["anthropic", "vercel_ai_gateway"] as const)(
  "retains typed settings in frozen %s columns and content identity",
  (providerId) => {
    const draft = input();
    const column = draft.columns[0];
    column.providerId = providerId;
    const before = composerContentKey(draft);
    Object.assign(
      column.settings,
      providerId === "anthropic" ? { workspaceId } : { allowedProviders: ["anthropic", "bedrock"] },
    );
    expect(modelColumnSchema.parse(column)).toEqual(column);
    expect(composerContentKey(draft)).not.toBe(before);
  },
);
it.each(["openai", "openrouter", "vercel_ai_gateway"])(
  "rejects workspace selection on %s",
  (providerId) => {
    const column = { ...input().columns[0], providerId };
    Object.assign(column.settings, { workspaceId });
    expect(modelColumnSchema.safeParse(column).success).toBe(false);
  },
);
it.each(["", "other_id", "wrkspc_a b", "wrkspc_a\n", `wrkspc_${"a".repeat(65)}`])(
  "rejects invalid workspace %j",
  (workspaceId) => {
    const column = { ...input().columns[0], providerId: "anthropic" };
    Object.assign(column.settings, { workspaceId });
    expect(modelColumnSchema.safeParse(column).success).toBe(false);
  },
);
it.each(
  [
    [],
    ["anthropic", "anthropic"],
    ["Anthropic"],
    ["not-a-documented-provider"],
    Array(17).fill("bedrock"),
  ].map((allowedProviders) => ({ allowedProviders })),
)("rejects invalid explicit provider sets %j", ({ allowedProviders }) => {
  const column = { ...input().columns[0], providerId: "vercel_ai_gateway" };
  Object.assign(column.settings, { allowedProviders });
  expect(modelColumnSchema.safeParse(column).success).toBe(false);
});
it.each(["openai", "anthropic", "openrouter"])("rejects allowedProviders on %s", (providerId) => {
  const column = { ...input().columns[0], providerId };
  Object.assign(column.settings, { allowedProviders: ["bedrock"] });
  expect(modelColumnSchema.safeParse(column).success).toBe(false);
});
it("retains observed workspace and a typed routing violation without failing a paid answer", () => {
  const value = result();
  value.column.providerId = "anthropic";
  Object.assign(value.column.settings, { workspaceId });
  expect(
    modelColumnResultSchema.parse({
      ...value,
      resolvedWorkspaceId: "wrkspc_ObservedSynthetic000001",
    }),
  ).toMatchObject({ state: "completed", resolvedWorkspaceId: "wrkspc_ObservedSynthetic000001" });
  value.column.providerId = "vercel_ai_gateway";
  delete (value.column.settings as Record<string, unknown>).workspaceId;
  Object.assign(value.column.settings, { allowedProviders: ["bedrock"] });
  value.actualProviderId = "anthropic";
  expect(
    modelColumnResultSchema.parse({ ...value, routingViolation: "provider_outside_allowed_set" }),
  ).toMatchObject({ state: "completed", usage: value.usage });
});
