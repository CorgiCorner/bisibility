"use client";

import type { ProviderMetaRow } from "@/lib/integrations/types";
import { useFormatter, useTranslations } from "next-intl";

/**
 * Resolves a provider meta row for the viewer. The row carries keys and instants, so the
 * label, the fixed values and the elapsed time are all produced in the active locale here.
 */
export function useProviderMetaCopy() {
  const labels = useTranslations("projectIntegrations.meta.labels");
  const values = useTranslations("projectIntegrations.meta.values");
  const format = useFormatter();

  return {
    label(row: ProviderMetaRow) {
      return labels(row.labelKey);
    },
    value(row: ProviderMetaRow) {
      if (row.valueAt) {
        return format.relativeTime(
          new Date(row.valueAt),
          row.relativeTo ? new Date(row.relativeTo) : undefined,
        );
      }
      if (row.valueKey) return values(row.valueKey);
      return row.value ?? "";
    },
  };
}
