"use client";
import type {
  AllocationNativeObservation,
  AllocationProps,
} from "@/components/usagekit/provider-allocation-policy";
import {
  allocationIdentity,
  type NativeAllocationRow,
  type NativeAvailabilityReason,
  nativeAllocationAvailability,
} from "@/lib/provider-ui/native-allocation-evidence";
import type { ProviderAllocationRow } from "@usagekit/views";
import { useRef, useState } from "react";

export { allocationIdentity } from "@/lib/provider-ui/native-allocation-evidence";
/** Refreshes only run in event handlers. Every result is tied to its full evidence identity. */
export function useAllocationObservation({
  evidence,
  editable,
  onRefreshBalance,
  onRefreshNative,
  beginRefresh,
}: Pick<AllocationProps, "onRefreshBalance" | "onRefreshNative"> & {
  evidence: ProviderAllocationRow | null;
  editable: boolean;
  beginRefresh: () => () => void;
}) {
  const key = allocationIdentity(evidence);
  const current = useRef({ key, request: 0 });
  if (current.current.key !== key) current.current = { key, request: current.current.request + 1 };
  const [probe, setProbe] = useState<{
    key: string;
    request: number;
    pending: boolean;
    failed: boolean;
    row: ProviderAllocationRow | null;
    native: AllocationNativeObservation | null;
  } | null>(null);
  const [rejected, setRejected] = useState<{
    key: string;
    reason: NativeAvailabilityReason;
  } | null>(null);
  const rejectedReason = rejected?.key === key ? rejected.reason : null;
  const observed = probe?.key === key && probe.request === current.current.request ? probe : null;
  const refresh = async () => {
    if ((!onRefreshBalance && !onRefreshNative) || !evidence || !editable || observed?.pending)
      return;
    setRejected(null);
    const request = ++current.current.request;
    const finish = beginRefresh();
    setProbe({ key, request, pending: true, failed: false, row: null, native: null });
    try {
      const answer = onRefreshNative
        ? await onRefreshNative(evidence)
        : await onRefreshBalance?.(evidence);
      if (current.current.request !== request || current.current.key !== key) return;
      const native = onRefreshNative ? (answer as AllocationNativeObservation | null) : null;
      const row = onRefreshNative ? null : (answer as ProviderAllocationRow | null);
      const valid = allocationIdentity(native?.identity ?? row) === key;
      setProbe({
        key,
        request,
        pending: false,
        failed: !valid,
        row: valid ? row : null,
        native: valid ? native : null,
      });
    } catch {
      if (current.current.request === request && current.current.key === key)
        setProbe({ key, request, pending: false, failed: true, row: null, native: null });
    } finally {
      finish();
    }
  };
  const initial = (evidence as NativeAllocationRow | null)?.nativeObservation;
  const native = observed ? observed.native : (initial ?? null);
  const nativeAvailable =
    onRefreshNative && evidence ? nativeAllocationAvailability(evidence, native) : null;
  const legacy =
    !observed && !initial && !(evidence as NativeAllocationRow | null)?.availabilityReason;
  return {
    observed,
    native,
    refresh,
    invalidateNative: (reason: NativeAvailabilityReason) => setRejected({ key, reason }),
    availabilityReason:
      rejectedReason ??
      (nativeAvailable?.outcome === "unavailable" ? nativeAvailable.reason : undefined),
    availability: rejectedReason
      ? null
      : onRefreshNative
        ? nativeAvailable?.outcome === "ready"
          ? nativeAvailable.row
          : legacy
            ? evidence
            : null
        : observed
          ? observed.row
          : evidence,
  };
}

export function useAllocationRefresh(onPendingChange: AllocationProps["onRefreshPendingChange"]) {
  const inFlight = useRef(new Set<symbol>());
  const [refreshing, setRefreshing] = useState(false);
  const notify = useRef(onPendingChange);
  notify.current = onPendingChange;
  const beginRefresh = () => {
    const token = Symbol();
    inFlight.current.add(token);
    if (inFlight.current.size === 1) {
      setRefreshing(true);
      notify.current?.(true);
    }
    return () => {
      if (!inFlight.current.delete(token) || inFlight.current.size) return;
      setRefreshing(false);
      notify.current?.(false);
    };
  };
  return { refreshing, beginRefresh };
}
