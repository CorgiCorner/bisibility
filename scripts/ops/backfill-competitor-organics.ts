#!/usr/bin/env -S node --experimental-transform-types --import ./lib/temporal/register-loader.mjs

import { pathToFileURL } from "node:url";
import pg from "pg";
import { databaseConnectionConfig } from "@/lib/db/pool-config";
import { parseEvidenceReplayOptions } from "@/lib/evidence-replay/cli-options";
import { replayCodeHash } from "@/lib/evidence-replay/hash";
import { applyEvidenceReplayBatch, prepareEvidenceReplay } from "@/lib/evidence-replay/service";
import { stopEvidenceReplay } from "@/lib/evidence-replay/stop";
import type { ReplayDatabase } from "@/lib/evidence-replay/model";

export { parseEvidenceReplayOptions as parseBackfillOptions } from "@/lib/evidence-replay/cli-options";
export { prepareEvidenceReplay, applyEvidenceReplayBatch } from "@/lib/evidence-replay/service";

/** Protected process env only. No dotenv loading, URL arguments, provider initialization or raw diagnostics. */
export async function runEvidenceReplayCli(args = process.argv.slice(2), env = process.env) {
  const options = parseEvidenceReplayOptions(args);
  const url = env.DATABASE_URL?.trim();
  if (!url) throw new Error("evidence_replay_database_unavailable");
  const client = new pg.Client({ connectionString: url, ...databaseConnectionConfig(url), connectionTimeoutMillis: 15_000, application_name: "bisibility-evidence-replay" });
  const db: ReplayDatabase = { query: async (sql, values) => client.query(sql, values ? [...values] : []) };
  const authority = { kind: "database_operator" as const }, codeHash = await replayCodeHash();
  await client.connect();
  try {
    if (options.stop) return stopEvidenceReplay(db, authority, options.projectId, options.stop, codeHash);
    const prepared = options.request ? await prepareEvidenceReplay(db, authority, options.request, codeHash, !options.execute) : null;
    if (!options.execute) return { mode: "dry_run", expected: prepared?.expected, manifestHash: prepared?.manifestHash };
    const runId = options.resume ?? prepared?.run?.id;
    if (!runId) throw new Error("evidence_replay_run_unavailable");
    let current;
    for (let index = 0; index < options.maxBatches; index++) {
      current = await applyEvidenceReplayBatch(db, authority, options.projectId, runId, codeHash, options.batchSize);
      if (current.state !== "running") break;
    }
    return { mode: "execute", runId, state: current?.state, counts: current?.counts, cursor: current?.cursor, revision: current?.revision };
  } finally { await client.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runEvidenceReplayCli().then(result => console.log(JSON.stringify(result))).catch(error => {
    const named = error instanceof Error && /^evidence_replay_[a-z_]+$/u.test(error.message) ? error.message : "evidence_replay_failed";
    const code = typeof error === "object" && error && "code" in error && typeof error.code === "string" && /^[A-Z0-9]{5}$/u.test(error.code) ? error.code : undefined;
    console.error(JSON.stringify({ status: "FAIL", category: named, sqlState: code })); process.exitCode = 1;
  });
}
