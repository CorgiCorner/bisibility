"use client";

import { Button } from "@/components/ui/Button";
import type { AlertTargetOptions } from "@/lib/alerts/alert-data";
import type { NewRuleForm } from "@/lib/alerts/new-rule-data";
import { CheckIcon as Check } from "@phosphor-icons/react/dist/csr/Check";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/dist/csr/WarningCircle";
import { XIcon as X } from "@phosphor-icons/react/dist/csr/X";
import { useTranslations } from "next-intl";
import type { UseFormSetValue } from "react-hook-form";

const chipClass = "gap-1.5 whitespace-nowrap rounded-full font-medium";

export function ruleMarketScopeLabel(
  marketIds: readonly string[],
  markets: AlertTargetOptions["markets"],
  messages: Readonly<{ allMarkets: string; marketCount: (count: number) => string }>,
) {
  if (!marketIds.length) return messages.allMarkets;
  const selectedLabels = marketIds
    .map((marketId) => markets.find((market) => market.id === marketId)?.label)
    .filter((label): label is string => Boolean(label));
  return selectedLabels.length === 1 ? selectedLabels[0] : messages.marketCount(marketIds.length);
}

export function NewRuleMarketFields({
  marketIds,
  markets,
  setValue,
}: Readonly<{
  marketIds: string[];
  markets: AlertTargetOptions["markets"];
  setValue: UseFormSetValue<NewRuleForm>;
}>) {
  const t = useTranslations("projectAlerts.drawer");
  const scopeLabel = ruleMarketScopeLabel(marketIds, markets, {
    allMarkets: t("allMarkets"),
    marketCount: (count) => t("marketCount", { count }),
  });

  function toggle(id: string) {
    const next = marketIds.includes(id)
      ? marketIds.filter((marketId) => marketId !== id)
      : [...marketIds, id];
    setValue("marketIds", next, { shouldDirty: true, shouldValidate: true });
  }

  return (
    <section aria-label={t("marketsAria")}>
      <div className="mb-[9px] font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted">
        {t("markets")}
      </div>
      <div className="flex flex-wrap gap-[7px]">
        <Button
          size="input"
          variant="secondary"
          aria-pressed={marketIds.length === 0}
          className={`${chipClass} ${marketIds.length === 0 ? "border-accent bg-accent-soft text-fg" : "border-border-control bg-transparent text-fg"}`}
          onClick={() => setValue("marketIds", [], { shouldDirty: true })}
          type="button"
        >
          {marketIds.length === 0 ? <Check aria-hidden size={10} weight="regular" /> : null}
          {t("allMarkets")}
        </Button>
        {markets.map((market) => {
          const selected = marketIds.includes(market.id);
          return (
            <Button
              size="input"
              variant="secondary"
              aria-pressed={selected}
              className={`${chipClass} ${selected ? "border-accent bg-accent-soft text-fg" : "border-border-control bg-transparent text-fg"}`}
              key={market.id}
              onClick={() => toggle(market.id)}
              title={market.canonicalKey}
              type="button"
            >
              {selected ? <Check aria-hidden size={10} weight="regular" /> : null}
              {market.label}
            </Button>
          );
        })}
      </div>
      <p className="m-0 mt-[9px] font-sans tabular-nums text-[10.5px] leading-[1.5] text-fg-muted">
        {t("marketScope", { scope: scopeLabel })}
      </p>
    </section>
  );
}

export function RulePreview({
  children,
  heading,
}: Readonly<{ children: string; heading?: string }>) {
  const t = useTranslations("projectAlerts.drawer");

  return (
    <section>
      <div className="mb-[9px] font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted">
        {heading ?? t("preview")}
      </div>
      <div className="rounded-control border border-border bg-bg-sunken px-[15px] py-3.5 text-[13.5px] leading-[1.55]">
        {children}
      </div>
    </section>
  );
}

export function CurrentRulePreview({
  heading,
  projectDomain,
  values,
  targets,
}: Readonly<{
  heading?: string;
  projectDomain?: string | null;
  values: NewRuleForm;
  targets: AlertTargetOptions;
}>) {
  const t = useTranslations("projectAlerts.drawer");
  const choices = values.targetType === "tag" ? targets.tags : targets.keywords;
  const targetScope =
    values.targetType === "all"
      ? t("scopeAll")
      : values.targetIds
          .map((id) => choices.find((item) => item.id === id)?.label ?? t("chooseTarget"))
          .join(", ") || t("chooseTarget");
  const markets = values.marketIds.length
    ? values.marketIds
        .map((id) => targets.markets.find((market) => market.id === id)?.label ?? t("chooseTarget"))
        .join(", ")
    : t("allMarkets");
  const topN = Number(values.topN);
  return (
    <RulePreview heading={heading}>
      {t("templatePreview", {
        condition: values.conditionType,
        domain: projectDomain ?? targets.projectDomain ?? t("defaultProjectDomain"),
        topN: Number.isFinite(topN) && topN > 0 ? String(topN) : "?",
        nextPosition: Number.isFinite(topN) && topN > 0 ? String(topN + 1) : "?",
        dropPositions: String(values.dropPositions || "?"),
        thresholdPosition: String(values.thresholdPosition || "?"),
        changePct: String(values.changePct || "?"),
        competitorDomain: values.competitorDomain || "?",
        serpFeature: values.serpFeature || "?",
        targets: targetScope,
        markets,
      })}
    </RulePreview>
  );
}

export function RuleSaveStatus({
  actionError,
  actionWarning,
  persistedRule,
  projectDomain,
  savedHeading,
  targets,
}: Readonly<{
  actionError: string | null;
  actionWarning: string | null;
  persistedRule: NewRuleForm | null;
  projectDomain?: string | null;
  savedHeading: string;
  targets: AlertTargetOptions;
}>) {
  return (
    <>
      {persistedRule ? (
        <CurrentRulePreview
          heading={savedHeading}
          projectDomain={projectDomain}
          targets={targets}
          values={persistedRule}
        />
      ) : null}
      <div className="h-14 overflow-y-auto" data-testid="alert-rule-action-error">
        {actionError ? (
          <p
            className="m-0 flex items-start gap-1.5 font-sans tabular-nums text-[11.5px] text-red-text"
            role="alert"
          >
            <X aria-hidden className="mt-0.5 shrink-0" size={12} weight="regular" />
            {actionError}
          </p>
        ) : null}
      </div>
      {actionWarning ? (
        <p className="m-0 flex items-start gap-1.5 font-sans tabular-nums text-[11.5px] text-yellow-text">
          <WarningCircle aria-hidden className="mt-0.5 shrink-0" size={12} weight="regular" />
          {actionWarning}
        </p>
      ) : null}
    </>
  );
}
