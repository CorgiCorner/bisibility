import { databaseConnectionConfig, databaseSchemaFromUrl } from "./schema-config.mjs";

const DEFAULT_POOL_MAX = 3;
const DEFAULT_CONNECT_TIMEOUT_MS = 5_000;
const DEFAULT_IDLE_TIMEOUT_MS = 10_000;
const DEFAULT_APPLICATION_NAME = "bisibility-ssr";

type PoolEnvironment = Partial<
  Record<
    | "DATABASE_APPLICATION_NAME"
    | "DATABASE_CONNECT_TIMEOUT_MS"
    | "DATABASE_IDLE_TIMEOUT_MS"
    | "DATABASE_POOL_MAX",
    string | undefined
  >
>;

function integerSetting(
  name: keyof PoolEnvironment,
  value: string | undefined,
  fallback: number,
  range: { min: number; max: number },
) {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  if (!/^\d+$/.test(trimmed)) throw new Error(`${name} must be an integer`);

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < range.min || parsed > range.max) {
    throw new Error(`${name} must be between ${range.min} and ${range.max}`);
  }
  return parsed;
}

function applicationName(value: string | undefined) {
  const trimmed = value?.trim() || DEFAULT_APPLICATION_NAME;
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(trimmed)) {
    throw new Error(
      "DATABASE_APPLICATION_NAME must contain only lowercase letters, digits, underscores, or hyphens",
    );
  }
  return trimmed;
}

export function databasePoolConfig(
  env: PoolEnvironment = {
    DATABASE_APPLICATION_NAME: process.env.DATABASE_APPLICATION_NAME,
    DATABASE_CONNECT_TIMEOUT_MS: process.env.DATABASE_CONNECT_TIMEOUT_MS,
    DATABASE_IDLE_TIMEOUT_MS: process.env.DATABASE_IDLE_TIMEOUT_MS,
    DATABASE_POOL_MAX: process.env.DATABASE_POOL_MAX,
  },
  connectionString?: string,
) {
  return {
    application_name: applicationName(env.DATABASE_APPLICATION_NAME),
    connectionTimeoutMillis: integerSetting(
      "DATABASE_CONNECT_TIMEOUT_MS",
      env.DATABASE_CONNECT_TIMEOUT_MS,
      DEFAULT_CONNECT_TIMEOUT_MS,
      { min: 100, max: 60_000 },
    ),
    idleTimeoutMillis: integerSetting(
      "DATABASE_IDLE_TIMEOUT_MS",
      env.DATABASE_IDLE_TIMEOUT_MS,
      DEFAULT_IDLE_TIMEOUT_MS,
      { min: 1_000, max: 300_000 },
    ),
    max: integerSetting("DATABASE_POOL_MAX", env.DATABASE_POOL_MAX, DEFAULT_POOL_MAX, {
      min: 1,
      max: 20,
    }),
    ...(connectionString ? databaseConnectionConfig(connectionString) : {}),
  };
}

export { databaseConnectionConfig, databaseSchemaFromUrl };
