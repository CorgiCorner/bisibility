import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { CloseoutExecutionError } from "@/lib/metering/history-closeout/execution-error";
import { applyUnknownCloseout, previewUnknownCloseout } from "@/lib/metering/unknown-closeout/service";
import { unknownCloseoutPolicy } from "@/lib/metering/unknown-closeout/manifest";
import { operatorTransaction } from "./closeout-historical-finances";

/** Preview is read-only. Apply records a disposition, never a financial receipt. */
export async function runUnknownCloseout(databaseUrl: string, manifest: unknown, expectedHash?: string) {
  if(expectedHash!==undefined && !/^[a-f0-9]{64}$/.test(expectedHash)) throw new Error("Invalid plan hash");
  if(expectedHash) return operatorTransaction(databaseUrl,"apply",120000,
    tx=>applyUnknownCloseout(tx,manifest,expectedHash));
  return operatorTransaction(databaseUrl,"read_only_preview",120000,
    tx=>previewUnknownCloseout(tx,manifest));
}
async function main() {
  const {values}=parseArgs({options:{manifest:{type:"string"},apply:{type:"boolean"},"expected-hash":{type:"string"},policy:{type:"string"}},strict:true});
  if(!values.manifest || !process.env.DATABASE_URL) throw new Error("An explicit manifest and target are required");
  if(!!values.apply !== !!values["expected-hash"]) throw new Error("Apply requires the exact preview hash");
  if(values.apply && values.policy!==unknownCloseoutPolicy) throw new Error("Confirm the unknown-cost policy");
  return runUnknownCloseout(process.env.DATABASE_URL,JSON.parse(await readFile(values.manifest,"utf8")),values["expected-hash"]);
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await main())); }
  catch(error) {
    console.error("Unknown-cost closeout refused; no partial batch is committed.");
    if(error instanceof CloseoutExecutionError) console.error(JSON.stringify(error.execution));
    process.exitCode=1;
  }
}
