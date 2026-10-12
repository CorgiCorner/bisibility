import "server-only";
import type { OwnAdmissionPort } from "@/lib/provider-usage/admission-extension-types";
import { fenceOwnTransports, reserveOwnTransports } from "./transport-own-admission";
import { assertOwnTransportRetrieval, recoverOwnTransport } from "./transport-own-recovery";
import { acknowledgeOwnTransport, cancelOwnTransports } from "./transport-own-settlement";
export const ownAdmission: OwnAdmissionPort = {
  reserve: reserveOwnTransports,
  fence: fenceOwnTransports,
  acknowledge: acknowledgeOwnTransport,
  cancel: cancelOwnTransports,
  owns: async (db, id) => {
    const [row] = await db.$queryRaw<
      { found: boolean }[]
    >`SELECT EXISTS(SELECT 1 FROM metering_paid_attempt_context c JOIN metering_usage_evidence e ON e.namespace=c.namespace AND e.principal=c.principal AND e.id=c.operation_id WHERE e.id=${id}) AS found`;
    return row?.found ?? false;
  },
  assertRetrieval: assertOwnTransportRetrieval,
  recover: recoverOwnTransport,
};
