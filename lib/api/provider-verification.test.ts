import type { ProviderCatalogItem } from "@/lib/providers/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  probeProviderConnection,
  verifyProviderConnectionBeforeSave,
} from "./provider-verification";

const mocks = vi.hoisted(() => ({
  consumeProviderLimit: vi.fn(),
  testConnection: vi.fn(),
}));

vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: mocks.consumeProviderLimit,
}));
vi.mock("@/lib/providers/registry", () => ({
  getAnalyticsProvider: () => ({ testConnection: mocks.testConnection }),
  getSerpProvider: () => ({ testConnection: mocks.testConnection }),
}));

const provider = {
  defaultStatus: "optional",
  id: "ga4",
  kind: "analytics",
  label: "Google Analytics 4",
  logoDomain: "google.com",
  requiredCredentials: ["apiKey", "login"],
} satisfies ProviderCatalogItem;

describe("probeProviderConnection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consumeProviderLimit.mockResolvedValue({ success: true });
  });

  it("probes fresh credentials through the provider adapter", async () => {
    mocks.testConnection.mockResolvedValue({ message: "Connection OK", ok: true });

    await expect(
      probeProviderConnection({
        credentials: { apiKey: "refresh_token", login: "123456789" },
        projectId: "project_1",
        provider,
      }),
    ).resolves.toEqual({ message: "Connection OK", ok: true });

    expect(mocks.testConnection).toHaveBeenCalledOnce();
    expect(mocks.testConnection).toHaveBeenCalledWith({
      apiKey: "refresh_token",
      login: "123456789",
    });
  });

  it("returns the adapter's actionable failure without persisting anything", async () => {
    mocks.testConnection.mockResolvedValue({
      message: "Property 123456789 was not found. Re-select it.",
      ok: false,
    });

    await expect(
      probeProviderConnection({
        credentials: { apiKey: "refresh_token", login: "123456789" },
        projectId: "project_1",
        provider,
      }),
    ).resolves.toEqual({
      message: "Property 123456789 was not found. Re-select it.",
      ok: false,
    });
  });

  it("returns an explicit rate-limit discriminant without calling the adapter", async () => {
    mocks.consumeProviderLimit.mockResolvedValue({ success: false });

    await expect(
      probeProviderConnection({
        credentials: { apiKey: "refresh_token", login: "123456789" },
        projectId: "project_1",
        provider,
      }),
    ).resolves.toEqual({
      message: "Rate limited, try again shortly.",
      ok: false,
      rateLimited: true,
    });
    expect(mocks.testConnection).not.toHaveBeenCalled();
  });

  it("uses the discriminant instead of interpreting an adapter message", async () => {
    mocks.testConnection.mockResolvedValue({
      message: "Rate limited, try again shortly.",
      ok: false,
    });

    await expect(
      verifyProviderConnectionBeforeSave({
        credentials: { apiKey: "refresh_token", login: "123456789" },
        hasStoredCredentials: false,
        projectId: "project_1",
        provider,
      }),
    ).rejects.toThrow("Connection test failed: Rate limited, try again shortly.");
  });

  it("maps an actual probe rate limit to the pre-save error", async () => {
    mocks.consumeProviderLimit.mockResolvedValue({ success: false });

    await expect(
      verifyProviderConnectionBeforeSave({
        credentials: { apiKey: "refresh_token", login: "123456789" },
        hasStoredCredentials: false,
        projectId: "project_1",
        provider,
      }),
    ).rejects.toThrow("Provider connection test is rate limited. Try again shortly.");
  });
});
