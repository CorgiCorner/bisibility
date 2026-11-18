"use client";

import type { RunView } from "@/lib/assistant/wire";
import { ACTIVE_RUN_STATUSES } from "@/lib/assistant/wire";
import { useLocale, useTranslations } from "next-intl";
import { money } from "./funding-format";

/**
 * Tokens and, for Credits, the amount a finished run was charged. A stopped or cut-off answer is
 * charged an estimate, marked as such until a provider-reported correction makes it exact.
 */
export function RunCost({ run }: Readonly<{ run: RunView }>) {
  const t = useTranslations("assistant");
  const locale = useLocale();
  const usage = run.usage;
  if (!usage || ACTIVE_RUN_STATUSES.includes(run.status)) return null;
  if (!usage.inputTokens && !usage.outputTokens && usage.chargedCents === null) return null;
  const estimated = usage.certainty === "estimated";
  const tokens = { input: String(usage.inputTokens), output: String(usage.outputTokens) };
  const amount = usage.chargedCents === null ? null : money(locale, usage.chargedCents);
  return (
    <p className="text-xs text-fg-muted" data-run-cost={estimated ? "estimated" : usage.certainty}>
      {t("tokens", tokens)}
      {amount === null
        ? estimated
          ? ` · ${t("estimate")}`
          : null
        : ` · ${t(estimated ? "chargedEstimate" : "charged", { amount })}`}
    </p>
  );
}
