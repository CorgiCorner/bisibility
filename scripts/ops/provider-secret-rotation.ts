import {
  decryptSecret,
  encryptSecret,
  isSecretEncryptedWithPrimary,
} from "@/lib/providers/crypto";

export const PERSISTED_SECRET_TARGETS = [
  {
    column: "credentialsEncrypted",
    name: "ProviderConnection.credentialsEncrypted",
    table: "provider_connections",
  },
  {
    column: "accessTokenHash",
    name: "SlackConnection.accessTokenHash",
    table: "slack_connections",
  },
  {
    column: "hmacSecret",
    name: "WebhookEndpoint.hmacSecret",
    table: "webhook_endpoints",
  },
] as const;

export type ProviderSecretTarget = (typeof PERSISTED_SECRET_TARGETS)[number];

export type ProviderSecretRow = {
  encrypted: string;
  id: string;
};

export type ProviderSecretRotationStore = {
  compareAndSwap: (
    target: ProviderSecretTarget,
    row: ProviderSecretRow,
    replacement: string,
  ) => Promise<boolean>;
  listBatch: (
    target: ProviderSecretTarget,
    cursor: string | null,
    batchSize: number,
  ) => Promise<ProviderSecretRow[]>;
};

export type ProviderSecretRotationCounts = {
  concurrent: number;
  eligible: number;
  rotated: number;
  scanned: number;
  skipped: number;
};

export type ProviderSecretRotationOptions = {
  batchSize: number;
  dryRun: boolean;
};

function emptyCounts(): ProviderSecretRotationCounts {
  return { concurrent: 0, eligible: 0, rotated: 0, scanned: 0, skipped: 0 };
}
export function classifyProviderSecret(encrypted: string) {
  return isSecretEncryptedWithPrimary(encrypted) ? "primary" : "rotatable";
}

async function rotateTarget(
  store: ProviderSecretRotationStore,
  target: ProviderSecretTarget,
  options: ProviderSecretRotationOptions,
) {
  const counts = emptyCounts();
  let cursor: string | null = null;

  while (true) {
    const rows = await store.listBatch(target, cursor, options.batchSize);
    if (rows.length === 0) break;

    for (const row of rows) {
      counts.scanned += 1;
      if (classifyProviderSecret(row.encrypted) === "primary") {
        counts.skipped += 1;
        continue;
      }

      const plaintext = decryptSecret(row.encrypted);
      counts.eligible += 1;
      if (options.dryRun) continue;

      const replacement = encryptSecret(plaintext);
      if (await store.compareAndSwap(target, row, replacement)) {
        counts.rotated += 1;
      } else {
        counts.concurrent += 1;
      }
    }

    cursor = rows.at(-1)?.id ?? null;
    if (rows.length < options.batchSize) break;
  }

  return counts;
}

export async function rotatePersistedProviderSecrets(
  store: ProviderSecretRotationStore,
  options: ProviderSecretRotationOptions,
) {
  const results = new Map<string, ProviderSecretRotationCounts>();
  for (const target of PERSISTED_SECRET_TARGETS) {
    results.set(target.name, await rotateTarget(store, target, options));
  }
  return results;
}
