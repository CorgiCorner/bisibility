import type { MonitorMutationReceipt } from "@/lib/local-monitor-store/model";
import type {
  listLocalMonitors,
  readLocalMonitor,
  readLocalMonitorHistory,
} from "@/lib/local-monitor-store/read";
import type { MonitorDefinitionInput } from "@/lib/local-monitor-store/schema";

export type MonitorDetail = Awaited<ReturnType<typeof readLocalMonitor>>;
export type MonitorPage = Awaited<ReturnType<typeof listLocalMonitors>>;
export type MonitorHistoryPage = Awaited<ReturnType<typeof readLocalMonitorHistory>>;
export type MonitorPermissions = Readonly<{ canRead: boolean; canWrite: boolean }>;
export type SubjectChoice = Readonly<{ id: string; name: string; identityRevisionId: string }>;
export type KeywordChoice = Readonly<{ id: string; text: string; device: string }>;
export type SetupChoices = Readonly<{
  subjects: readonly SubjectChoice[];
  keywords: readonly KeywordChoice[];
  subjectsMore: boolean;
  keywordsMore: boolean;
  nextSubject: string | null;
  nextKeyword: string | null;
  permissions: MonitorPermissions;
}>;
export type MonitorCommand =
  | {
      operation: "create";
      projectId: string;
      definition: MonitorDefinitionInput;
      idempotencyKey: string;
    }
  | {
      operation: "revise";
      projectId: string;
      monitorId: string;
      expectedVersion: number;
      definition: MonitorDefinitionInput;
      idempotencyKey: string;
    }
  | {
      operation: "archive";
      projectId: string;
      monitorId: string;
      expectedVersion: number;
      idempotencyKey: string;
    };
export type MonitorSaveResult =
  | { kind: "saved"; receipt: MonitorMutationReceipt }
  | { kind: "conflict" | "invalid" | "forbidden" | "unavailable" };
export type SaveMonitor = (command: MonitorCommand) => Promise<MonitorSaveResult>;
export type TranslateMonitor = (key: string, values?: Record<string, string | number>) => string;
export type SearchMonitorChoices = (input: {
  projectId: string;
  search: string;
  afterKeyword?: string;
  afterSubject?: string;
}) => Promise<SetupChoices>;
