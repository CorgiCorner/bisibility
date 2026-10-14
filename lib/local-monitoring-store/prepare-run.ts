import "server-only";
import { prisma } from "@/lib/db/prisma";
import { freezeLocalInput } from "./canonical";
import type { LocalDatabase, LocalHostPorts, LocalRunBinding, LocalStoreContext } from "./context";
import { localOperationStore } from "./operation-store";
import { preparedLocalJournal } from "./prepared-journal";
import { submitPreparedLocalItem } from "./prepared-submit";
import { admitLocalMeasurementRun, type LocalRunAdmission } from "./run-admission";
import { launchLocalSchema } from "./schema";

/** Returned functions stay server-side. A public DTO must never serialize grants or custody. */
export async function prepareLocalMeasurementRun(
  command: unknown,
  context: LocalStoreContext,
  ports: LocalHostPorts,
  db: LocalDatabase = prisma,
  options: {
    binding?: LocalRunBinding;
    adapterForItem?: (
      item: LocalRunAdmission["prepared"][number],
    ) => import("@/lib/local-monitoring/execution-types").LocalSubmitCollectAdapter;
  } = {},
) {
  const data = freezeLocalInput(launchLocalSchema.parse(command));
  const admission = await admitLocalMeasurementRun(data, context, ports, db, options.binding);
  if (!admission.fresh)
    return {
      id: admission.run.publicId,
      fresh: false as const,
      submitters: [],
    };
  const store = localOperationStore(db, admission.run.projectId, admission.run.id);
  const taskset = admission.prepared.map(({ grant }) => grant);
  const boundAdapters = new Set<
    import("@/lib/local-monitoring/execution-types").LocalSubmitCollectAdapter
  >();
  const submitters = admission.prepared.map((prepared) => {
    const adapter = options.adapterForItem?.(prepared) ?? ports.adapter;
    if (options.adapterForItem) {
      if (
        boundAdapters.has(adapter) ||
        adapter.capability.version !== ports.adapter.capability.version ||
        adapter.providerPriceVersion !== ports.adapter.providerPriceVersion
      )
        throw new Error("Per-item adapter must retain the admitted capability and price.");
      boundAdapters.add(adapter);
    }
    const journal = preparedLocalJournal({
      binding: options.binding,
      db,
      context,
      command: data,
      ports,
      projectId: admission.run.projectId,
      runId: admission.run.id,
      key: prepared.key,
      workerToken: prepared.workerToken,
      grant: prepared.grant,
      request: prepared.request,
      taskset,
    });
    let consumed = false;
    return {
      targetKey: prepared.record.targetKey,
      async submit() {
        if (consumed) throw new Error("Local first-send permit was already consumed.");
        consumed = true;
        return submitPreparedLocalItem({
          key: prepared.key,
          target: prepared.target,
          quote: data.quote,
          request: prepared.request,
          store,
          journal,
          adapter,
          clock: ports.clock,
        });
      },
    };
  });
  return { id: admission.run.publicId, fresh: true as const, submitters };
}
