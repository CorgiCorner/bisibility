import { describe, expect, it } from "vitest";
import { temporalConnectionOptions, temporalWebUiUrl } from "./connection-options";

describe("temporalConnectionOptions", () => {
  it("uses the local plaintext server by default", () => {
    expect(temporalConnectionOptions({})).toEqual({ address: "localhost:7233" });
  });

  it("enables TLS automatically when an API key is configured", () => {
    expect(
      temporalConnectionOptions({
        TEMPORAL_ADDRESS: "namespace.account.tmprl.cloud:7233",
        TEMPORAL_API_KEY: "secret",
      }),
    ).toEqual({
      address: "namespace.account.tmprl.cloud:7233",
      apiKey: "secret",
      tls: true,
    });
  });

  it("allows TLS without an API key", () => {
    expect(
      temporalConnectionOptions({
        TEMPORAL_ADDRESS: "temporal.internal:7233",
        TEMPORAL_TLS: "on",
      }),
    ).toEqual({ address: "temporal.internal:7233", tls: true });
  });

  it("rejects an invalid TLS value", () => {
    expect(() => temporalConnectionOptions({ TEMPORAL_TLS: "sometimes" })).toThrow(
      "TEMPORAL_TLS must be a boolean value",
    );
  });
});

describe("temporalWebUiUrl", () => {
  it("returns the local Web UI for the default address", () => {
    expect(temporalWebUiUrl({ address: "localhost:7233" })).toBe("http://localhost:8233");
  });

  it("returns the local Web UI for the IPv4 loopback address", () => {
    expect(temporalWebUiUrl({ address: "127.0.0.1:7233" })).toBe("http://localhost:8233");
  });

  it("does not return a local Web UI when an API key is configured", () => {
    expect(temporalWebUiUrl({ address: "localhost:7233", apiKey: "secret" })).toBeUndefined();
  });

  it("does not return a local Web UI for a TLS endpoint", () => {
    expect(temporalWebUiUrl({ address: "localhost:7233", tls: true })).toBeUndefined();
  });

  it("does not return a local Web UI for a remote address", () => {
    expect(temporalWebUiUrl({ address: "temporal.internal.example.com:7233" })).toBeUndefined();
  });
});
