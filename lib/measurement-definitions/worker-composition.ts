import "server-only";
import { assertOperationAccessInTransaction } from "@/lib/operations/access-extension";
import { recordHostDefinitionMutation } from "./host-audit";
import { assertHostDefinitionAdapter } from "./host-registry";
import type { DefinitionProducerPorts } from "./model";

/** Actual organic composition; policy initialization is an explicit settings action, never a read/worker side effect. */
export const workerDefinitionPorts: Pick<
  DefinitionProducerPorts,
  "recordMutation" | "assertImplementedAdapter"
> & {
  assertEntitlement: typeof assertOperationAccessInTransaction;
} = {
  recordMutation: recordHostDefinitionMutation,
  assertImplementedAdapter: assertHostDefinitionAdapter,
  assertEntitlement: assertOperationAccessInTransaction,
};
