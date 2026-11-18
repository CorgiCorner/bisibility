"use client";

import type {
  ProviderMetaLabelKey,
  ProviderMetaRow,
  ProviderMetaValueKey,
} from "@/lib/integrations/types";
import { useFormatter, useTranslations } from "next-intl";

export function metaLabel(
  key: ProviderMetaLabelKey,
  labels: ReturnType<typeof useTranslations<"projectIntegrations.meta.labels">>,
) {
  switch (key) {
    case "account":
      return labels("account");
    case "apiService":
      return labels("apiService");
    case "connectionUpdated":
      return labels("connectionUpdated");
    case "fallbackState":
      return labels("fallbackState");
    case "lastRankCheck":
      return labels("lastRankCheck");
    case "lastSync":
      return labels("lastSync");
    case "lastUsed":
      return labels("lastUsed");
    case "property":
      return labels("property");
    case "siteDomain":
      return labels("siteDomain");
    case "state":
      return labels("state");
    default: {
      const unreachable: never = key;
      return unreachable;
    }
  }
}

export function metaValue(
  key: ProviderMetaValueKey,
  values: ReturnType<typeof useTranslations<"projectIntegrations.meta.values">>,
) {
  switch (key) {
    case "disabled":
      return values("disabled");
    case "enabled":
      return values("enabled");
    case "never":
      return values("never");
    case "notConnected":
      return values("notConnected");
    case "notSelected":
      return values("notSelected");
    case "ready":
      return values("ready");
    default: {
      const unreachable: never = key;
      return unreachable;
    }
  }
}

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
      return metaLabel(row.labelKey, labels);
    },
    value(row: ProviderMetaRow) {
      if (row.valueAt) {
        return format.relativeTime(
          new Date(row.valueAt),
          row.relativeTo ? new Date(row.relativeTo) : undefined,
        );
      }
      if (row.valueKey) return metaValue(row.valueKey, values);
      return row.value ?? "";
    },
  };
}
