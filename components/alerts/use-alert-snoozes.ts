"use client";

import { useState } from "react";

type Snooze = { id: string; keyword: string; until: string };

export function useAlertSnoozes(
  projectId: string,
  serverCount: number,
  serverIds: readonly string[],
) {
  const [state, setState] = useState<{ projectId: string; snoozes: Snooze[] }>({
    projectId,
    snoozes: [],
  });
  const stamp = `${projectId}:${[...serverIds].sort().join(",")}`;
  const [server, setServer] = useState({ ids: serverIds, projectId, stamp });
  if (server.stamp !== stamp) {
    const removed = new Set(
      server.projectId === projectId ? server.ids.filter((id) => !serverIds.includes(id)) : [],
    );
    setServer({ ids: serverIds, projectId, stamp });
    if (removed.size > 0)
      setState((current) => ({
        ...current,
        snoozes: current.snoozes.filter((item) => !removed.has(item.id)),
      }));
  }
  const snoozes = state.projectId === projectId ? state.snoozes : [];
  const active = snoozes.filter((item) => new Date(item.until).getTime() > Date.now());
  const confirmed = new Set(serverIds);
  const count = serverCount + active.filter((item) => !confirmed.has(item.id)).length;
  function snooze(id: string, keyword: string) {
    const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    setState((current) => ({
      projectId,
      snoozes: [
        ...(current.projectId === projectId
          ? current.snoozes.filter((item) => item.id !== id)
          : []),
        { id, keyword, until },
      ],
    }));
    return () =>
      setState((current) =>
        current.projectId !== projectId
          ? current
          : {
              projectId,
              snoozes: current.snoozes.filter((item) => item.id !== id),
            },
      );
  }
  function confirm(id: string, until: string) {
    setState((current) =>
      current.projectId !== projectId
        ? current
        : {
            projectId,
            snoozes: current.snoozes.map((item) => (item.id === id ? { ...item, until } : item)),
          },
    );
  }
  return { confirm, count, ids: new Set(active.map((item) => item.id)), snooze, snoozes: active };
}
