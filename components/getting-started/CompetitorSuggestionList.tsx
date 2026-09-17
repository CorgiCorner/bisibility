"use client";

import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import type { CompetitorSuggestionEvidence } from "@/lib/getting-started/setup-steps";
import { useTranslations } from "next-intl";

type Props = {
  suggestions: readonly CompetitorSuggestionEvidence[];
  selectedDomains: ReadonlySet<string>;
  disabled: boolean;
  onToggle: (domain: string, checked: boolean) => void;
  onDismiss: (domain: string) => void;
};

export function CompetitorSuggestionList({
  suggestions,
  selectedDomains,
  disabled,
  onToggle,
  onDismiss,
}: Readonly<Props>) {
  const t = useTranslations("projectGettingStarted.competitors.suggestions");
  const groups = [
    {
      title: t("suggestedTitle"),
      description: t("suggestedDescription"),
      rows: suggestions.filter((item) => !item.kind || item.kind === "competitor"),
    },
    {
      title: t("otherTitle"),
      description: t("otherDescription"),
      rows: suggestions.filter((item) => item.kind === "other" || item.kind === "platform"),
    },
  ];
  return (
    <div className="mt-3 max-h-[min(400px,50dvh)] space-y-4 overflow-y-auto">
      {groups
        .filter((group) => group.rows.length > 0)
        .map((group) => (
          <section key={group.title} aria-label={group.title}>
            <h3 className="m-0 text-[13px] font-semibold">{group.title}</h3>
            <p className="mt-1 mb-2 text-[12px] text-fg-muted">{group.description}</p>
            <div className="rounded-card border border-border">
              {group.rows.map((suggestion) => (
                <div
                  className="flex items-center gap-3 border-border border-t p-3 first:border-t-0"
                  key={suggestion.domain}
                >
                  <div className="min-w-0 flex-1">
                    <Checkbox
                      checked={selectedDomains.has(suggestion.domain)}
                      disabled={disabled}
                      label={suggestion.domain}
                      labelClassName="break-all"
                      onChange={(event) => onToggle(suggestion.domain, event.target.checked)}
                    />
                    <p className="m-0 mt-1 pl-7 text-[11px] leading-4 text-fg-muted">
                      {(() => {
                        const coverage = t("evidence", suggestion);
                        if (suggestion.kind === "platform") return t("platform", { coverage });
                        if (suggestion.kind === "other") return t("limited", { coverage });
                        return coverage;
                      })()}
                    </p>
                  </div>
                  <Button
                    disabled={disabled}
                    onClick={() => onDismiss(suggestion.domain)}
                    size="xs"
                    type="button"
                    variant="ghost"
                  >
                    {t("remove")}
                  </Button>
                </div>
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}
