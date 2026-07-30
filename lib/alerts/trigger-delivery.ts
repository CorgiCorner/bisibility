import "server-only";

import { makePublicId } from "@/lib/db/public-id";
import type { Prisma } from "@/lib/generated/prisma/client";
import { createTriggeredAlertOnce } from "./transitions";

export type AlertDeliveryMode = "deferred" | "immediate";

type PersistAndDeliverInput = {
  afterPosition: number | null;
  beforePosition: number | null;
  deliveryMode: AlertDeliveryMode;
  keyword: {
    id: string;
    project: { id: string };
  };
  payload: Prisma.InputJsonObject;
  rankCheckId: string | null;
  rule: {
    id: string;
  };
};

export async function persistAndDeliverTriggeredAlert(input: PersistAndDeliverInput) {
  const alert = await createTriggeredAlertOnce({
    afterPosition: input.afterPosition,
    beforePosition: input.beforePosition,
    deliveryState: input.deliveryMode === "deferred" ? "digest_pending" : "pending",
    keywordId: input.keyword.id,
    payload: input.payload,
    publicId: makePublicId("al"),
    rankCheckId: input.rankCheckId,
    ruleId: input.rule.id,
  });
  return alert;
}
