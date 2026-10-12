import type { OwnAdmissionPort } from "@/lib/provider-usage/admission-extension-types";
import { loadByokEvidence } from "@/lib/provider-usage/byok-evidence-storage";
import { reserveFromEntry } from "./mapping";
import { reservePaidAttempts } from "./paid-admission";
import { fencePaidAttemptsInTransaction, markPaidAttemptDispatch } from "./paid-dispatch";
import { createTransactionMeter, readPaidOperation } from "./transaction-meter";
import { ownAdmission } from "./transport-own-port";

/** These orchestration fixtures use fictional credentials; production binding has its own suite. */
export const fixtureOwnAdmission: OwnAdmissionPort = {
  ...ownAdmission,
  async reserve(tx, inputs) {
    const grants = [];
    for (const input of inputs) {
      const entry = await loadByokEvidence(tx, input.id);
      const journal = await tx.meteringUsageEvidence.findUniqueOrThrow({ where: { id: input.id } });
      if (!entry?.namespace || !entry.publicConnectionId || !input.credentialVersion)
        throw new Error("Missing fixture binding");
      const attribution = journal.estimate as {
        cents: string;
        units: string;
      };
      const [reserved] = await reservePaidAttempts(
        tx,
        [
          {
            reservation: reserveFromEntry(entry.namespace, entry, attribution),
            context: {
              projectId: entry.projectId,
              connectionId: entry.connectionId,
              publicConnectionId: entry.publicConnectionId,
              providerCredentialVersion: input.credentialVersion,
              correlationId: journal.correlationId,
              ...(input.attribution ?? {}),
            },
          },
        ],
        { verifyBinding: async () => {} },
      );
      if (!reserved) throw new Error("Missing fixture reservation");
      const grant = await markPaidAttemptDispatch(tx, reserved, "fixture", {
        verifyBinding: async () => {},
      });
      grants.push({ attemptId: grant.operation.operationId, leaseId: grant.lease.leaseId });
    }
    return grants;
  },
  async fence(db, grants) {
    await db.$transaction(async (tx) => {
      const meter = await createTransactionMeter(tx);
      const paid = [];
      for (const grant of grants) {
        const evidence = await loadByokEvidence(tx, grant.attemptId);
        if (!evidence?.namespace) throw new Error("Missing fixture namespace");
        const operation = await readPaidOperation(meter, {
          namespace: evidence.namespace,
          principal: evidence.ownerId,
          operationId: grant.attemptId,
        });
        if (!operation.lease) throw new Error("Missing fixture lease");
        paid.push({ operation, lease: operation.lease });
      }
      await fencePaidAttemptsInTransaction(tx, paid, { verifyBinding: async () => {} });
    });
  },
};
