"use client";

import type {
  AllocationFormAdapter,
  AllocationInputPolicy,
} from "@/components/usagekit/provider-allocation-editor";
import { allocationDraftValue } from "@/components/usagekit/provider-allocation-policy";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { MAX_ALLOCATION_AMOUNT } from "@/lib/provider-allocations/types";
import {
  type ProviderAllocationFormValues,
  providerAllocationFormSchema,
} from "@/lib/provider-ui/form-schema";
import type { ProviderQueryClient } from "@usagekit/react";
import type { ProviderAllocationRow } from "@usagekit/views";
import { useLocale, useTranslations } from "next-intl";
import { useRef } from "react";
import { type Resolver, useForm } from "react-hook-form";

export function allocationPolicy(row: ProviderAllocationRow): AllocationInputPolicy {
  return {
    blank: "unlimited",
    denomination: row.unit === "cents" ? "dollars" : "native",
    precision: row.unit === "cents" ? 2 : 0,
    nativePrecision: 0,
    min: "1",
    max: String(MAX_ALLOCATION_AMOUNT),
  };
}

/** Shared editor mounts own field lifetime; RHF owns validation, values and focus. */
export function useAllocationForm(
  entry: ReturnType<ProviderQueryClient["entry"]> | undefined,
  ready: boolean,
) {
  const t = useTranslations("projectSettingsUsage.provider.budgetDialog");
  const locale = useLocale();
  const reload = useRef<{
    entry: typeof entry;
    generation: number;
    epoch: number;
    requested: boolean;
  }>({ entry, generation: 0, epoch: 0, requested: false });
  // Observe the shared request receipt, including retries without retained evidence.
  if (
    reload.current.requested &&
    ready &&
    entry &&
    !entry.running &&
    entry.snapshot.state !== "loading" &&
    (entry !== reload.current.entry || entry.generation >= reload.current.generation)
  ) {
    if (
      entry.snapshot.data &&
      (entry !== reload.current.entry || entry.generation === reload.current.generation)
    )
      reload.current.epoch++;
    reload.current.requested = false;
  }
  const fieldEpochs = useRef(new Map<string, number>());
  const mounted = useRef(new Map<string, ProviderAllocationRow>());
  const nodes = useRef(new Map<string, HTMLInputElement>());
  const resolver: Resolver<ProviderAllocationFormValues> = (values, context, options) => {
    const resolve: Resolver<ProviderAllocationFormValues> = zodResolver(
      providerAllocationFormSchema([...mounted.current.values()]),
    );
    return resolve(values, context, options);
  };
  const form = useForm<ProviderAllocationFormValues>({
    defaultValues: { limits: {} },
    resolver,
    mode: "onBlur",
  });
  const values = form.watch("limits");
  function validation(message: string | undefined, row: ProviderAllocationRow) {
    if (!message) return undefined;
    if (row.unit === "customer_cents" && ["positiveUnits", "wholeUnits"].includes(message))
      return t(message === "positiveUnits" ? "positiveBudget" : "invalidBudget");
    if (message === "positiveMoney") return t("positiveBudget");
    if (message === "positiveUnits") return t("positiveUnits");
    if (message === "wholeUnits") return t("wholeUnits");
    if (message !== "tooLarge") return t("invalidDecimal");
    const maximum =
      row.unit !== "cents"
        ? new Intl.NumberFormat(locale).format(MAX_ALLOCATION_AMOUNT)
        : new Intl.NumberFormat(locale, {
            style: "currency",
            currency: "USD",
            currencyDisplay: "narrowSymbol",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }).format(MAX_ALLOCATION_AMOUNT / 100);
    return t("tooLargeBudget", { maximum });
  }
  const adapter: AllocationFormAdapter = {
    handleSubmit: (save) => form.handleSubmit(save),
    field: (row) => {
      const name = `limits.${row.id}` as const;
      const initial = allocationDraftValue(row, allocationPolicy(row));
      const registration = form.register(name);
      return {
        name,
        value: values?.[row.id] ?? initial,
        onBlur: registration.onBlur,
        error: validation(form.formState.errors.limits?.[row.id]?.message, row),
        ref: (node) => {
          registration.ref(node);
          if (!node) {
            mounted.current.delete(row.id);
            return;
          }
          mounted.current.set(row.id, row);
          if (nodes.current.get(row.id) === node) return;
          nodes.current.set(row.id, node);
          // Binding changes remount shared fields too; only a confirmed Reload discards drafts.
          if (fieldEpochs.current.get(row.id) !== reload.current.epoch) {
            fieldEpochs.current.set(row.id, reload.current.epoch);
            form.resetField(name, { defaultValue: initial });
          }
        },
        setValue: (value) =>
          void registration.onChange({ target: { name, value }, type: "change" }),
      };
    },
  };
  return {
    adapter,
    onReload: () => {
      reload.current = {
        entry,
        generation: (entry?.generation ?? 0) + 1,
        epoch: reload.current.epoch,
        requested: true,
      };
    },
  };
}
