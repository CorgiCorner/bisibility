"use client";

// The match-scope copy lives only in the tracking page's FeatureMessagesProvider, a client
// boundary. Rendering this card on the server made it read the root request config, which
// carries `shared` alone, so every `projectSettingsTracking.matchScope` key was painted raw.

import { settingsCardFrameClassName } from "@/components/settings/shell/settings-layout";
import { trackingCardGeometryClassNames } from "@/components/settings/tracking/tracking-settings-layout";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { StatusPill } from "@/components/ui/StatusPill";
import { cn } from "@/lib/ui/cn";
import { useTranslations } from "next-intl";

type MatchScopeCardProps = { domain: string | null };

// lib/providers/serp/organic-result-decision.ts:74-83 is the live SERP result matcher.
// It delegates to lib/domains/normalize.ts:12-20 for the www and subdomain rule.

export function MatchScopeCard({ domain }: Readonly<MatchScopeCardProps>) {
  const t = useTranslations("projectSettingsTracking.matchScope");
  const rows = domain
    ? [
        {
          current: false,
          description: t("primaryDescription", { domain }),
          title: t("primaryTitle"),
        },
        {
          current: true,
          description: t("allSubdomainsDescription", { domain }),
          title: t("allSubdomainsTitle"),
        },
        {
          current: false,
          description: t("urlPrefixDescription", { domain }),
          title: t("urlPrefixTitle"),
        },
      ]
    : [];
  return (
    <Card
      className={cn(settingsCardFrameClassName, trackingCardGeometryClassNames.matchScope)}
      data-settings-card=""
      data-settings-card-frame="settled"
      size="lg"
    >
      <SectionTitle>{t("title")}</SectionTitle>
      <p className="m-0 mt-1 text-[12.5px] leading-[1.55] text-fg-muted">{t("description")}</p>
      {domain ? (
        <div className="mt-5 divide-y divide-border border-y border-border">
          {rows.map((row) => (
            <div className="flex items-start justify-between gap-4 py-3" key={row.title}>
              <div className={cn("min-w-0", !row.current && "text-fg-muted")}>
                <p className="m-0 text-[13px] font-semibold">{row.title}</p>
                <p className="m-0 mt-1 text-[12px] leading-[1.55] text-fg-muted">
                  {row.description}
                </p>
              </div>
              {row.current ? (
                <StatusPill label={t("current")} showDot={false} size="sm" status="ready" />
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-control border border-dashed border-border bg-bg-sunken px-3 py-3">
          <p className="m-0 text-[13px] font-semibold text-fg">{t("noDomainTitle")}</p>
          <p className="m-0 mt-1 text-[12px] leading-[1.55] text-fg-muted">
            {t("noDomainDescription")}
          </p>
        </div>
      )}
      <p className="m-0 mt-4 text-[11.5px] leading-5 text-fg-muted">{t("roadmap")}</p>
    </Card>
  );
}
