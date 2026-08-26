"use client";

import { Button, Input, Modal, StatusPill, Switch } from "@/components/ui";
import type { updateProviderConnectionAllocationAction } from "@/lib/actions/provider-allocation";
import type { ProviderSpendConnection } from "@/lib/queries/provider-spend";
import { appPath } from "@/lib/routing/app-path";
import {
  type ProviderAllocationInput,
  providerAllocationSchema,
} from "@/lib/schemas/usage-settings";
import { actionErrorMessage } from "@/lib/ui/action-error";
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
function initialValue(connection: ProviderSpendConnection) {
  if (!connection.allocation) return "";
  return connection.unit === "cents"
    ? (connection.allocation.amountPerMonth / 100).toFixed(2)
    : String(connection.allocation.amountPerMonth);
}

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
    Object.fromEntries(connections.map((item) => [item.connectionId, initialValue(item)])),
  );
  const [noBudget, setNoBudget] = useState(() =>
    Object.fromEntries(connections.map((item) => [item.connectionId, item.allocation === null])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  async function submit() {
    const changed = connections.filter(
      (item) =>
        noBudget[item.connectionId] !== (item.allocation === null) ||
        (!noBudget[item.connectionId] && values[item.connectionId] !== initialValue(item)),
    );
    const payloads: ProviderAllocationInput[] = [];
    const nextErrors: Record<string, string> = {};
    for (const connection of changed) {
      const payload: ProviderAllocationInput = noBudget[connection.connectionId]
        ? { allocation: null, connectionId: connection.connectionId }
        : connection.unit === "cents"
          ? {
              allocation: { amountDollars: values[connection.connectionId] ?? "", unit: "cents" },
              connectionId: connection.connectionId,
            }
          : {
              allocation: { amount: Number(values[connection.connectionId]), unit: "units" },
              connectionId: connection.connectionId,
            };
      const parsed = providerAllocationSchema.safeParse(payload);
      if (!parsed.success)
        nextErrors[connection.connectionId] =
          parsed.error.issues[0]?.message ?? "Enter a valid budget.";
      else payloads.push(parsed.data);
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
              Save budget
            </Button>
          ) : null}
        </>
      }
      footerClassName="gap-2.5"
      onClose={onClose}
      open
      title="Edit budget"
      width={560}
    >
      {connections.length ? (
        <>
          <p className="m-0 text-[12.5px] leading-[1.55] text-fg-muted">
            Set a monthly budget for each provider. Your first save switches this project from the
            legacy project cap to per-provider budgets.
          </p>
          <div className="mt-4 divide-y divide-border-soft border-y border-border-soft">
            {connections.map((connection) => (
              <div
                className="grid gap-3 py-3.5 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-center"
                key={connection.connectionId}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-semibold text-fg">
                      {connection.provider}
                    </span>
                    {connection.primary ? (
                      <StatusPill label="Primary" showDot={false} size="sm" status="optional" />
                    ) : null}
                  </div>
                  <p className="m-0 mt-1 font-mono text-[10px] text-fg-muted">
                    {connection.allocation
                      ? `Current: ${initialValue(connection)} ${connection.unit === "cents" ? "USD" : "searches"}`
                      : "No budget"}
                  </p>
                </div>
                <div>
                  <Input
                    aria-label={`${connection.provider} monthly budget`}
                    disabled={noBudget[connection.connectionId]}
                    inputMode={connection.unit === "cents" ? "decimal" : "numeric"}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [connection.connectionId]: event.target.value,
                      }))
                    }
                    placeholder={connection.unit === "cents" ? "0.00" : "0"}
                    value={values[connection.connectionId] ?? ""}
                  />
                  <Switch
                    checked={Boolean(noBudget[connection.connectionId])}
                    className="mt-2 w-full justify-between px-2.5 py-1.5"
                    label="No budget"
                    onChange={(event) =>
                      setNoBudget((current) => ({
                        ...current,
                        [connection.connectionId]: event.target.checked,
                      }))
                    }
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
