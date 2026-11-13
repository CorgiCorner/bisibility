"use client";

import { DomainIconLayer } from "@/components/ui/DomainIconLayer";
import { dataLinkClassName } from "@/components/ui/data-link-styles";
import type { ResearchedPrompt } from "@/lib/ai-research/prompt-research-projection";
import { cn } from "@/lib/ui/cn";
import { buildDomainIconUrl } from "@/lib/ui/domain-icon-url";
import { useTranslations } from "next-intl";

export function PromptResearchSources({ prompt }: Readonly<{ prompt: ResearchedPrompt }>) {
  const t = useTranslations("projectAiTracking.research");
  return (
    <div className="grid min-w-0 gap-3 py-1">
      {prompt.contentTruncated ? (
        <p className="m-0 text-ui-caption text-fg-muted">{t("contentTruncated")}</p>
      ) : null}
      {prompt.sources.length ? (
        <ul className="m-0 grid list-none gap-2 p-0">
          {prompt.sources.map((source) => (
            <li
              key={source.url}
              className={cn(
                "flex min-w-0 items-baseline gap-2 text-ui-body",
                source.own && "rounded-control bg-green/5 py-1 pl-2 pr-1",
              )}
            >
              <span
                aria-hidden
                className="relative grid size-5 shrink-0 place-items-center overflow-hidden rounded-control bg-bg-sunken text-ui-caption"
              >
                {source.domain.charAt(0).toUpperCase()}
                <DomainIconLayer src={buildDomainIconUrl({ domain: source.domain })} size={32} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${dataLinkClassName} min-w-0 break-words`}
                  >
                    {source.title}
                  </a>
                  {source.own ? (
                    <span className="text-ui-caption text-green-text">{t("yourSite")}</span>
                  ) : null}
                </div>
                <span className="break-all text-ui-caption text-fg-muted">{source.domain}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-ui-body text-fg-muted">{t("fromMemory")}</p>
      )}
    </div>
  );
}
