"use client";

import { presentAdminActionError } from "@/components/admin/admin-action-error";
import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/toast-context";
import {
  resetInstanceAdminAccountLimits,
  setInstanceAdminAccountDeactivated,
} from "@/lib/actions/instance-admin-account-actions";
import { GaugeIcon as Gauge } from "@phosphor-icons/react/dist/csr/Gauge";
import { UserMinusIcon as UserMinus } from "@phosphor-icons/react/dist/csr/UserMinus";
import { UserPlusIcon as UserPlus } from "@phosphor-icons/react/dist/csr/UserPlus";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

type AccountStatus = "active" | "deactivated";
type PendingModal = "limits" | "state" | null;
type StateActionResult = Awaited<ReturnType<typeof setInstanceAdminAccountDeactivated>>;
type LimitActionResult = Awaited<ReturnType<typeof resetInstanceAdminAccountLimits>>;
type AccountActionResult = StateActionResult | LimitActionResult;

function stateActionMessage(
  result: StateActionResult,
  t: ReturnType<typeof useTranslations<"instanceAdmin.account.actions">>,
) {
  if (result.status === "completed") {
    return result.accountStatus === "deactivated" ? t("deactivated") : t("reactivated");
  }
  if (result.status === "blocked") return t("blocked");
  if (result.status === "forbidden") return t("forbidden");
  if (result.status === "rate_limited") return t("rateLimited");
  return t("failed");
}

function limitActionMessage(
  result: LimitActionResult,
  t: ReturnType<typeof useTranslations<"instanceAdmin.account.actions">>,
) {
  if (result.status === "completed") return t("limitsCompleted");
  if (result.status === "forbidden") return t("forbidden");
  if (result.status === "rate_limited") return t("rateLimited");
  return t("limitsFailed");
}

function actionSeverity(result: AccountActionResult) {
  if (result.status === "completed") return "success" as const;
  if (result.status === "failed" || result.status === "forbidden") return "error" as const;
  return "warning" as const;
}

export function AdminAccountActions({
  onStatusChange,
  status,
  userId,
}: Readonly<{
  onStatusChange: (status: AccountStatus) => void;
  status: AccountStatus;
  userId: string;
}>) {
  const { showToast } = useToast();
  const sharedErrors = useSharedErrorMessages();
  const t = useTranslations("instanceAdmin.account.actions");
  const controls = useTranslations("instanceAdmin.controls");
  const [modal, setModal] = useState<PendingModal>(null);
  const [pending, startTransition] = useTransition();
  const deactivated = status === "deactivated";

  function changeState() {
    startTransition(async () => {
      try {
        const result = await setInstanceAdminAccountDeactivated({
          deactivated: !deactivated,
          userId,
        });
        if (result.status === "completed") onStatusChange(result.accountStatus);
        showToast(stateActionMessage(result, t), { severity: actionSeverity(result) });
      } catch (error) {
        const message = presentAdminActionError(error, sharedErrors, t("failed"));
        showToast(message, { severity: "error" });
      } finally {
        setModal(null);
      }
    });
  }

  function resetLimits() {
    startTransition(async () => {
      try {
        const result = await resetInstanceAdminAccountLimits({ userId });
        showToast(limitActionMessage(result, t), { severity: actionSeverity(result) });
      } catch (error) {
        const message = presentAdminActionError(error, sharedErrors, t("limitsFailed"));
        showToast(message, { severity: "error" });
      } finally {
        setModal(null);
      }
    });
  }

  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          disabled={pending}
          onClick={() => setModal("state")}
          size="sm"
          startIcon={
            deactivated ? (
              <UserPlus aria-hidden size={14} weight="regular" />
            ) : (
              <UserMinus aria-hidden size={14} weight="regular" />
            )
          }
          type="button"
          variant={deactivated ? "secondary" : "destructive"}
        >
          {deactivated ? controls("reactivateAccount") : controls("deactivateAccount")}
        </Button>
        <Button
          disabled={pending}
          onClick={() => setModal("limits")}
          size="sm"
          startIcon={<Gauge aria-hidden size={14} weight="regular" />}
          type="button"
          variant="secondary"
        >
          {controls("resetRateLimits")}
        </Button>
      </div>
      <ConfirmModal
        busy={pending}
        kind={deactivated ? "reactivateAccount" : "deactivateAccount"}
        onClose={() => setModal(null)}
        onConfirm={changeState}
        open={modal === "state"}
        showConfirmationToast={false}
      />
      <ConfirmModal
        busy={pending}
        kind="resetAccountLimits"
        onClose={() => setModal(null)}
        onConfirm={resetLimits}
        open={modal === "limits"}
        showConfirmationToast={false}
      />
    </>
  );
}
