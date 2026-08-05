import { describe, expect, it } from "vitest";
import { temporalConnectionOptions, temporalWebUiUrl } from "./connection-options";

describe("temporalConnectionOptions", () => {
  it("uses the local plaintext server by default", () => {
    expect(temporalConnectionOptions({})).toEqual({
      address: "localhost:7233",
      tlsSource: "auto-no-api-key",
    });
  });

  it("requires an address for the explicit Temporal driver", () => {
    expect(() => temporalConnectionOptions({ SCHEDULER_DRIVER: "temporal" })).toThrow(
      "TEMPORAL_ADDRESS is required when SCHEDULER_DRIVER=temporal",
    );
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
      tlsSource: "auto-api-key",
    });
  });

  it("allows TLS without an API key", () => {
    expect(
      temporalConnectionOptions({
        TEMPORAL_ADDRESS: "temporal.internal:7233",
        TEMPORAL_TLS: "on",
      }),
    ).toEqual({
      address: "temporal.internal:7233",
      tls: true,
      tlsSource: "explicit-true",
    });
  });

  it("accepts the explicit auto mode", () => {
    expect(
      temporalConnectionOptions({
        TEMPORAL_ADDRESS: "temporal.internal:7233",
        TEMPORAL_TLS: "auto",
      }),
    ).toMatchObject({ address: "temporal.internal:7233", tlsSource: "auto-no-api-key" });
    expect(
      temporalConnectionOptions({ TEMPORAL_API_KEY: "secret", TEMPORAL_TLS: "auto" }),
    ).toMatchObject({ tls: true, tlsSource: "auto-api-key" });
  });

  it("reports whether TLS came from auto mode or an explicit value", () => {
    expect(temporalConnectionOptions({ TEMPORAL_TLS: "false" })).toMatchObject({
      tls: false,
      tlsSource: "explicit-false",
    });
    expect(temporalConnectionOptions({ TEMPORAL_TLS: "true" })).toMatchObject({
      tls: true,
      tlsSource: "explicit-true",
    });
  });

  it("rejects an invalid TLS value", () => {
    expect(() => temporalConnectionOptions({ TEMPORAL_TLS: "sometimes" })).toThrow(
      "TEMPORAL_TLS must be auto, true, or false",
    );
  });
});

describe("temporalWebUiUrl", () => {
  it("returns the local Web UI for the default address", () => {
    expect(temporalWebUiUrl({ address: "localhost:7233", tlsSource: "auto-no-api-key" })).toBe(
      "http://localhost:8233",
    );
  });

  it("returns the local Web UI for the IPv4 loopback address", () => {
    expect(temporalWebUiUrl({ address: "127.0.0.1:7233", tlsSource: "auto-no-api-key" })).toBe(
      "http://localhost:8233",
    );
  });

  it("does not return a local Web UI when an API key is configured", () => {
    expect(
      temporalWebUiUrl({
        address: "localhost:7233",
        apiKey: "secret",
        tlsSource: "auto-api-key",
      }),
    ).toBeUndefined();
  });

  it("does not return a local Web UI for a TLS endpoint", () => {
    expect(
      temporalWebUiUrl({ address: "localhost:7233", tls: true, tlsSource: "explicit-true" }),
    ).toBeUndefined();
  });

  it("does not return a local Web UI for a remote address", () => {
    expect(
      temporalWebUiUrl({
        address: "temporal.internal.example.com:7233",
        tlsSource: "auto-no-api-key",
      }),
    ).toBeUndefined();
  });
});
