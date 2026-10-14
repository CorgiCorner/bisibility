import type { MonitorDefinition } from "@/lib/local-monitor-store/model";
import type { LocalSubmitCollectAdapter } from "@/lib/local-monitoring/execution-types";
import type { LocalQuote } from "@/lib/local-monitoring/quote";
import type { ExecutionTargetV1, PointRevision } from "@/lib/local-monitoring/types";
import type { LocalProjectScope } from "@/lib/local-monitoring-store/access";
import type { LocalHostPorts, LocalTransaction } from "@/lib/local-monitoring-store/context";
import type { LocalRunAdmission } from "@/lib/local-monitoring-store/run-admission";

export type MonitorPreparedItem = LocalRunAdmission["prepared"][number];
export type MonitorQuoteTarget = Readonly<{
  id: string;
  target: ExecutionTargetV1;
  point: PointRevision;
}>;
/** Server composition only. It must not perform provider I/O while resolving or quoting. */
export type ManualLocalDriver = Readonly<{
  ports: LocalHostPorts;
  quote(
    tx: LocalTransaction,
    input: {
      projectId: string;
      targets: readonly MonitorQuoteTarget[];
      now: Date;
    },
  ): Promise<LocalQuote>;
  /** Synchronous, per-original-item binding; no reconstructed or shared first-send permit. */
  bindPreparedItem(item: MonitorPreparedItem): LocalSubmitCollectAdapter;
}>;
export type ManualLocalDriverResult =
  | { kind: "ready"; driver: ManualLocalDriver }
  | {
      kind: "unavailable";
      reason:
        | "capability_unregistered"
        | "connection_unavailable"
        | "unsupported"
        | "pricing_unavailable";
    };
export type ManualLocalDriverFactory = (
  tx: LocalTransaction,
  input: {
    scope: LocalProjectScope;
    definition: MonitorDefinition;
    connectionPublicId: string;
    /** Only server-verified original retry membership may narrow the default Cartesian quote. */
    retryTargetKeys?: readonly string[];
    source?: "app" | "worker";
    trigger?: "manual" | "scheduled";
  },
) => Promise<ManualLocalDriverResult>;
