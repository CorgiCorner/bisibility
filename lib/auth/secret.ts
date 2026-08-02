import type { SecretConfig } from "better-auth/crypto";

function resolveConfiguredAuthSecret() {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (!secret) return undefined;
  if (secret.length < 16) {
    throw new Error("BETTER_AUTH_SECRET must be a strong (>=16 char) value when configured.");
  }
  return secret;
}

export function resolveAuthSecret(): string {
  const secret = resolveConfiguredAuthSecret();
  if (secret) return secret;

  const versioned = resolveAuthSecrets();
  if (versioned) return versioned[0].value;

  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
  if (process.env.NODE_ENV === "production" && !isBuildPhase) {
    throw new Error("BETTER_AUTH_SECRET must be set to a strong (>=16 char) value in production.");
  }

  return "dev-only-insecure-auth-secret-do-not-use-in-production";
}

function parseVersionedAuthSecrets(configured: string) {
  const keys = new Map<number, string>();
  const entries = configured.split(",");
  let previousVersion: number | undefined;

  for (const [index, raw] of entries.entries()) {
    const separator = raw.indexOf(":");
    const versionRaw = raw.slice(0, separator).trim();
    const value = raw.slice(separator + 1).trim();
    if (separator < 1 || !/^(0|[1-9]\d*)$/.test(versionRaw) || value.length < 16) {
      throw new Error(`BETTER_AUTH_SECRETS entry ${index + 1} is invalid.`);
    }

    const version = Number(versionRaw);
    if (keys.has(version)) {
      throw new Error(`BETTER_AUTH_SECRETS contains duplicate version ${version}.`);
    }
    if (previousVersion !== undefined && version >= previousVersion) {
      throw new Error("BETTER_AUTH_SECRETS versions must be strictly descending.");
    }
    keys.set(version, value);
    previousVersion = version;
  }

  return keys;
}

export function resolveAuthSecrets() {
  const configured = process.env.BETTER_AUTH_SECRETS?.trim();
  if (!configured) return undefined;
  const keys = parseVersionedAuthSecrets(configured);
  if (keys.size === 0) {
    throw new Error("BETTER_AUTH_SECRETS must contain at least one versioned secret.");
  }
  return [...keys].map(([version, value]) => ({ value, version }));
}

export function resolveAuthCryptoKey(): string | SecretConfig {
  const secrets = resolveAuthSecrets();
  if (!secrets) return resolveAuthSecret();
  const keys = new Map(secrets.map(({ value, version }) => [version, value]));
  const currentVersion = secrets[0].version;
  const legacySecret = resolveConfiguredAuthSecret() ?? secrets[0].value;
  return { currentVersion, keys, legacySecret };
}
