import type { useTranslations } from "next-intl";
import type { TrayOperation } from "./OperationsTrayModel.types";

type OperationsTranslator = ReturnType<typeof useTranslations<"shell.operations">>;

function stateLabel(
  title: NonNullable<TrayOperation["gscImport"]>["presentationTitle"],
  t: OperationsTranslator,
) {
  const labels = {
    Completed: t("gsc.states.completed"),
    Delayed: t("gsc.states.delayed"),
    Failed: t("gsc.states.failed"),
    Importing: t("gsc.states.importing"),
    Paused: t("gsc.states.paused"),
    Queued: t("gsc.states.queued"),
    "Reconnect required": t("gsc.states.reconnectRequired"),
    "Status unavailable": t("gsc.states.statusUnavailable"),
    "Waiting for Google": t("gsc.states.waitingForGoogle"),
    "Waiting for data": t("gsc.states.waitingForData"),
  } as const;
  return labels[title];
}

/** Localizes only the generic shell fields while preserving detailed provider recovery copy. */
export function localizeGscTrayOperation(operation: TrayOperation, t: OperationsTranslator) {
  if (!operation.gscImport) return operation;
  return {
    ...operation,
    meta: stateLabel(operation.gscImport.presentationTitle, t),
    stateLine: operation.gscImport.supportingText,
    title: t("gsc.title"),
  };
}
