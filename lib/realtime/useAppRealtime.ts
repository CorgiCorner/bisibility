"use client";

import type { NotificationFeed } from "@/lib/queries/notifications";
import type { OperationSnapshot } from "@/lib/rank-check/runs/contract";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { subscribeAppRealtime } from "./client-subscription";

export type AppRealtimeStatus = "connecting" | "live" | "live-polling" | "reconnecting" | "offline";

export type AppRealtimeValue = {
  notifications: NotificationFeed | null;
  operations: OperationSnapshot[];
  status: AppRealtimeStatus;
  rankDataVersion?: number;
};

const defaultValue: AppRealtimeValue = {
  notifications: null,
  operations: [],
  status: "connecting",
  rankDataVersion: 0,
};

export const AppRealtimeContext = createContext<AppRealtimeValue>(defaultValue);

export function useAppRealtimeState(
  projectRef: string,
  onRankDataChange?: () => void,
): AppRealtimeValue {
  const onRankDataChangeRef = useRef(onRankDataChange);
  onRankDataChangeRef.current = onRankDataChange;
  const [notifications, setNotifications] = useState<NotificationFeed | null>(null);
  const [operations, setOperations] = useState<OperationSnapshot[]>([]);
  const [status, setStatus] = useState<AppRealtimeStatus>("connecting");
  const [rankDataVersion, setRankDataVersion] = useState(0);

  // Synchronize the app shell with the browser-managed realtime subscription and cleanup.
  useEffect(() => {
    setNotifications(null);
    setOperations([]);
    setStatus("connecting");
    return subscribeAppRealtime(projectRef, {
      notifications: setNotifications,
      operations: setOperations,
      status: setStatus,
      rankData: () => {
        setRankDataVersion((version) => version + 1);
        onRankDataChangeRef.current?.();
      },
    });
  }, [projectRef]);

  return { notifications, operations, status, rankDataVersion };
}

export function useAppRealtime() {
  return useContext(AppRealtimeContext);
}
