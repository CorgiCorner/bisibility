"use client";

import { BudgetAmountField } from "@/components/settings/usage/BudgetAmountField";
import {
  BUDGET_MODAL_CONSEQUENCE_COPY,
  budgetFieldChanged,
  budgetInitialValue,
  buildProviderAllocationPayload,
  providerUsageContextLine,
  validateBudgetField,
} from "@/components/settings/usage/budget-edit-modal-model";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { StatusPill } from "@/components/ui/StatusPill";
import type { updateProviderConnectionAllocationAction } from "@/lib/actions/provider-allocation";
import type { ProviderSpendConnection } from "@/lib/queries/provider-spend";
import { appPath } from "@/lib/routing/app-path";
import type { ProviderAllocationInput } from "@/lib/schemas/usage-settings";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { cn } from "@/lib/ui/cn";
import { elevatedListClassName, metricEyebrowClassName } from "@/lib/ui/elevated-surface-styles";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type BudgetEditModalProps = {
  connections: readonly ProviderSpendConnection[];
  onClose: () => void;
  onSaved: () => void;
  projectId: string;
  projectRef: string;
  updateProviderAllocation: typeof updateProviderConnectionAllocationAction;
};

export function BudgetEditModal({
  connections,
  onClose,
  onSaved,
  projectId,
  projectRef,
  updateProviderAllocation,
}: Readonly<BudgetEditModalProps>) {
  const router = useRouter();
  const [values, setValues] = useState(() =>
    Object.fromEntries(connections.map((item) => [item.connectionId, budgetInitialValue(item)])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const showPrimaryChip = connections.length > 1;

  function setFieldError(connectionId: string, message: string | null) {
    setErrors((current) => {
      if (!message) {
        const { [connectionId]: _removed, ...rest } = current;
        return rest;
      }
      return { ...current, [connectionId]: message };
    });
  }

  function validateField(connection: ProviderSpendConnection) {
    const message = validateBudgetField(connection, values[connection.connectionId] ?? "");
    setFieldError(connection.connectionId, message);
    return message === null;
  }

  async function submit() {
    const changed = connections.filter((connection) =>
      budgetFieldChanged(connection, values[connection.connectionId] ?? ""),
    );
    const nextErrors: Record<string, string> = {};
    const payloads: ProviderAllocationInput[] = [];
    for (const connection of changed) {
      const message = validateBudgetField(connection, values[connection.connectionId] ?? "");
      if (message) {
        nextErrors[connection.connectionId] = message;
        continue;
      }
      payloads.push(
        buildProviderAllocationPayload(connection, values[connection.connectionId] ?? ""),
      );
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSaving(true);
    const actionErrors: Record<string, string> = {};
    for (const payload of payloads) {
      try {
        await updateProviderAllocation(projectId, payload);
      } catch (error) {
        actionErrors[payload.connectionId] = actionErrorMessage(
          error,
          "Provider budget could not be saved.",
        );
      }
    }
    setSaving(false);
    setErrors(actionErrors);
    if (!Object.keys(actionErrors).length) {
      router.refresh();
      onSaved();
    }
  }

  return (
    <Modal
      footer={
        <>
          <Button disabled={saving} onClick={onClose} variant="secondary">
            Cancel
          </Button>
          {connections.length ? (
            <Button
              disabled={saving}
              loading={saving}
              loadingLabel="Saving"
              onClick={submit}
              type="button"
            >
              Save
            </Button>
          ) : null}
        </>
      }
      onClose={onClose}
      open
      title="Provider budgets"
      width={560}
    >
      {connections.length ? (
        <>
          <p className="m-0 text-[12.5px] leading-[1.55] text-fg-muted">
            Set a monthly budget for each provider.
          </p>
          <div className="mt-4 hidden sm:grid sm:grid-cols-[minmax(0,1fr)_180px] sm:gap-3">
            <span />
            <span className={cn(metricEyebrowClassName, "text-right")}>Budget / month</span>
          </div>
          <div className={`mt-1 ${elevatedListClassName}`}>
            {connections.map((connection, index) => (
              <div
                className="grid gap-3 py-3.5 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-start"
                key={connection.connectionId}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-semibold text-fg">
                      {connection.provider}
                    </span>
                    {showPrimaryChip && connection.primary ? (
                      <StatusPill label="Primary" showDot={false} size="sm" status="optional" />
                    ) : null}
                  </div>
                  <p className="m-0 mt-1 font-sans tabular-nums text-[10px] text-fg-muted">
                    {providerUsageContextLine(connection)}
                  </p>
                </div>
                <div>
                  <BudgetAmountField
                    aria-label={`${connection.provider} monthly budget`}
                    autoFocus={index === 0}
                    connection={connection}
                    error={errors[connection.connectionId]}
                    onBlur={() => validateField(connection)}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [connection.connectionId]: event.target.value,
                      }))
                    }
                    value={values[connection.connectionId] ?? ""}
                  />
                </div>
                {errors[connection.connectionId] ? (
                  <p className="m-0 text-[11.5px] text-red-text sm:col-span-2">
                    {errors[connection.connectionId]}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
          <p className="m-0 mt-4 text-[11.5px] leading-[1.55] text-fg-muted">
            {BUDGET_MODAL_CONSEQUENCE_COPY}
          </p>
        </>
      ) : (
        <p className="m-0 text-[12.5px] leading-[1.55] text-fg-muted">
          No provider connected yet.{" "}
          <Link
            className="font-medium text-accent-text hover:underline"
            href={appPath(projectRef, "integrations")}
          >
            Connect a provider
          </Link>{" "}
          to set a monthly budget for it.
        </p>
      )}
    </Modal>
  );
}
