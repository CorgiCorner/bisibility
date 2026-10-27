import { type ApiOperationId, operationPolicy } from "@/lib/api/operation-policy";
import { requiredString } from "./tool-arguments";
import type { JsonObject } from "./types";

/** Only address construction is shared; each transport retains its own serialization rules. */
export function operationPath(operation: ApiOperationId, input: JsonObject) {
  return operationPolicy[operation].path.replace(/\{([^}]+)\}/g, (_, key: string) =>
    encodeURIComponent(requiredString(input, key)),
  );
}
