import type { AccessContext, Authority, Meter, Operation } from "@usagekit/core";
import type { Clock } from "@usagekit/store";
import { receiptFromEntry, reserveFromEntry, type UsageEntry } from "./mapping";
import { readShadowDecision } from "./shadow-probe";

export type ShadowComparison = {
  operationId: string;
  projectId: string;
  connectionId: string;
  funding: "byok" | "platform";
  legacy: "allowed" | "blocked" | "wallet_blocked";
  meter: "reserved" | "exceeded" | "invalid" | "error";
  settled: "settled" | "pending" | "released" | "error";
  durationMs: number;
};
export type ShadowHandoff = {
  operationId: string;
  leaseId: string;
  kind: "lease" | "recovery";
  expiresAt: string;
};
export type ShadowHandoffs = {
  save(entry: UsageEntry, handoff: ShadowHandoff): Promise<void>;
  load(entry: UsageEntry): Promise<ShadowHandoff | undefined>;
  clear(entry: UsageEntry, leaseId: string): Promise<void>;
};
type Estimate = { cents: string; units: string };
export function createShadowEngine(deps: {
  meter: Meter;
  clock: Clock;
  namespace: string;
  sink: (comparison: ShadowComparison) => Promise<void>;
  failure: (entry: UsageEntry, step: string) => void | Promise<void>;
  handoffs: ShadowHandoffs;
}) {
  const { meter, clock, namespace } = deps;
  const leases = new Map<string, ShadowHandoff>();
  const access: AccessContext = {
    namespace,
    readablePrincipals: "*",
    readableGroups: "*",
    readablePools: "*",
    canReadBillingDetail: true,
    canManageBudgets: false,
  };
  const ref = (entry: UsageEntry) => ({
    namespace,
    principal: entry.ownerId,
    operationId: entry.id,
  });
  const command = (op: Operation, id: string) => ({
    namespace,
    principal: op.scope.principal,
    operationId: op.operationId,
    expectedVersion: op.version,
    commandId: id,
  });
  async function safe(entry: UsageEntry, step: string, run: () => Promise<void>) {
    try {
      await run();
    } catch {
      try {
        await deps.failure(entry, step);
      } catch {
        /* Logging must not affect the provider. */
      }
    }
  }
  async function operation(entry: UsageEntry) {
    const read = await meter.getOperation(access, ref(entry));
    if (read.outcome !== "ok") throw new Error("Shadow operation unavailable");
    return read.value;
  }
  async function begin(entry: UsageEntry, estimate: Estimate, leaseTtlMs = 3600000) {
    const started = performance.now();
    const result = await meter.reserve(reserveFromEntry(namespace, entry, estimate));
    if (result.outcome !== "reserved") throw new Error("Shadow admission unavailable");
    if (result.replayed) {
      const current = result.operation.lease;
      const local = leases.get(entry.id);
      if (local && local.leaseId !== current?.leaseId) return;
      if (current && new Date(current.expiresAt) > clock.now()) {
        const persisted = await deps.handoffs.load(entry);
        if (persisted?.leaseId === current.leaseId) leases.set(entry.id, persisted);
      }
      return;
    }
    const grant = await meter.markDispatchIntent({
      ...command(result.operation, "shadow:intent"),
      holder: `shadow:${crypto.randomUUID()}`,
      leaseTtlMs,
    });
    if (!("granted" in grant) || !grant.granted) throw new Error("Shadow dispatch unavailable");
    const handoff: ShadowHandoff = { operationId: entry.id, kind: "lease", ...grant.lease };
    await deps.handoffs.save(entry, handoff);
    leases.set(entry.id, handoff);
    await deps.sink({
      operationId: entry.id,
      projectId: entry.projectId,
      connectionId: entry.connectionId,
      funding: entry.credentialSource === "hosted" ? "platform" : "byok",
      legacy: "allowed",
      meter: result.warnings.length ? "exceeded" : "reserved",
      settled: "pending",
      durationMs: performance.now() - started,
    });
  }
  async function authority(
    entry: UsageEntry,
    op: Operation,
  ): Promise<{ authority: Authority; operation: Operation }> {
    if (op.lease && new Date(op.lease.expiresAt) > clock.now()) {
      const local = leases.get(entry.id);
      const handoff = local ?? (await deps.handoffs.load(entry));
      if (handoff?.leaseId !== op.lease.leaseId) throw new Error("Another shadow holder is active");
      return {
        authority: { kind: handoff.kind, leaseId: op.lease.leaseId },
        operation: op,
      };
    }
    if (op.state === "pending" || op.state === "settled")
      return {
        authority: { kind: "late_evidence", source: "legacy_provider_ledger" },
        operation: op,
      };
    const claim = await meter.claimForRecovery({
      ...ref(entry),
      holder: `evidence:${crypto.randomUUID()}`,
      leaseTtlMs: 60000,
    });
    if (!("claimed" in claim) || !claim.claimed) throw new Error("Shadow recovery unavailable");
    const handoff: ShadowHandoff = { operationId: entry.id, kind: "recovery", ...claim.lease };
    await deps.handoffs.save(entry, handoff);
    leases.set(entry.id, handoff);
    return {
      authority: { kind: "recovery", leaseId: claim.lease.leaseId },
      operation: claim.operation,
    };
  }
  return {
    handoff: (operationId: string) => leases.get(operationId),
    resume: (entry: UsageEntry, payload: ShadowHandoff | undefined) =>
      safe(entry, "resume", async () => {
        const op = await operation(entry);
        if (!op || op.state === "settled" || op.state === "released") return;
        const current = payload ?? (await deps.handoffs.load(entry));
        if (!current || current.operationId !== entry.id) throw new Error("Invalid shadow handoff");
        const local = leases.get(entry.id);
        if (local && local.leaseId !== current.leaseId)
          throw new Error("Shadow handoff fenced out");
        if (op.lease && new Date(op.lease.expiresAt) > clock.now()) {
          if (current.leaseId !== op.lease.leaseId) throw new Error("Shadow handoff fenced out");
          const renewed = await meter.renewLease({
            ...ref(entry),
            leaseId: current.leaseId,
            leaseTtlMs: 86400000,
          });
          if (!("renewed" in renewed) || !renewed.renewed)
            throw new Error("Shadow renewal refused");
          const handoff: ShadowHandoff = { ...current, ...renewed.lease };
          await deps.handoffs.save(entry, handoff);
          leases.set(entry.id, handoff);
          return;
        }
        const claim = await meter.claimForRecovery({
          ...ref(entry),
          holder: `worker:${crypto.randomUUID()}`,
          leaseTtlMs: 86400000,
        });
        if (!("claimed" in claim) || !claim.claimed) throw new Error("Shadow recovery unavailable");
        const handoff: ShadowHandoff = { operationId: entry.id, kind: "recovery", ...claim.lease };
        await deps.handoffs.save(entry, handoff);
        leases.set(entry.id, handoff);
      }),
    begin: (entry: UsageEntry, estimate: Estimate, leaseTtlMs?: number) =>
      safe(entry, "begin", () => begin(entry, estimate, leaseTtlMs)),
    compare: (entry: UsageEntry, estimate: Estimate, legacy: ShadowComparison["legacy"]) =>
      safe(entry, "compare", async () => {
        const started = performance.now();
        const decision = await readShadowDecision(
          meter,
          access,
          reserveFromEntry(namespace, entry, estimate),
        );
        await deps.sink({
          operationId: `admission:${entry.id}`,
          projectId: entry.projectId,
          connectionId: entry.connectionId,
          funding: entry.credentialSource === "hosted" ? "platform" : "byok",
          legacy,
          meter: decision,
          settled: "released",
          durationMs: performance.now() - started,
        });
      }),
    record: (entry: UsageEntry) =>
      safe(entry, "record", async () => {
        const started = performance.now();
        let op = await operation(entry);
        if (!op) {
          await begin(entry, { cents: entry.costCents, units: entry.usageQuantity ?? "0" });
          op = await operation(entry);
        }
        if (!op) throw new Error("Missing shadow operation");
        if (op.state === "reserved" && entry.measurementStatus === "recorded") {
          // The provider call already happened; this intent only permits recording its evidence.
          const grant = await meter.markDispatchIntent({
            ...command(op, "shadow:intent"),
            holder: `evidence:${crypto.randomUUID()}`,
            leaseTtlMs: 60000,
          });
          if (!("granted" in grant) || !grant.granted)
            throw new Error("Shadow evidence intent unavailable");
          const handoff: ShadowHandoff = { operationId: entry.id, kind: "lease", ...grant.lease };
          await deps.handoffs.save(entry, handoff);
          leases.set(entry.id, handoff);
          op = grant.operation;
        }
        const receipt = receiptFromEntry(entry, clock.now());
        if (op.receipts.some((r) => r.id === receipt.id)) return;
        const previous = op.receipts.at(-1);
        const priorHasEvidence =
          previous &&
          (previous.cost.certainty !== "unknown" ||
            previous.measurements.some((value) => value.certainty !== "unknown"));
        const incomingIncomplete =
          receipt.cost.certainty === "unknown" ||
          receipt.measurements.some((value) => value.certainty === "unknown");
        const omitsKnownDimension = previous?.measurements.some(
          (value) =>
            value.certainty !== "unknown" &&
            !receipt.measurements.some(
              (incoming) => incoming.unit === value.unit && incoming.certainty !== "unknown",
            ),
        );
        if (previous && ((priorHasEvidence && incomingIncomplete) || omitsKnownDimension)) return;
        const authorized = await authority(entry, op);
        const input = {
          ...command(authorized.operation, `evidence:${receipt.id}`),
          authority: authorized.authority,
          receipt,
        };
        const result = previous
          ? await meter.correct({
              ...input,
              replacesReceiptId: previous.id,
              reason: "legacy_provider_receipt_updated",
            })
          : await meter.settle(input);
        if (result.outcome !== "settled") throw new Error("Shadow settlement rejected");
        leases.delete(entry.id);
        if ("leaseId" in authorized.authority)
          await deps.handoffs.clear(entry, authorized.authority.leaseId);
        await deps.sink({
          operationId: entry.id,
          projectId: entry.projectId,
          connectionId: entry.connectionId,
          funding: entry.credentialSource === "hosted" ? "platform" : "byok",
          legacy: "allowed",
          meter: "reserved",
          settled: result.operation.state === "settled" ? "settled" : "pending",
          durationMs: performance.now() - started,
        });
      }),
    renew: (entry: UsageEntry, leaseTtlMs: number) =>
      safe(entry, "renew", async () => {
        const leaseId = leases.get(entry.id)?.leaseId;
        if (!leaseId) throw new Error("No local dispatch holder");
        const result = await meter.renewLease({ ...ref(entry), leaseId, leaseTtlMs });
        if (!("renewed" in result) || !result.renewed)
          throw new Error("Shadow lease renewal refused");
        const handoff = leases.get(entry.id);
        if (!handoff) throw new Error("No local dispatch holder");
        const renewed: ShadowHandoff = { ...handoff, ...result.lease };
        await deps.handoffs.save(entry, renewed);
        leases.set(entry.id, renewed);
      }),
  };
}
