import type { NativeConnection } from "@temporalio/worker";

const KEYWORD_INDEXED_VALUE_TYPE = 2;
const RANK_CHECK_SEARCH_ATTRIBUTES = ["keywordId", "projectId", "provider"] as const;

type SearchAttributeConnection = Pick<NativeConnection, "operatorService" | "withDeadline">;

function localTemporalAddress(address: string) {
  return /^(localhost|127\.0\.0\.1|\[::1\]|temporal)(:\d+)?$/i.test(address.trim());
}

export function shouldProvisionRankCheckSearchAttributes(address: string) {
  return localTemporalAddress(address);
}

async function listCustomSearchAttributes(
  connection: SearchAttributeConnection,
  namespace: string,
) {
  const current = await connection.withDeadline(Date.now() + 10_000, () =>
    connection.operatorService.listSearchAttributes({ namespace }),
  );
  return current.customAttributes ?? {};
}

function missingRankCheckSearchAttributes(custom: Record<string, number>) {
  for (const name of RANK_CHECK_SEARCH_ATTRIBUTES) {
    const type = custom[name];
    if (type !== undefined && type !== KEYWORD_INDEXED_VALUE_TYPE) {
      throw new Error(`Temporal search attribute ${name} must have type Keyword.`);
    }
  }
  return RANK_CHECK_SEARCH_ATTRIBUTES.filter((name) => custom[name] === undefined);
}

export async function ensureRankCheckSearchAttributes(
  connection: SearchAttributeConnection,
  input: {
    address: string;
    namespace: string;
  },
) {
  if (!shouldProvisionRankCheckSearchAttributes(input.address)) {
    return { attributes: [], status: "skipped" as const };
  }

  const custom = await listCustomSearchAttributes(connection, input.namespace);
  const missing = missingRankCheckSearchAttributes(custom);
  if (missing.length === 0) {
    return { attributes: [], status: "exists" as const };
  }
  try {
    await connection.withDeadline(Date.now() + 10_000, () =>
      connection.operatorService.addSearchAttributes({
        namespace: input.namespace,
        searchAttributes: Object.fromEntries(
          missing.map((name) => [name, KEYWORD_INDEXED_VALUE_TYPE]),
        ),
      }),
    );
  } catch (error) {
    const afterRace = await listCustomSearchAttributes(connection, input.namespace);
    if (missingRankCheckSearchAttributes(afterRace).length === 0) {
      return { attributes: [], status: "exists" as const };
    }
    throw error;
  }
  return { attributes: missing, status: "created" as const };
}
