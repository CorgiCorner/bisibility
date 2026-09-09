"use client";

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
import { useState, useTransition } from "react";

type AccountStatus = "active" | "deactivated";
type PendingModal = "limits" | "state" | null;

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
        if (result.status === "completed") {
          onStatusChange(result.accountStatus);
          showToast(result.message, { severity: "success" });
        } else {
          showToast(result.message, {
            severity:
              result.status === "failed" || result.status === "forbidden" ? "error" : "warning",
          });
        }
      } catch {
        showToast("Account action failed.", { severity: "error" });
      } finally {
        setModal(null);
      }
    });
  }

  function resetLimits() {
    startTransition(async () => {
      try {
        const result = await resetInstanceAdminAccountLimits({ userId });
        showToast(result.message, {
          severity:
            result.status === "completed"
              ? "success"
              : result.status === "failed" || result.status === "forbidden"
                ? "error"
                : "warning",
        });
      } catch {
        showToast("Rate limits could not be reset.", { severity: "error" });
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
          {deactivated ? "Reactivate account" : "Deactivate account"}
        </Button>
        <Button
          disabled={pending}
          onClick={() => setModal("limits")}
          size="sm"
          startIcon={<Gauge aria-hidden size={14} weight="regular" />}
          type="button"
          variant="secondary"
        >
          Reset rate limits
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
