"use client";

import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { BudgetAmountField } from "@/components/settings/usage/BudgetAmountField";
import {
  budgetFieldChanged,
  budgetFromProviderAvailability,
  budgetInitialValue,
  budgetValidationIssue,
  buildProviderAllocationPayload,
  ProviderAvailabilityBudgetError,
} from "@/components/settings/usage/budget-edit-modal-model";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { StatusPill } from "@/components/ui/StatusPill";
import {
  refreshProviderConnectionBudgetAction,
  type updateProviderConnectionAllocationAction,
} from "@/lib/actions/provider-allocation";
import { MAX_ALLOCATION_AMOUNT } from "@/lib/provider-allocations/types";
import type { ProviderSpendConnection } from "@/lib/queries/provider-spend";
import { appPath } from "@/lib/routing/app-path";
import type { ProviderAllocationInput } from "@/lib/schemas/usage-settings";
import { classifyActionError } from "@/lib/ui/action-error";
import { cn } from "@/lib/ui/cn";
import { elevatedListClassName, metricEyebrowClassName } from "@/lib/ui/elevated-surface-styles";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
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
  const locale = useLocale();
  const sharedErrors = useSharedErrorMessages();
  const t = useTranslations("projectSettingsUsage.provider.budgetDialog");
  const router = useRouter();
  const [values, setValues] = useState(() =>
    Object.fromEntries(connections.map((item) => [item.connectionId, budgetInitialValue(item)])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const showPrimaryChip = connections.length > 1;

  function formatAmount(amount: number, unit: ProviderSpendConnection["unit"]) {
    if (unit === "units") return t("searches", { count: amount });
    const fractionDigits = Math.abs(amount / 100) < 100 ? 2 : 0;
    return new Intl.NumberFormat(locale, {
      currency: "USD",
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: fractionDigits,
      minimumFractionDigits: fractionDigits,
      style: "currency",
    }).format(amount / 100);
  }

  function maximumAmount(unit: ProviderSpendConnection["unit"]) {
    if (unit === "units") return new Intl.NumberFormat(locale).format(MAX_ALLOCATION_AMOUNT);
    return new Intl.NumberFormat(locale, {
      currency: "USD",
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
      style: "currency",
    }).format(MAX_ALLOCATION_AMOUNT / 100);
  }

  function validationMessage(connection: ProviderSpendConnection) {
    const issue = budgetValidationIssue(connection, values[connection.connectionId] ?? "");
    if (!issue) return null;
    if (issue === "positiveMoney") return t("positiveBudget");
    if (issue === "positiveUnits") return t("positiveUnits");
    if (issue === "invalidDecimal") return t("invalidDecimal");
    if (issue === "wholeUnits") return t("wholeUnits");
    if (issue === "tooLarge") {
      return t("tooLargeBudget", {
        maximum: maximumAmount(connection.unit),
      });
    }
    return t("invalidBudget");
  }

  function safeActionMessage(error: unknown, fallback: string) {
    const classified = classifyActionError(error);
    if (classified.kind === "staleDeployment") return sharedErrors.staleDeployment();
    if (classified.kind === "serverComponentDigest") {
      return sharedErrors.serverComponentDigest({ digest: classified.digest });
    }
    return fallback;
  }

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
    const message = validationMessage(connection);
    setFieldError(connection.connectionId, message);
    return message === null;
  }

  async function applyProviderBalance(connection: ProviderSpendConnection) {
    setRefreshing(connection.connectionId);
    setFieldError(connection.connectionId, null);
    try {
      const fresh = await refreshProviderConnectionBudgetAction(
        projectRef,
        connection.connectionId,
      );
      const value = budgetFromProviderAvailability(fresh);
      setValues((current) => ({ ...current, [connection.connectionId]: value }));
    } catch (error) {
      const message =
        error instanceof ProviderAvailabilityBudgetError
          ? error.reason === "unavailable"
            ? t("balanceUnavailable")
            : t("balanceIncompatible")
          : safeActionMessage(error, t("refreshError"));
      setFieldError(connection.connectionId, message);
    } finally {
      setRefreshing(null);
    }
  }

  async function submit() {
    const changed = connections.filter((connection) =>
      budgetFieldChanged(connection, values[connection.connectionId] ?? ""),
    );
    const nextErrors: Record<string, string> = {};
    const payloads: ProviderAllocationInput[] = [];
    for (const connection of changed) {
      const message = validationMessage(connection);
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
        actionErrors[payload.connectionId] = safeActionMessage(error, t("saveError"));
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
          <Button disabled={saving || refreshing !== null} onClick={onClose} variant="secondary">
            {t("cancel")}
          </Button>
          {connections.length ? (
            <Button
              disabled={saving || refreshing !== null}
              loading={saving}
              loadingLabel={t("saving")}
              onClick={submit}
              type="button"
            >
              {t("save")}
            </Button>
          ) : null}
        </>
      }
      onClose={onClose}
      open
      title={t("title")}
      width={560}
    >
      {connections.length ? (
        <>
          <p className="m-0 text-[12.5px] leading-[1.55] text-fg-muted">{t("description")}</p>
          <div className="mt-4 hidden sm:grid sm:grid-cols-[minmax(0,1fr)_180px] sm:gap-3">
            <span />
            <span className={cn(metricEyebrowClassName, "text-right")}>{t("perMonth")}</span>
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
                      <StatusPill
                        label={t("primary")}
                        showDot={false}
                        size="sm"
                        status="optional"
                      />
                    ) : null}
                  </div>
                  <p className="m-0 mt-1 font-sans tabular-nums text-[10px] text-fg-muted">
                    {t("thisAndLastMonth", {
                      lastMonth: formatAmount(connection.usedPriorMonth, connection.unit),
                      thisMonth: formatAmount(connection.used, connection.unit),
                    })}
                  </p>
                </div>
                <div>
                  <BudgetAmountField
                    aria-label={t("monthlyBudget", { provider: connection.provider })}
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
                  {connection.providerId === "dataforseo" || connection.providerId === "serpapi" ? (
                    <Button
                      className="mt-1"
                      disabled={saving || refreshing !== null}
                      size="xs"
                      variant="ghost"
                      onClick={() => void applyProviderBalance(connection)}
                    >
                      {refreshing === connection.connectionId
                        ? t("refreshing")
                        : t("useProviderBalance")}
                    </Button>
                  ) : null}
                </div>
                {errors[connection.connectionId] ? (
                  <p className="m-0 text-[11.5px] text-red-text sm:col-span-2">
                    {errors[connection.connectionId]}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
          <p className="m-0 mt-4 text-[11.5px] leading-[1.55] text-fg-muted">{t("consequence")}</p>
        </>
      ) : (
        <p className="m-0 text-[12.5px] leading-[1.55] text-fg-muted">
          {t("empty")}{" "}
          <Link
            className="font-medium text-accent-text hover:underline"
            href={appPath(projectRef, "integrations")}
          >
            {t("connect")}
          </Link>{" "}
          {t("emptyAfterLink")}
        </p>
      )}
    </Modal>
  );
}
