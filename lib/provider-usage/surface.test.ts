import { describe, expect, it } from "vitest";
import {
  APP_REQUEST_ORIGIN,
  PROVIDER_CREDENTIAL_KINDS,
  PROVIDER_REQUEST_SURFACES,
  SOURCES_BY_SURFACE,
  surfaceOf,
} from "./surface";
import type { ProviderRequestSource } from "./tag";

describe("provider request surfaces", () => {
  it("classifies app-surface sources", () => {
    expect(surfaceOf("app")).toBe("app");
    expect(surfaceOf("worker")).toBe("app");
  });

  it("classifies null and undefined as the app surface for legacy rows", () => {
    expect(surfaceOf(null)).toBe("app");
    expect(surfaceOf(undefined)).toBe("app");
  });

  it("classifies programmatic-surface sources", () => {
    expect(surfaceOf("api")).toBe("programmatic");
    expect(surfaceOf("sdk")).toBe("programmatic");
    expect(surfaceOf("cli")).toBe("programmatic");
    expect(surfaceOf("mcp")).toBe("programmatic");
  });

  it("keeps the surface list closed", () => {
    expect(PROVIDER_REQUEST_SURFACES).toEqual(["app", "programmatic"]);
    expect(PROVIDER_CREDENTIAL_KINDS).toEqual(["project_key", "personal_token", "oauth_client"]);
  });

  it("partitions every source into exactly one surface", () => {
    expect([...SOURCES_BY_SURFACE.app]).toEqual(["app", "worker"]);
    expect([...SOURCES_BY_SURFACE.programmatic]).toEqual(["api", "sdk", "cli", "mcp"]);
    const all = [...SOURCES_BY_SURFACE.app, ...SOURCES_BY_SURFACE.programmatic];
    expect(new Set(all).size).toBe(all.length);
    for (const source of all as ProviderRequestSource[]) {
      expect(SOURCES_BY_SURFACE[surfaceOf(source)]).toContain(source);
    }
  });

  it("marks every UI request with the app request origin", () => {
    expect(APP_REQUEST_ORIGIN).toEqual({ source: "app" });
  });
});
