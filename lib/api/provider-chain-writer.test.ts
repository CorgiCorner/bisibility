import { describe, expect, it, vi } from "vitest";
import { connectedProviderChainSettings } from "./provider-chain-writer";

const client = {
  providerConnection: { findMany: vi.fn(async () => [{ enabled: true, priority: 0 }]) },
} as never;
describe("SERP connection activation", () => {
  it("keeps a retained fallback disabled when credentials are connected", async () => {
    expect(
      await connectedProviderChainSettings(
        "project",
        "serp",
        { enabled: false, priority: 1 },
        { enabled: true },
        {},
        client,
      ),
    ).toEqual({ enabled: false, priority: 1 });
  });
  it("does not activate a secondary placeholder when its credentials are first added", async () => {
    expect(
      await connectedProviderChainSettings(
        "project",
        "serp",
        { enabled: true, priority: 1, status: "ready" },
        { enabled: true },
        {},
        client,
      ),
    ).toEqual({ enabled: false, priority: 1 });
  });
  it("preserves an explicitly enabled fallback when reconnecting", async () => {
    expect(
      await connectedProviderChainSettings(
        "project",
        "serp",
        { enabled: true, priority: 1 },
        { enabled: true },
        {},
        client,
      ),
    ).toEqual({ enabled: true, priority: 1 });
  });
  it("does not activate an additional new connection", async () => {
    expect(
      await connectedProviderChainSettings("project", "serp", null, { enabled: true }, {}, client),
    ).toEqual({ enabled: false, priority: 1 });
  });
});
