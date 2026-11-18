export const realDatabaseOnly = new Set([
  "concurrent reserve creates exactly one record",
  "concurrent sweeps release once and keep other namespaces isolated",
  "two concurrent intents grant once",
  "concurrent recovery claims and a second expired recovery lease",
  "concurrent same-file replays and competing first imports each write once",
  "concurrent reserves crossing one threshold report it exactly once in total",
  "duplicate settlements racing lease expiry record one receipt",
  "concurrent settles and reserves keep every figure exact and within the limit",
  ...["principal", "group", "connection", "access_credential", "platform_pool", "tag"].flatMap(
    (scope) => [2, 5, 20].map((count) => `${scope}: ${count} concurrent admissions`),
  ),
]);

// Unsupported by this host in both suites; never reported as an exercised guarantee.
export const unsupportedHostCases = new Set(["requires rollingWindows"]);

type Case = { name: string; mode: string; result?: { state?: string }; tasks?: Case[] };
export function conformanceCases(suite: { tasks: Case[] }): Case[] {
  return suite.tasks.flatMap((task) =>
    task.tasks ? conformanceCases({ tasks: task.tasks }) : [task],
  );
}

export function classifyOfflineCases(cases: Case[]) {
  for (const name of [...realDatabaseOnly, ...unsupportedHostCases])
    if (cases.filter((test) => test.name === name).length !== 1)
      throw new Error(`Missing reviewed case: ${name}`);
  for (const test of cases) {
    if (realDatabaseOnly.has(test.name)) test.mode = "skip";
    else if (test.mode !== "run" && !unsupportedHostCases.has(test.name))
      throw new Error(`Unreviewed offline omission: ${test.name}`);
  }
}

export function assertOfflineCoverage(cases: Case[]) {
  for (const test of cases) {
    if (realDatabaseOnly.has(test.name) || unsupportedHostCases.has(test.name)) continue;
    if (!["pass", "fail"].includes(test.result?.state ?? ""))
      throw new Error(`Case did not run offline: ${test.name}`);
  }
}

/** Refuse a new concurrent case instead of silently serializing it in the offline database. */
export function serialOnlyTransactions() {
  let active = false;
  return async <T>(body: () => Promise<T>): Promise<T> => {
    if (active) throw new Error("Independent transactions require the real PostgreSQL suite");
    active = true;
    try {
      return await body();
    } finally {
      active = false;
    }
  };
}
