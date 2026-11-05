"use client";

import { ConfirmModal } from "@/components/ui/ConfirmModal";
import type { AlertActionHandlers, AlertRuleView } from "@/lib/alerts/alert-data";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type RefObject, useRef } from "react";

type AlertRuleDeleteConfirmProps = {
  actions: AlertActionHandlers;
  onClose: () => void;
  projectId: string;
  /** Receives focus after a confirmed delete, because the row and its trash button disappear. */
  returnFocusRef: RefObject<HTMLElement | null>;
  rule: AlertRuleView | null;
};

export function AlertRuleDeleteConfirm({
  actions,
  onClose,
  projectId,
  returnFocusRef,
  rule,
}: Readonly<AlertRuleDeleteConfirmProps>) {
  const t = useTranslations("projectAlerts.rules");
  const router = useRouter();
  const deletedRef = useRef(false);

  return (
    <ConfirmModal
      failureDetail={
        <p className="m-0 text-[12px] font-medium text-red-text" role="alert">
          {t("deleteUnconfirmed")}
        </p>
      }
      kind="deleteAlertRule"
      onClose={onClose}
      onConfirm={async () => {
        if (!rule) return;
        await actions.deleteAlertRuleAction({ projectId, ruleId: rule.id });
        deletedRef.current = true;
        onClose();
        router.refresh();
      }}
      onExited={() => {
        if (!deletedRef.current) return;
        deletedRef.current = false;
        returnFocusRef.current?.focus();
      }}
      open={rule !== null}
    >
      <p className="mt-3 font-semibold">{rule?.name}</p>
    </ConfirmModal>
  );
}
