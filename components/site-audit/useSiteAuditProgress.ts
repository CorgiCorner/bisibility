"use client";

import type { SavedSiteAudit } from "@/lib/site-audit/schema";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

type ReadAudit = (input: { projectId: string; reportId: string }) => Promise<SavedSiteAudit | null>;
const key = (projectId: string, reportId: string | undefined) =>
  ["site-audit", projectId, reportId] as const;
const active = (report: SavedSiteAudit | null | undefined) =>
  ["queued", "running"].includes(report?.run?.state ?? "");

export function useSiteAuditProgress(input: {
  projectId: string;
  initial: SavedSiteAudit | null;
  paused: boolean;
  readAction: ReadAudit;
}) {
  const { projectId, initial, paused, readAction } = input;
  const client = useQueryClient();
  const [selected, select] = useState(initial);
  const reportId = selected?.id;
  const queryKey = key(projectId, reportId);
  const queryFn = async ({ signal }: { signal: AbortSignal }) => {
    if (!reportId) return null;
    const next = await readAction({ projectId, reportId });
    signal.throwIfAborted();
    if (!next || next.id === reportId) return next;
    return client.getQueryData<SavedSiteAudit>(queryKey) ?? null;
  };
  const query = useQuery({
    queryKey,
    queryFn,
    initialData: selected,
    enabled: Boolean(reportId) && !paused && active(selected),
    staleTime: Infinity,
    refetchInterval: (current) => (!paused && active(current.state.data) ? 3000 : false),
  });
  return {
    saved: query.data,
    setSaved(next: SavedSiteAudit) {
      void client.cancelQueries({ queryKey: key(projectId, next.id), exact: true });
      client.setQueryData(key(projectId, next.id), next);
      select(next);
    },
    cancelPending: () => client.cancelQueries({ queryKey, exact: true }),
    async refresh() {
      await client.invalidateQueries({ queryKey, exact: true, refetchType: "none" });
      return client.fetchQuery({ queryKey, queryFn, staleTime: 0 });
    },
  };
}
