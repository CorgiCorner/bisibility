import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveProviderCredentials, resolveProviderCredentialsWithOverrides } from "./credentials";
import { encryptSecret } from "./crypto";

const stored = () =>
  encryptSecret(JSON.stringify({ login: "stored-user@example.com", password: "stored-password" }));

describe("resolveProviderCredentials", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prefers the stored secret over env credentials", () => {
    vi.stubEnv("DATAFORSEO_LOGIN", "env-user");
    vi.stubEnv("DATAFORSEO_PASSWORD", "env-password");

    expect(resolveProviderCredentials("dataforseo", stored())).toEqual({
      login: "stored-user@example.com",
      password: "stored-password",
    });
  });
});

describe("resolveProviderCredentialsWithOverrides", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the stored credentials when no overrides are supplied", () => {
    expect(resolveProviderCredentialsWithOverrides("dataforseo", stored(), {})).toEqual({
      login: "stored-user@example.com",
      password: "stored-password",
    });
  });

  it("layers overrides on top of the stored secret so blanks keep stored values", () => {
    expect(
      resolveProviderCredentialsWithOverrides("dataforseo", stored(), {
        login: "new-user@example.com",
      }),
    ).toEqual({
      login: "new-user@example.com",
      password: "stored-password",
    });
  });

  it("falls back to env credentials only when nothing is stored and nothing is supplied", () => {
    vi.stubEnv("SERPAPI_API_KEY", "env-key");

    expect(resolveProviderCredentialsWithOverrides("serpapi", null, {})).toEqual({
      apiKey: "env-key",
    });
  });

  it("never mixes env credentials into partial overrides", () => {
    vi.stubEnv("DATAFORSEO_LOGIN", "env-user");
    vi.stubEnv("DATAFORSEO_PASSWORD", "env-password");

    expect(
      resolveProviderCredentialsWithOverrides("dataforseo", null, { login: "typed-user" }),
    ).toEqual({ login: "typed-user" });
  });
});
