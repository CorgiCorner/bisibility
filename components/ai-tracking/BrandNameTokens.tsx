"use client";

import { Button } from "@/components/ui/Button";
import { InlineToken } from "@/components/ui/InlineToken";
import { Tooltip } from "@/components/ui/Tooltip";
import { useTranslations } from "next-intl";

export function BrandNameTokens({
  canWrite,
  domainSuggestion,
  fixed,
  keywordSuggestions,
  names,
  onAddSuggestion,
  onRemove,
  unavailable = [],
}: Readonly<{
  canWrite: boolean;
  domainSuggestion: string | null;
  fixed: readonly string[];
  keywordSuggestions: readonly string[];
  names: readonly string[];
  onAddSuggestion: (name: string) => void;
  onRemove: (name: string) => void;
  unavailable?: readonly string[];
}>) {
  const t = useTranslations("projectAiTracking.brandNames");
  const taken = new Set([...fixed, ...names, ...unavailable].map((name) => name.toLowerCase()));
  const keywords = keywordSuggestions.filter((name) => !taken.has(name.toLowerCase()));
  const stem =
    domainSuggestion && !taken.has(domainSuggestion.toLowerCase()) ? domainSuggestion : null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {fixed.map((name) => (
        <span key={`fixed:${name}`} title={t("fixedName")}>
          <InlineToken value={name} />
        </span>
      ))}
      {names.map((name) => (
        <InlineToken
          key={`name:${name}`}
          onDismiss={canWrite ? () => onRemove(name) : undefined}
          value={name}
        />
      ))}
      {keywords.map((name) => (
        <Tooltip content={t("suggestionHint")} key={`keyword:${name}`} semantics="description">
          <Button
            className="border-dashed"
            disabled={!canWrite}
            onClick={() => onAddSuggestion(name)}
            size="xs"
            type="button"
            variant="outline"
          >
            {name}
          </Button>
        </Tooltip>
      ))}
      {stem ? (
        <Button
          aria-label={t("addSuggestion", { name: stem })}
          className="border-dashed"
          disabled={!canWrite}
          onClick={() => onAddSuggestion(stem)}
          size="xs"
          type="button"
          variant="outline"
        >
          {stem}
        </Button>
      ) : null}
    </div>
  );
}
