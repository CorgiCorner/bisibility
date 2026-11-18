import "server-only";
import type { ModelPaymentDatabase } from "./admission-storage";
import { peekModelCatalog, resolveModelConnection } from "./connection-resolution";
import { ModelAdmissionRefusal } from "./payment";
import { modelPlaygroundRuntimeBindings } from "./runtime-bindings";
import type { ModelPlaygroundRuntime } from "./runtime-contract";

export { modelPlaygroundRuntimeBindings } from "./runtime-bindings";

export function createModelPlaygroundRuntime(
  db: ModelPaymentDatabase,
  authorize: ModelPlaygroundRuntime["authorize"] = async () => {
    throw new ModelAdmissionRefusal("access_denied");
  },
): ModelPlaygroundRuntime {
  const runtime: ModelPlaygroundRuntime = {
    db,
    authorize,
    resolve: async (database, projectId, request) =>
      resolveModelConnection(
        database,
        projectId,
        request,
        request.connectionId.startsWith("platform:")
          ? { actorId: (await authorize("read")).actorId, source: runtime.entrySource }
          : {},
      ),
    peekCatalog: async (database, projectId, request) =>
      peekModelCatalog(
        database,
        projectId,
        request,
        request.connectionId.startsWith("platform:")
          ? { actorId: (await authorize("read")).actorId, source: runtime.entrySource }
          : {},
      ),
    get valuation() {
      return modelPlaygroundRuntimeBindings.valuation;
    },
    get onTerminal() {
      return modelPlaygroundRuntimeBindings.onTerminal;
    },
  };
  return runtime;
}
