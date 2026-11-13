"use client";
import { Button } from "@/components/ui/Button";
import { PillBadge } from "@/components/ui/Pill";
import { Tooltip } from "@/components/ui/Tooltip";
import type { ResearchedPrompt } from "@/lib/ai-research/prompt-research-projection";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import { CaretRightIcon } from "@phosphor-icons/react/dist/csr/CaretRight";
import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import { useTranslations } from "next-intl";

function ResearchIndicator({ label }: Readonly<{ label: string }>) {
  return (
    <span className="inline-flex items-center gap-1 text-ui-caption text-green-text">
      <CheckIcon weight="regular" size={12} className="shrink-0" aria-hidden />
      {label}
    </span>
  );
}

export function PromptResearchText({ prompt }: Readonly<{ prompt: ResearchedPrompt }>) {
  const t = useTranslations("projectAiTracking.research");
  return (
    <div data-research-prompt className="min-w-0 whitespace-normal break-words">
      <span>{prompt.text}</span>
      {prompt.tracked ? <PillBadge className="ml-2">{t("tracked")}</PillBadge> : null}
      {prompt.variants.length || prompt.brandMentioned ? (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          {prompt.variants.length ? (
            <Tooltip
              semantics="description"
              content={
                <ul className="m-0 grid gap-1 pl-4">
                  {prompt.variants.map((variant) => (
                    <li key={variant}>{variant}</li>
                  ))}
                </ul>
              }
            >
              <Button
                type="button"
                size="xs"
                variant="ghost"
                className="h-auto max-w-full px-0 whitespace-normal text-left text-ui-caption text-fg-muted underline decoration-dotted"
              >
                {t("merged", { count: String(prompt.variants.length) })}
              </Button>
            </Tooltip>
          ) : null}
          {prompt.brandMentioned ? <ResearchIndicator label={t("brandMentioned")} /> : null}
        </div>
      ) : null}
    </div>
  );
}
export function PromptResearchSourceCount({ prompt }: Readonly<{ prompt: ResearchedPrompt }>) {
  const t = useTranslations("projectAiTracking.research");
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span>
        {prompt.sources.length
          ? t("sourceCount", { count: prompt.sources.length })
          : t("noSources")}
      </span>
      {prompt.ownDomainCited ? <ResearchIndicator label={t("ownDomainCited")} /> : null}
    </div>
  );
}
export function PromptResearchExpand({
  prompt,
  expanded,
  onToggle,
}: Readonly<{
  prompt: ResearchedPrompt;
  expanded: boolean;
  onToggle: () => void;
}>) {
  const t = useTranslations("projectAiTracking.research");
  return (
    <Button
      size="xs"
      variant="ghost"
      className="size-8 shrink-0 p-0"
      aria-expanded={expanded}
      aria-controls={expanded ? `research-sources-${prompt.rowIndex}` : undefined}
      aria-label={t("showSources", { prompt: prompt.text })}
      onClick={onToggle}
    >
      {expanded ? (
        <CaretDownIcon weight="regular" aria-hidden size={16} />
      ) : (
        <CaretRightIcon weight="regular" aria-hidden size={16} />
      )}
    </Button>
  );
}
