export type VerificationDatabase = {
  query: (sql: string) => Promise<unknown>;
};

const sqlIdentifier = /^[A-Za-z_][A-Za-z0-9_]*$/;

function quoteTable(table: string) {
  if (!sqlIdentifier.test(table)) {
    throw new Error(`Unsafe verification table identifier: ${table}`);
  }
  return `"${table}"`;
}

export async function withWriteBlockedVerification<T>(
  db: VerificationDatabase,
  tables: readonly string[],
  verify: () => Promise<T>,
): Promise<T> {
  if (tables.length === 0) throw new Error("Verification requires at least one locked table.");
  const lockTargets = tables.map(quoteTable).join(", ");

  await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
  try {
    // SHARE conflicts with INSERT, UPDATE, and DELETE while still allowing normal reads.
    // Lock every target in one statement so a multi-table verification has no unlocked gap.
    await db.query(`LOCK TABLE ${lockTargets} IN SHARE MODE NOWAIT`);
    const result = await verify();
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}
