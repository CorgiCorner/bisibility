import { settingsCardFrameClassName } from "@/components/settings/shell/settings-layout";
import { trackingCardGeometryClassNames } from "@/components/settings/tracking/tracking-settings-layout";
import { Card, SectionTitle, StatusPill } from "@/components/ui";
import { cn } from "@/lib/ui/cn";

type MatchScopeCardProps = { domain: string | null };

type MatchScopeRow = {
  current: boolean;
  description: string;
  title: string;
};

// lib/providers/serp/organic-result-decision.ts:74-83 is the live SERP result matcher.
// It delegates to lib/domains/normalize.ts:12-20 for the www and subdomain rule.
function matchScopeRows(domain: string): MatchScopeRow[] {
  return [
    {
      current: false,
      description: `Counts ${domain} and www.${domain} across HTTP and HTTPS. Other subdomains stay separate.`,
      title: "Primary domain + www",
    },
    {
      current: true,
      description: `Counts ${domain}, www.${domain}, docs.${domain}, app.${domain}, blog.${domain}, and any other subdomain. HTTP/HTTPS and URL paths do not change the match.`,
      title: "All subdomains",
    },
    {
      current: false,
      description: `Only counts pages under a specific path, for example ${domain}/docs/.`,
      title: "URL prefix only",
    },
  ];
}

export function MatchScopeCard({ domain }: Readonly<MatchScopeCardProps>) {
  return (
    <Card
      className={cn(settingsCardFrameClassName, trackingCardGeometryClassNames.matchScope)}
      data-settings-card=""
      data-settings-card-frame="settled"
      size="lg"
    >
      <SectionTitle>Matching scope</SectionTitle>
      <p className="m-0 mt-1 text-[12.5px] leading-[1.55] text-fg-muted">
        What a SERP result has to look like to count for this project.
      </p>
      {domain ? (
        <div className="mt-5 divide-y divide-border-soft border-y border-border-soft">
          {matchScopeRows(domain).map((row) => (
            <div className="flex items-start justify-between gap-4 py-3" key={row.title}>
              <div className={cn("min-w-0", !row.current && "text-fg-muted")}>
                <p className="m-0 text-[13px] font-semibold">{row.title}</p>
                <p className="m-0 mt-1 text-[12px] leading-[1.55] text-fg-muted">
                  {row.description}
                </p>
              </div>
              {row.current ? (
                <StatusPill label="Current" showDot={false} size="sm" status="ready" />
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-[9px] border border-dashed border-border-strong bg-bg-sunken px-3 py-3">
          <p className="m-0 text-[13px] font-semibold text-fg">Set a domain first</p>
          <p className="m-0 mt-1 text-[12px] leading-[1.55] text-fg-muted">
            Add the project domain in General to see which SERP results count as a match.
          </p>
        </div>
      )}
      <p className="m-0 mt-4 text-[11.5px] leading-5 text-fg-muted">
        Matching is fixed per project today - changing it is on the roadmap.
      </p>
    </Card>
  );
}
