import type { SecretConfig } from "better-auth/crypto";

export function resolveAuthSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (secret && secret.length >= 16) {
    return secret;
  }

  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
  if (process.env.NODE_ENV === "production" && !isBuildPhase) {
    throw new Error("BETTER_AUTH_SECRET must be set to a strong (>=16 char) value in production.");
  }

  return "dev-only-insecure-auth-secret-do-not-use-in-production";
}

function parseVersionedAuthSecrets(configured: string) {
  const keys = new Map<number, string>();
  const entries = configured.split(",");

  for (const [index, raw] of entries.entries()) {
    const separator = raw.indexOf(":");
    const versionRaw = raw.slice(0, separator).trim();
    const value = raw.slice(separator + 1).trim();
    if (separator < 1 || !/^(0|[1-9]\d*)$/.test(versionRaw) || !value) {
      throw new Error(`BETTER_AUTH_SECRETS entry ${index + 1} is invalid.`);
    }

    const version = Number(versionRaw);
    if (keys.has(version)) {
      throw new Error(`BETTER_AUTH_SECRETS contains duplicate version ${version}.`);
    }
    keys.set(version, value);
  }

  return keys;
}

export function resolveAuthCryptoKey(): string | SecretConfig {
  const legacySecret = resolveAuthSecret();
  const configured = process.env.BETTER_AUTH_SECRETS?.trim();
  if (!configured) return legacySecret;

  const keys = parseVersionedAuthSecrets(configured);
  const currentVersion = keys.keys().next().value;
  if (currentVersion === undefined) {
    throw new Error("BETTER_AUTH_SECRETS must contain at least one versioned secret.");
  }
  return { currentVersion, keys, legacySecret };
}
