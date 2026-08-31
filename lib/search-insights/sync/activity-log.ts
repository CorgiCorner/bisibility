import "server-only";

import type { ProviderFailureClass } from "@/lib/providers/failure-class";
import { Context } from "@temporalio/activity";
import type { PartitionDimensions } from "./partitions";

export type SyncStream = "backfill" | "incremental";
export type SyncPauseReason = "authorization" | "error" | "quota" | "user";

const INTEGER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatPartitionStored(input: {
  date: string;
  dimensions: PartitionDimensions;
  storedRows: number;
}) {
  return `[sync] gsc day ${input.date} · dims ${input.dimensions.join("-")} · stored ${INTEGER.format(input.storedRows)} rows`;
}

export function formatDayComplete(date: string) {
  return `[sync] gsc day ${date} · complete (3/3 sets)`;
}

export function formatSyncPaused(input: { reason: SyncPauseReason; stream: SyncStream }) {
  const action =
    input.reason === "quota"
      ? "resumes automatically"
      : input.reason === "authorization"
        ? "reconnect required"
        : input.reason === "user"
          ? "resumes manually"
          : "retry manually";
  return `[sync] ${input.stream} paused · reason ${input.reason} · ${action}`;
}

export function formatSyncResumed(input: { reason: SyncPauseReason; stream: SyncStream }) {
  return `[sync] ${input.stream} resumed · reason ${input.reason}`;
}

export function formatSyncComplete(stream: SyncStream) {
  return `[sync] ${stream} complete`;
}

export function formatSyncFailed(input: {
  failureClass: ProviderFailureClass;
  stream: SyncStream;
}) {
  return `[sync] ${input.stream} failed · reason ${input.failureClass.replaceAll("_", "-")}`;
}

export function logSyncInfo(message: string) {
  try {
    Context.current().log.info(message);
  } catch {
    console.info(message);
  }
}
