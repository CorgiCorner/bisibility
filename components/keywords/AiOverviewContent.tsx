"use client";
import type { SerpFeaturePresentation } from "@/lib/checks/serp-feature-presentation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

function inline(text: string): ReactNode[] {
  // Provider markdown is displayed as React text; raw HTML is never executed.
  const clean = text.replace(/\[\[\d+\]\]\([^)]*\)/g, "");
  return clean
    .split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)]+\))/g)
    .map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**"))
        return (
          <strong key={index} className="font-semibold">
            {part.slice(2, -2)}
          </strong>
        );
      if (part.startsWith("*") && part.endsWith("*"))
        return <em key={index}>{part.slice(1, -1)}</em>;
      if (part.startsWith("`")) return part.slice(1, -1);
      const link = /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/.exec(part);
      if (link) {
        try {
          const u = new URL(link[2]);
          if (!u.username && !u.password)
            return (
              <a
                key={index}
                href={u.href}
                className="underline underline-offset-4"
                target="_blank"
                rel="noreferrer noopener"
              >
                {link[1]}
              </a>
            );
        } catch {}
      }
      return part;
    });
}
export function AiOverviewContent({ ai }: { ai: SerpFeaturePresentation["aiOverview"] }) {
  const t = useTranslations("projectRankTracker.keywordDetail.results");
  return (
    <div className="space-y-6 text-sm leading-6 [overflow-wrap:anywhere]">
      {ai.sections?.length ? (
        ai.sections.map((section, index) => {
          const lines = (section.markdown || section.text).split(/\n+/).filter(Boolean);
          return (
            <section key={index} className="space-y-3">
              {section.heading ? (
                <h3 className="m-0 text-sm font-semibold">{section.heading}</h3>
              ) : null}
              {lines.every((line) => /^[-*] /.test(line)) ? (
                <ul className="m-0 list-disc space-y-2 pl-5">
                  {lines.map((line, i) => (
                    <li key={i}>{inline(line.slice(2))}</li>
                  ))}
                </ul>
              ) : (
                lines.map((line, i) => (
                  <p className="m-0" key={i}>
                    {inline(line)}
                  </p>
                ))
              )}
            </section>
          );
        })
      ) : ai.paragraphs.length ? (
        ai.paragraphs.map((text, index) => (
          <p className="m-0" key={index}>
            {text}
          </p>
        ))
      ) : (
        <p className="m-0 text-fg-muted">{t("aiContentNotLoaded")}</p>
      )}
      {ai.sources.length ? (
        <section className="space-y-3 border-t border-border pt-4">
          <h3 className="m-0 text-sm font-semibold">{t("overviewSources")}</h3>
          <ul className="m-0 list-disc space-y-2 pl-5">
            {ai.sources.map((source) => (
              <li key={source.url}>
                <a
                  className="text-fg-muted underline underline-offset-4"
                  href={source.url}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {source.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
