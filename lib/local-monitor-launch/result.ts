import type { launchMonitor } from "./launch";
import type { previewMonitorLaunch } from "./preview";
import type { readMonitorLaunchState } from "./read";
export type MonitorLaunchFailure = {
  kind: "forbidden" | "invalid" | "conflict" | "expired" | "unavailable";
  reason?:
    | "worker_unavailable"
    | "capability_unregistered"
    | "connection_unavailable"
    | "unsupported"
    | "pricing_unavailable";
};
export type MonitorLaunchPreview = Awaited<ReturnType<typeof previewMonitorLaunch>>;
export type MonitorLaunchReceipt = Awaited<ReturnType<typeof launchMonitor>>;
export type MonitorLaunchState = Awaited<ReturnType<typeof readMonitorLaunchState>>;
export type MonitorRun = NonNullable<MonitorLaunchState["run"]>;
export type PreviewMonitorResult = MonitorLaunchPreview | MonitorLaunchFailure;
export type LaunchMonitorResult =
  | { kind: "queued"; receipt: MonitorLaunchReceipt }
  | MonitorLaunchFailure;
export type ReadMonitorLaunchResult =
  | { kind: "ready"; state: MonitorLaunchState }
  | MonitorLaunchFailure;
