import type { SecretConfig } from "better-auth/crypto";
import { parseEnvelope, symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";

export type AuthCryptoKey = string | SecretConfig;

export type TwoFactorMigrationRow = {
  backupCodes: string;
  id: string;
  secret: string;
};

export type TwoFactorMigrationStore = {
  compareAndSwap: (
    row: TwoFactorMigrationRow,
    replacement: Pick<TwoFactorMigrationRow, "backupCodes" | "secret">,
  ) => Promise<boolean>;
  listBatch: (
    cursor: string | null,
    batchSize: number,
    idPrefix: string | null,
  ) => Promise<TwoFactorMigrationRow[]>;
};

export type TwoFactorMigrationCounts = {
  concurrent: number;
  eligibleRows: number;
  eligibleValues: number;
  migratedRows: number;
  scanned: number;
  skippedRows: number;
};

const MIN_NATIVE_HEX_LENGTH = 80;

function isBareHexCiphertext(value: string) {
  return (
    value.length >= MIN_NATIVE_HEX_LENGTH && value.length % 2 === 0 && /^[0-9a-f]+$/i.test(value)
  );
}

export async function classifyTwoFactorValue(value: string, key: AuthCryptoKey) {
  const envelope = parseEnvelope(value);
  if (value.startsWith("$ba$") && !envelope) {
    throw new Error("Two-factor value has an invalid Better Auth encryption envelope.");
  }
  if (!envelope && !isBareHexCiphertext(value)) return "plaintext" as const;

  try {
    await symmetricDecrypt({ data: value, key });
    if (typeof key === "string") return "current" as const;
    return envelope?.version === key.currentVersion ? ("current" as const) : ("rotatable" as const);
  } catch {
    throw new Error(
      "Native Better Auth two-factor value could not be decrypted with the current auth secret configuration.",
    );
  }
}

function emptyCounts(): TwoFactorMigrationCounts {
  return {
    concurrent: 0,
    eligibleRows: 0,
    eligibleValues: 0,
    migratedRows: 0,
    scanned: 0,
    skippedRows: 0,
  };
}

export async function migrateLegacyTwoFactorSecrets(
  store: TwoFactorMigrationStore,
  options: {
    batchSize: number;
    dryRun: boolean;
    idPrefix?: string | null;
    key: AuthCryptoKey;
  },
) {
  const counts = emptyCounts();
  let cursor: string | null = null;

  while (true) {
    const rows = await store.listBatch(cursor, options.batchSize, options.idPrefix ?? null);
    if (rows.length === 0) break;

    for (const row of rows) {
      counts.scanned += 1;
      const [secretState, backupCodesState] = await Promise.all([
        classifyTwoFactorValue(row.secret, options.key),
        classifyTwoFactorValue(row.backupCodes, options.key),
      ]);
      const eligibleValues =
        Number(secretState !== "current") + Number(backupCodesState !== "current");
      if (eligibleValues === 0) {
        counts.skippedRows += 1;
        continue;
      }

      counts.eligibleRows += 1;
      counts.eligibleValues += eligibleValues;
      if (options.dryRun) continue;

      const replacement = {
        backupCodes:
          backupCodesState === "current"
            ? row.backupCodes
            : await symmetricEncrypt({
                data:
                  backupCodesState === "plaintext"
                    ? row.backupCodes
                    : await symmetricDecrypt({ data: row.backupCodes, key: options.key }),
                key: options.key,
              }),
        secret:
          secretState === "current"
            ? row.secret
            : await symmetricEncrypt({
                data:
                  secretState === "plaintext"
                    ? row.secret
                    : await symmetricDecrypt({ data: row.secret, key: options.key }),
                key: options.key,
              }),
      };
      if (await store.compareAndSwap(row, replacement)) {
        counts.migratedRows += 1;
      } else {
        counts.concurrent += 1;
      }
    }

    cursor = rows.at(-1)?.id ?? null;
    if (rows.length < options.batchSize) break;
  }

  return counts;
}
