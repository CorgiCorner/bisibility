import type { OperationRowProps } from "@/components/ui/OperationRow";
import type { StatusChipTone } from "@/components/ui/StatusChip";
import type {
  GscImportOperation,
  OperationSnapshot,
  RankCheckOperation,
  RunTrigger,
  SelectionKind,
} from "@/lib/rank-check/runs/contract";

export type TrayOperation = Pick<
  OperationRowProps,
  | "action"
  | "actionHref"
  | "actor"
  | "completed"
  | "counts"
  | "deferred"
  | "etaSeconds"
  | "failed"
  | "href"
  | "meta"
  | "nextCheckAt"
  | "now"
  | "provider"
  | "resumeDate"
  | "showBar"
  | "state"
  | "stateLine"
  | "status"
  | "title"
  | "total"
  | "unit"
  | "unitKind"
> & {
  attention: Extract<StatusChipTone, "attention" | "critical"> | null;
  blocked: boolean;
  id: string;
  gscImport: {
    presentationTitle: GscImportOperation["presentation"]["title"];
    supportingText: string | null;
  } | null;
  kind: OperationSnapshot["kind"];
  lifecycle: "attention" | "executing" | "terminal" | "waiting";
  property: string | null;
  rankCheck: {
    blockedReason: string | null;
    budget: RankCheckOperation["budget"];
    keywordCount: number;
    selectionKind: SelectionKind;
    trigger: RunTrigger;
  } | null;
};

export type OperationsTrayPill =
  | { kind: "idle" }
  | {
      count: number;
      kind: "busy";
      tone: StatusChipTone;
      word: "blocked" | "failed" | "running" | "waiting";
    };
