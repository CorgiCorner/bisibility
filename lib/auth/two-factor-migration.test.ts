import type { SecretConfig } from "better-auth/crypto";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { describe, expect, it } from "vitest";
import {
  classifyTwoFactorValue,
  migrateLegacyTwoFactorSecrets,
  type TwoFactorMigrationRow,
  type TwoFactorMigrationStore,
} from "./two-factor-migration";

const legacyKey = "legacy-auth-secret-for-two-factor-tests";
const versionedKey: SecretConfig = {
  currentVersion: 3,
  keys: new Map([
    [3, "current-versioned-auth-secret-for-tests"],
    [2, "retired-versioned-auth-secret-for-tests"],
  ]),
  legacySecret: legacyKey,
};

class MemoryStore implements TwoFactorMigrationStore {
  concurrent = false;
  readonly cursors: Array<string | null> = [];
  writes = 0;

  constructor(readonly rows: TwoFactorMigrationRow[]) {}

  async compareAndSwap(
    row: TwoFactorMigrationRow,
    replacement: Pick<TwoFactorMigrationRow, "backupCodes" | "secret">,
  ) {
    if (this.concurrent) return false;
    const stored = this.rows.find((candidate) => candidate.id === row.id);
    if (!stored || stored.secret !== row.secret || stored.backupCodes !== row.backupCodes) {
      return false;
    }
    Object.assign(stored, replacement);
    this.writes += 1;
    return true;
  }

  async listBatch(cursor: string | null, batchSize: number) {
    this.cursors.push(cursor);
    return this.rows
      .filter((row) => cursor === null || row.id > cursor)
      .sort((left, right) => left.id.localeCompare(right.id))
      .slice(0, batchSize)
      .map((row) => ({ ...row }));
  }
}

describe("legacy two-factor secret migration", () => {
  it("distinguishes plaintext, legacy, retired, and current values", async () => {
    const bareHex = await symmetricEncrypt({ data: "TOTPSECRET", key: legacyKey });
    const envelope = await symmetricEncrypt({ data: "TOTPSECRET", key: versionedKey });
    const retiredKey: SecretConfig = { ...versionedKey, currentVersion: 2 };
    const retiredEnvelope = await symmetricEncrypt({ data: "TOTPSECRET", key: retiredKey });

    await expect(classifyTwoFactorValue("JBSWY3DPEHPK3PXP", legacyKey)).resolves.toBe("plaintext");
    await expect(classifyTwoFactorValue(bareHex, legacyKey)).resolves.toBe("current");
    await expect(classifyTwoFactorValue(bareHex, versionedKey)).resolves.toBe("rotatable");
    await expect(classifyTwoFactorValue(retiredEnvelope, versionedKey)).resolves.toBe("rotatable");
    await expect(classifyTwoFactorValue(envelope, versionedKey)).resolves.toBe("current");
    expect(envelope).toMatch(/^\$ba\$3\$/);
  });

  it("rejects undecryptable native-looking values instead of double-encrypting", async () => {
    const encrypted = await symmetricEncrypt({ data: "TOTPSECRET", key: legacyKey });

    await expect(classifyTwoFactorValue(encrypted, "different-auth-secret")).rejects.toThrow(
      "current auth secret configuration",
    );
    await expect(classifyTwoFactorValue("$ba$bad$payload", versionedKey)).rejects.toThrow(
      "invalid Better Auth encryption envelope",
    );
  });

  it("encrypts only plaintext fields in bounded batches and is idempotent", async () => {
    const encryptedBackupCodes = await symmetricEncrypt({
      data: JSON.stringify(["abcde-12345"]),
      key: legacyKey,
    });
    const store = new MemoryStore([
      {
        backupCodes: JSON.stringify(["vwxyz-67890"]),
        id: "a",
        secret: "JBSWY3DPEHPK3PXP",
      },
      {
        backupCodes: encryptedBackupCodes,
        id: "b",
        secret: "KRSXG5DSNFXGOIDB",
      },
    ]);

    const first = await migrateLegacyTwoFactorSecrets(store, {
      batchSize: 1,
      dryRun: false,
      key: legacyKey,
    });
    expect(first).toEqual({
      concurrent: 0,
      eligibleRows: 2,
      eligibleValues: 3,
      migratedRows: 2,
      scanned: 2,
      skippedRows: 0,
    });
    expect(store.cursors.slice(0, 2)).toEqual([null, "a"]);
    await expect(
      symmetricDecrypt({ data: store.rows[0]?.secret ?? "", key: legacyKey }),
    ).resolves.toBe("JBSWY3DPEHPK3PXP");
    expect(store.rows[1]?.backupCodes).toBe(encryptedBackupCodes);

    const second = await migrateLegacyTwoFactorSecrets(store, {
      batchSize: 2,
      dryRun: false,
      key: legacyKey,
    });
    expect(second.migratedRows).toBe(0);
    expect(second.skippedRows).toBe(2);
  });

  it("rewrites retired versioned envelopes with the primary version", async () => {
    const retiredKey: SecretConfig = { ...versionedKey, currentVersion: 2 };
    const store = new MemoryStore([
      {
        backupCodes: await symmetricEncrypt({ data: '["abcde-12345"]', key: retiredKey }),
        id: "retired",
        secret: await symmetricEncrypt({ data: "JBSWY3DPEHPK3PXP", key: retiredKey }),
      },
    ]);

    const result = await migrateLegacyTwoFactorSecrets(store, {
      batchSize: 10,
      dryRun: false,
      key: versionedKey,
    });

    expect(result.eligibleValues).toBe(2);
    expect(result.migratedRows).toBe(1);
    expect(store.rows[0]?.secret).toMatch(/^\$ba\$3\$/);
    expect(store.rows[0]?.backupCodes).toMatch(/^\$ba\$3\$/);
    await expect(
      symmetricDecrypt({ data: store.rows[0]?.secret ?? "", key: versionedKey }),
    ).resolves.toBe("JBSWY3DPEHPK3PXP");
  });

  it("supports no-write dry runs and compare-and-swap conflicts", async () => {
    const store = new MemoryStore([{ backupCodes: "[]", id: "a", secret: "JBSWY3DPEHPK3PXP" }]);

    const dryRun = await migrateLegacyTwoFactorSecrets(store, {
      batchSize: 10,
      dryRun: true,
      key: legacyKey,
    });
    expect(dryRun.eligibleValues).toBe(2);
    expect(store.writes).toBe(0);

    store.concurrent = true;
    const live = await migrateLegacyTwoFactorSecrets(store, {
      batchSize: 10,
      dryRun: false,
      key: legacyKey,
    });
    expect(live.concurrent).toBe(1);
    expect(live.migratedRows).toBe(0);
  });
});
