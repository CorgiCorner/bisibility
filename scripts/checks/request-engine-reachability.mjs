import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import entries01 from "./request-engine-reachability-dispositions-01.mjs";
import entries02 from "./request-engine-reachability-dispositions-02.mjs";
import entries03 from "./request-engine-reachability-dispositions-03.mjs";
import entries04 from "./request-engine-reachability-dispositions-04.mjs";
import entries05 from "./request-engine-reachability-dispositions-05.mjs";
import entries06 from "./request-engine-reachability-dispositions-06.mjs";
import entries07 from "./request-engine-reachability-dispositions-07.mjs";
import entries08 from "./request-engine-reachability-dispositions-08.mjs";
import {
  inspectRepository as inspectRequestEngineReachability,
  runGuard,
} from "./request-engine-reachability-inspector.mjs";

/*
 * The focused status boundary guard restricts a five-module set where an import alone proves a request-path problem, while this guard traces all static request roots to client modules.
 * Both exist because import reachability over-approximates ordinary request behavior, yet every exception it exposes needs an explicit owner or rationale.
 */

function currentEntries(entries) {
  return entries.flatMap(([path, disposition]) => {
    const splitPath = path.replaceAll(
      "lib/api/rank-checks.ts ->",
      "lib/api/rank-checks.ts -> lib/api/rank-check-request.ts ->",
    );
    return [
      [splitPath, disposition],
      ...(path.startsWith("lib/api/rank-checks.ts ->")
        ? [[path.replace("lib/api/rank-checks.ts", "lib/api/rank-check-request.ts"), disposition]]
        : []),
    ];
  });
}

export const DISPOSITION_ENTRIES = currentEntries([
  ...entries01,
  ...entries02,
  ...entries03,
  ...entries04,
  ...entries05,
  ...entries06,
  ...entries07,
  ...entries08,
]);

export function inspectRepository(root = process.cwd(), dispositions = new Map(DISPOSITION_ENTRIES)) {
  return inspectRequestEngineReachability(root, dispositions);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!runGuard(new Map(DISPOSITION_ENTRIES))) process.exitCode = 1;
}
