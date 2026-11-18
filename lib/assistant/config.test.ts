import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ credentials: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    assistantCredential: { findMany: mocks.credentials },
    projectAiFundingPreference: { findMany: async () => [] },
  },
}));
vi.mock("./access", () => ({
  assistantEnabled: () => true,
  assistantProject: async () => ({
    id: "project",
    publicId: "prj_test",
    ownerId: "owner",
    name: "Test",
    role: "viewer",
    readOnly: true,
  }),
}));
vi.mock("./project-model-credential", () => ({ readProjectModelCredential: async () => null }));
vi.mock("./funding-extension", () => ({
  assistantCreditsEnabled: () => false,
  creditsFundingOption: async (_user: unknown, provider: string) => ({
    mode: "credits",
    provider,
    available: false,
    reason: "pricing_unavailable",
    usage: null,
    credential: null,
  }),
}));

import { assistantConfig } from "./config";
import { assistantDevFakeProvider, isAssistantFakeProviderEnabled } from "./provider-fake-env";

const model = {
  id: "model",
  provider: "openai",
  providerModel: "test",
  label: "Test",
  toolUse: true,
  maxOutputTokens: 1,
  contextChars: 100,
  pricing: {
    version: "v",
    inputMicroUsdPerMTok: 1,
    cachedInputMicroUsdPerMTok: 1,
    cacheWriteMicroUsdPerMTok: 1,
    outputMicroUsdPerMTok: 1,
  },
};
const allowedEnv = new Set([
  "ASSISTANT_ENABLED",
  "ASSISTANT_MODELS_JSON",
  "ASSISTANT_OPENAI_API_KEY",
  "ASSISTANT_ANTHROPIC_API_KEY",
  "ASSISTANT_OPENROUTER_API_KEY",
  "ASSISTANT_DEV_FAKE_PROVIDER",
]);

afterEach(() => vi.unstubAllEnvs());

test("config offers BYOK from models and the stored credential, without spending caps", async () => {
  vi.stubEnv("ASSISTANT_MODELS_JSON", JSON.stringify([model]));
  mocks.credentials.mockResolvedValue([
    { id: "credential", provider: "openai", last4: "abcd", status: "active" },
  ]);
  const enabled = await assistantConfig("prj_test", "user");
  expect(
    enabled.funding.find((item) => item.mode === "byok" && item.provider === "openai"),
  ).toMatchObject({
    available: true,
    reason: null,
    credential: { id: "credential", last4: "abcd", status: "active" },
  });
  expect(enabled.limits.maxSteps).toBe(6);
  expect(enabled.project.readOnly).toBe(true);
  expect(JSON.stringify(enabled)).not.toContain("apiKey");
});

test("fake provider delay is a positive integer capped at 2000 and refused in production", () => {
  expect(assistantDevFakeProvider()).toEqual({ enabled: false, delayMs: 0 });
  vi.stubEnv("ASSISTANT_DEV_FAKE_PROVIDER", "1");
  expect(assistantDevFakeProvider()).toEqual({ enabled: true, delayMs: 0 });
  vi.stubEnv("ASSISTANT_DEV_FAKE_PROVIDER", "50");
  expect(assistantDevFakeProvider()).toEqual({ enabled: true, delayMs: 50 });
  vi.stubEnv("ASSISTANT_DEV_FAKE_PROVIDER", "9000");
  expect(assistantDevFakeProvider()).toEqual({ enabled: true, delayMs: 2000 });
  for (const invalid of ["0", "01", "1.5", ""]) {
    vi.stubEnv("ASSISTANT_DEV_FAKE_PROVIDER", invalid);
    expect(assistantDevFakeProvider().enabled).toBe(false);
  }
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("ASSISTANT_DEV_FAKE_PROVIDER", "50");
  expect(assistantDevFakeProvider().enabled).toBe(true);
  expect(isAssistantFakeProviderEnabled()).toBe(false);
});

test("assistant code reads only the remaining environment variables", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name.endsWith(".test.ts") || name.endsWith(".test.tsx"))
        continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx|mjs|js)$/.test(name)) files.push(path);
    }
  };
  walk("lib");
  walk("app");
  const offenders: string[] = [];
  const named = /process\.env\.ASSISTANT_[A-Z0-9_]+/g;
  const indexed = /process\.env\[['"](ASSISTANT_[A-Z0-9_]+)['"]\]/g;
  const dynamic = /process\.env\[`ASSISTANT_/;
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    if (dynamic.test(text)) offenders.push(`${file}: dynamic ASSISTANT_ read`);
    for (const match of text.matchAll(named)) {
      const name = match[0].slice("process.env.".length);
      if (!allowedEnv.has(name)) offenders.push(`${file}: ${name}`);
    }
    for (const match of text.matchAll(indexed)) {
      const name = match[1] ?? "";
      if (!allowedEnv.has(name)) offenders.push(`${file}: ${name}`);
    }
  }
  expect(offenders).toEqual([]);
});
