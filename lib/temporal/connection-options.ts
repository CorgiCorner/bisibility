export type TemporalConnectionOptions = {
  address: string;
  apiKey?: string;
  tls?: boolean;
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

  if (normalized === undefined) {
    return apiKey ? true : undefined;
  }
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error("TEMPORAL_TLS must be a boolean value");
}

export function temporalConnectionOptions(
  env: Readonly<Record<string, string | undefined>> = process.env,
): TemporalConnectionOptions {
  const apiKey = optionalEnv(env.TEMPORAL_API_KEY);
  const tls = parseTls(env.TEMPORAL_TLS, apiKey);

  return {
    address: optionalEnv(env.TEMPORAL_ADDRESS) ?? "localhost:7233",
    ...(apiKey ? { apiKey } : {}),
    ...(tls === undefined ? {} : { tls }),
  };
}
