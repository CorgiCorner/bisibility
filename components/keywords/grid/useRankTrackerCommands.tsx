"use client";

import { type RegisteredCommand, useRegisterCommands } from "@/components/shell/command-registry";
import type { RankTrackerAction } from "@/lib/keywords/rank-tracker-command";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef } from "react";

type UseRankTrackerCommandsInput = {
  canCreateKeyword: boolean;
  canUpdateKeyword: boolean;
  initialAction: RankTrackerAction | null;
  onAdd: () => void;
  onExport: () => void;
  onFilter: () => void;
  onImport: () => void;
  onRunChecks: () => void;
  rowCounts: { all: number; visible: number };
};

export function useRankTrackerCommands({
  canCreateKeyword,
  canUpdateKeyword,
  initialAction,
  onAdd,
  onExport,
  onFilter,
  onImport,
  onRunChecks,
  rowCounts,
}: Readonly<UseRankTrackerCommandsInput>) {
  const router = useRouter();
  const canExport = rowCounts.visible > 0;
  const canFilter = rowCounts.all > 0;
  const canRunChecks = canUpdateKeyword && canExport;

  const commands = useMemo<RegisteredCommand[]>(() => {
    const cmds: RegisteredCommand[] = [];
    if (canCreateKeyword) {
      cmds.push({
        id: "rt-add",
        label: "Add keyword",
        scope: "rank-tracker",
        hint: "New keyword",
        run: onAdd,
      });
      cmds.push({
        id: "rt-import",
        label: "Import CSV",
        scope: "rank-tracker",
        hint: "Upload file",
        run: onImport,
      });
    }
    if (canExport) {
      cmds.push({
        id: "rt-export",
        label: "Export keywords",
        scope: "rank-tracker",
        hint: "Download file",
        run: onExport,
      });
    }
    if (canFilter) {
      cmds.push({
        id: "rt-filter",
        label: "Filter",
        scope: "rank-tracker",
        hint: "Refine rows",
        run: onFilter,
      });
    }
    if (canRunChecks) {
      cmds.push({
        id: "rt-run-checks",
        label: "Run rank checks",
        scope: "rank-tracker",
        hint: "Check visible",
        run: onRunChecks,
      });
    }
    return cmds;
  }, [
    canCreateKeyword,
    canExport,
    canFilter,
    canRunChecks,
    onAdd,
    onExport,
    onFilter,
    onImport,
    onRunChecks,
  ]);

  const registerRef = useRegisterCommands(commands);
  const stateRef = useRef({
    canCreateKeyword,
    canExport,
    canFilter,
    canRunChecks,
    initialAction,
    onAdd,
    onExport,
    onFilter,
    onImport,
    onRunChecks,
  });
  stateRef.current = {
    canCreateKeyword,
    canExport,
    canFilter,
    canRunChecks,
    initialAction,
    onAdd,
    onExport,
    onFilter,
    onImport,
    onRunChecks,
  };

  const routerRef = useRef(router);
  routerRef.current = router;
  const lastConsumedRef = useRef<RankTrackerAction | null>(null);

  const consumeActionRef = useCallback((node: HTMLSpanElement | null) => {
    if (node === null) return;
    const state = stateRef.current;
    if (state.initialAction === null) {
      lastConsumedRef.current = null;
      return;
    }
    if (lastConsumedRef.current === state.initialAction) return;
    lastConsumedRef.current = state.initialAction;
    switch (state.initialAction) {
      case "add":
        if (state.canCreateKeyword) state.onAdd();
        break;
      case "import":
        if (state.canCreateKeyword) state.onImport();
        break;
      case "export":
        if (state.canExport) state.onExport();
        break;
      case "filter":
        if (state.canFilter) state.onFilter();
        break;
    }

    const url = new URL(window.location.href);
    url.searchParams.delete("action");
    routerRef.current.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
  }, []);

  return { actionKey: initialAction ?? "none", consumeActionRef, registerRef };
}

export function RankTrackerCommandMarker(props: Readonly<UseRankTrackerCommandsInput>) {
  const { actionKey, consumeActionRef, registerRef } = useRankTrackerCommands(props);
  return (
    <>
      <span aria-hidden hidden ref={registerRef} />
      <span aria-hidden hidden key={actionKey} ref={consumeActionRef} />
    </>
  );
}
