"use client";

import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import type { BudgetRowErrors } from "@/components/settings/usage/BudgetEditRow";
import { BudgetEditTable } from "@/components/settings/usage/BudgetEditTable";
import {
  type BudgetFormValues,
  type BudgetSource,
  type BudgetSurface,
  budgetFormChanged,
  budgetFromCreditBalance,
  budgetFromProviderAvailability,
  budgetUnit,
  budgetValidationIssue,
  buildProviderAllocationPayload,
  initialBudgetFormValues,
  ProviderAvailabilityBudgetError,
} from "@/components/settings/usage/budget-edit-modal-model";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import {
  refreshProviderConnectionBudgetAction,
  type updateProviderConnectionAllocationAction,
} from "@/lib/actions/provider-allocation";
import { MAX_ALLOCATION_AMOUNT } from "@/lib/provider-allocations/types";
import type { ProviderSpendConnection } from "@/lib/queries/provider-spend";
import { appPath } from "@/lib/routing/app-path";
import type { ProviderAllocationInput } from "@/lib/schemas/usage-settings";
import type { UsageBudgetCredits } from "@/lib/settings/usage-budget-credits";
import { classifyActionError } from "@/lib/ui/action-error";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

type ConnectionErrors = Partial<Record<BudgetSource, BudgetRowErrors>>;

type BudgetEditModalProps = {
  connections: readonly ProviderSpendConnection[];
  /** Null in deployments without credits: the Credits rows and balance button are hidden. */
  credits?: UsageBudgetCredits | null;
  onClose: () => void;
  onSaved: () => void;
  projectId: string;
  projectRef: string;
  updateProviderAllocation: typeof updateProviderConnectionAllocationAction;
};

export function BudgetEditModal({
  connections,
  credits = null,
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
  const [values, setValues] = useState<Record<string, BudgetFormValues>>(() =>
    Object.fromEntries(
      connections.map((item) => [item.connectionId, initialBudgetFormValues(item)]),
    ),
  );
  const [errors, setErrors] = useState<Record<string, ConnectionErrors>>({});
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const showPrimaryChip = connections.length > 1;

  function formValues(connection: ProviderSpendConnection): BudgetFormValues {
    return values[connection.connectionId] ?? initialBudgetFormValues(connection);
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

  function validationMessage(
    connection: ProviderSpendConnection,
    source: BudgetSource,
    rawValue: string,
  ) {
    const issue = budgetValidationIssue(connection, rawValue, source);
    if (!issue) return null;
    if (issue === "positiveMoney") return t("positiveBudget");
    if (issue === "positiveUnits") return t("positiveUnits");
    if (issue === "invalidDecimal") return t("invalidDecimal");
    if (issue === "wholeUnits") return t("wholeUnits");
    if (issue === "tooLarge") {
      return t("tooLargeBudget", { maximum: maximumAmount(budgetUnit(connection, source)) });
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

  function mergeError(connectionId: string, source: BudgetSource, patch: BudgetRowErrors) {
    setErrors((current) => ({
      ...current,
      [connectionId]: {
        ...current[connectionId],
        [source]: { ...current[connectionId]?.[source], ...patch },
      },
    }));
  }

  function validateField(
    connection: ProviderSpendConnection,
    source: BudgetSource,
    surface: BudgetSurface,
  ) {
    const message = validationMessage(connection, source, formValues(connection)[source][surface]);
    mergeError(connection.connectionId, source, { [surface]: message ?? undefined });
  }

  function updateValue(
    connection: ProviderSpendConnection,
    source: BudgetSource,
    surface: BudgetSurface,
    value: string,
  ) {
    setValues((current) => {
      const previous = current[connection.connectionId] ?? initialBudgetFormValues(connection);
      return {
        ...current,
        [connection.connectionId]: {
          ...previous,
          [source]: { ...previous[source], [surface]: value },
        },
      };
    });
  }

  async function applyProviderBalance(connection: ProviderSpendConnection) {
    setRefreshing(`${connection.connectionId}:own`);
    mergeError(connection.connectionId, "own", { app: undefined, row: undefined });
    try {
      const fresh = await refreshProviderConnectionBudgetAction(
        projectRef,
        connection.connectionId,
      );
      updateValue(connection, "own", "app", budgetFromProviderAvailability(fresh));
    } catch (error) {
      const message =
        error instanceof ProviderAvailabilityBudgetError
          ? error.reason === "unavailable"
            ? t("balanceUnavailable")
            : t("balanceIncompatible")
          : safeActionMessage(error, t("refreshError"));
      mergeError(connection.connectionId, "own", { row: message });
    } finally {
      setRefreshing(null);
    }
  }

  function applyCreditBalance(connection: ProviderSpendConnection) {
    mergeError(connection.connectionId, "credits", { app: undefined, row: undefined });
    try {
      updateValue(
        connection,
        "credits",
        "app",
        budgetFromCreditBalance(connection, credits?.walletBalanceCents ?? null),
      );
    } catch {
      mergeError(connection.connectionId, "credits", { row: t("creditBalanceUnavailable") });
    }
  }

  async function submit() {
    const nextErrors: Record<string, ConnectionErrors> = {};
    const payloads: ProviderAllocationInput[] = [];
    for (const connection of connections) {
      const value = formValues(connection);
      if (!budgetFormChanged(connection, value)) continue;
      const connectionErrors: ConnectionErrors = {};
      for (const source of ["own", "credits"] as const) {
        const app = validationMessage(connection, source, value[source].app);
        const programmatic = validationMessage(connection, source, value[source].programmatic);
        if (app || programmatic) {
          connectionErrors[source] = {
            ...(app ? { app } : {}),
            ...(programmatic ? { programmatic } : {}),
          };
        }
      }
      if (Object.keys(connectionErrors).length) {
        nextErrors[connection.connectionId] = connectionErrors;
        continue;
      }
      payloads.push(buildProviderAllocationPayload(connection, value));
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSaving(true);
    const actionErrors: Record<string, ConnectionErrors> = {};
    for (const payload of payloads) {
      try {
        await updateProviderAllocation(projectId, payload);
      } catch (error) {
        actionErrors[payload.connectionId] = {
          own: { row: safeActionMessage(error, t("saveError")) },
        };
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
      width={640}
    >
      {connections.length ? (
        <>
          <p className="m-0 text-[12.5px] leading-[1.55] text-fg-muted">
            {credits ? t("descriptionWithCredits") : t("description")}
          </p>
          <BudgetEditTable
            connections={connections}
            credits={credits}
            errors={errors}
            formValues={formValues}
            onCreditBalance={applyCreditBalance}
            onFieldBlur={validateField}
            onFieldChange={updateValue}
            onProviderBalance={(connection) => void applyProviderBalance(connection)}
            refreshing={refreshing}
            saving={saving}
            showPrimaryChip={showPrimaryChip}
          />
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
