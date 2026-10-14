import {
  assertFrozenQuoteSelection,
  assertLocalQuote,
  localQuoteHash,
} from "@/lib/local-monitoring/quote";
import { executionTargetKey } from "@/lib/local-monitoring/target-key";
import type { z } from "zod";
import type { LocalProjectScope } from "./access";
import { freezeLocalInput, localKeywordSourceHash, requireLocalTime } from "./canonical";
import type { LocalHostPorts, LocalTransaction } from "./context";
import {
  LocalDeviceNotConfiguredError,
  LocalMeasurementConflictError,
  LocalMeasurementUnavailableError,
} from "./errors";
import { retainedLocalPoint } from "./point";
import { loadLocalTarget, localKeywordSelect } from "./repository";
import type { launchLocalSchema } from "./schema";
export type LocalLaunchCommand = z.infer<typeof launchLocalSchema>;

export async function localRunSelection(
  tx: LocalTransaction,
  scope: LocalProjectScope,
  data: LocalLaunchCommand,
  ports: LocalHostPorts,
) {
  const selected = [];
  for (const id of [...data.targetIds].sort()) {
    const value = await loadLocalTarget(tx, scope.project.id, id);
    freezeLocalInput(value.target);
    if (value.row.keywordId === null) throw new LocalMeasurementUnavailableError();
    await tx.$queryRaw`SELECT id FROM keywords WHERE id=${value.row.keywordId} FOR SHARE`;
    const keyword = await tx.keyword.findFirst({
      where: { id: value.row.keywordId, projectId: scope.project.id, archivedAt: null },
      select: localKeywordSelect,
    });
    if (!keyword) throw new LocalMeasurementUnavailableError();
    if (keyword.device !== value.target.device) throw new LocalDeviceNotConfiguredError();
    if (
      localKeywordSourceHash(keyword) !== value.row.keywordSourceHash ||
      executionTargetKey(value.target) !== value.row.targetKey
    )
      throw new LocalMeasurementConflictError();
    await ports.policy.assertCurrent(tx, {
      projectId: scope.project.id,
      keyword,
      target: value.target,
    });
    const point = retainedLocalPoint(value.point.point);
    if (
      point.revisionKey !== value.target.pointRevision ||
      point.contentHash !== value.point.contentHash ||
      point.revisionKey !== value.point.revisionKey
    )
      throw new LocalMeasurementConflictError();
    selected.push({ ...value, point });
  }
  assertFrozenQuoteSelection(
    data.quote,
    selected.map(({ target }) => target),
  );
  if (data.quote.nativeEstimates.some(({ amount }) => amount === null))
    throw new Error("Unknown native estimate cannot grant paid local work.");
  await ports.activation.assertRegistered(tx, ports.adapter.capability);
  const now = requireLocalTime(ports.clock());
  for (const { target } of selected)
    assertLocalQuote({
      quote: data.quote,
      target,
      capability: ports.adapter.capability,
      providerPriceVersion: ports.adapter.providerPriceVersion,
      now,
    });
  return { selected, quoteHash: localQuoteHash(data.quote), now };
}
