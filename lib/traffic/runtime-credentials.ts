import "server-only";

import { prisma } from "@/lib/db/prisma";
import { resolveProviderCredentials } from "@/lib/providers/credentials";
import { decryptProviderCredentials, encryptSecret } from "@/lib/providers/crypto";
import type { ProviderCredentials } from "@/lib/providers/types";

const ROTATION_WRITE_ATTEMPTS = 3;

export class RefreshTokenPersistenceError extends Error {
  readonly errorClass = "credential_persistence";

  constructor(options?: ErrorOptions) {
    super("Rotated Google refresh token could not be persisted.", options);
    this.name = "RefreshTokenPersistenceError";
  }
}

function providerIdentityIsComplete(provider: string, credentials: ProviderCredentials) {
  return !["ga4", "gsc"].includes(provider) || Boolean(credentials.login?.trim());
}

async function retryDelay(attempt: number) {
  await new Promise((resolve) => setTimeout(resolve, attempt * 25));
}

async function persistRotatedRefreshToken(input: {
  connectionId: string;
  expectedRefreshToken: string | undefined;
  provider: string;
  refreshToken: string;
}) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= ROTATION_WRITE_ATTEMPTS; attempt += 1) {
    try {
      const connection = await prisma.providerConnection.findUnique({
        select: { credentialsEncrypted: true },
        where: { id: input.connectionId },
      });
      if (!connection) throw new Error("Provider connection no longer exists.");

      const stored = decryptProviderCredentials(connection.credentialsEncrypted);
      if (!providerIdentityIsComplete(input.provider, stored)) {
        throw new Error("Stored Google connection identity is incomplete.");
      }
      if (stored.apiKey === input.refreshToken) return;
      if (
        input.expectedRefreshToken &&
        stored.apiKey &&
        stored.apiKey !== input.expectedRefreshToken
      ) {
        throw new Error("Provider credentials changed during refresh-token rotation.");
      }

      const credentialsEncrypted = encryptSecret(
        JSON.stringify({ ...stored, apiKey: input.refreshToken }),
      );
      const updated = await prisma.providerConnection.updateMany({
        data: { credentialsEncrypted },
        where: { credentialsEncrypted: connection.credentialsEncrypted, id: input.connectionId },
      });
      if (updated.count === 1) return;
      lastError = new Error("Provider credentials changed during refresh-token rotation.");
    } catch (error) {
      lastError = error;
    }
    if (attempt < ROTATION_WRITE_ATTEMPTS) await retryDelay(attempt);
  }

  throw new RefreshTokenPersistenceError({ cause: lastError });
}

export function trafficRuntimeCredentials(connection: {
  credentialsEncrypted: string | null;
  id: string;
  provider: string;
}) {
  const runtime = resolveProviderCredentials(connection.provider, connection.credentialsEncrypted);
  const credentials: ProviderCredentials = {
    ...runtime,
    onRefreshToken: async (refreshToken: string) => {
      const expectedRefreshToken = credentials.apiKey;
      credentials.apiKey = refreshToken;
      await persistRotatedRefreshToken({
        connectionId: connection.id,
        expectedRefreshToken,
        provider: connection.provider,
        refreshToken,
      });
    },
  };
  return credentials;
}
