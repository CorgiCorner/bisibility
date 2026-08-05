import { schedulerDriver } from "../scheduler/driver";

export type TemporalConnectionOptions = {
  address: string;
  apiKey?: string;
  tls?: boolean;
  tlsSource: "auto-api-key" | "auto-no-api-key" | "explicit-false" | "explicit-true";
};

const LOCAL_TEMPORAL_ADDRESSES = new Set(["localhost:7233", "127.0.0.1:7233"]);

export function temporalWebUiUrl(options: TemporalConnectionOptions): string | undefined {
  if (options.apiKey || options.tls || !LOCAL_TEMPORAL_ADDRESSES.has(options.address)) {
    return undefined;
  }

  return "http://localhost:8233";
}

function optionalEnv(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseTls(value: string | undefined, apiKey: string | undefined) {
  const normalized = optionalEnv(value)?.toLowerCase();

  if (normalized === undefined || normalized === "auto") {
    return apiKey
      ? ({ source: "auto-api-key", value: true } as const)
      : ({ source: "auto-no-api-key", value: undefined } as const);
  }
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return { source: "explicit-true", value: true } as const;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return { source: "explicit-false", value: false } as const;
  }

  throw new Error("TEMPORAL_TLS must be auto, true, or false");
}

export function temporalConnectionOptions(
  env: Readonly<Record<string, string | undefined>> = process.env,
): TemporalConnectionOptions {
  const apiKey = optionalEnv(env.TEMPORAL_API_KEY);
  const tls = parseTls(env.TEMPORAL_TLS, apiKey);
  const configuredAddress = optionalEnv(env.TEMPORAL_ADDRESS);
  if (schedulerDriver(env) === "temporal" && !configuredAddress) {
    throw new Error("TEMPORAL_ADDRESS is required when SCHEDULER_DRIVER=temporal.");
  }

  return {
    address: configuredAddress ?? "localhost:7233",
    ...(apiKey ? { apiKey } : {}),
    ...(tls.value === undefined ? {} : { tls: tls.value }),
    tlsSource: tls.source,
  };
}

export function temporalSdkConnectionOptions(options: TemporalConnectionOptions) {
  const { tlsSource: _tlsSource, ...sdkOptions } = options;
  return sdkOptions;
}
