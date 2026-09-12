import { rankTrackerKeywordLinkClassName } from "@/components/keywords/grid/keyword-link-styles";
import { ExternalLink } from "@/components/ui/ExternalLink";

export function CompetitorDomainLink({
  domain,
  label = domain,
  variant = "default",
}: Readonly<{ domain: string; label?: string; variant?: "default" | "rank-tracker" }>) {
  const rankTracker = variant === "rank-tracker";
  const url = `https://${domain}`;
  return (
    <ExternalLink
      aria-label={rankTracker ? url : label === domain ? domain : `${label} ${domain}`}
      className={`max-w-full min-w-0 ${rankTracker ? `whitespace-nowrap ${rankTrackerKeywordLinkClassName}` : "text-accent-text hover:underline"} [&>svg]:shrink-0`}
      href={url}
      title={rankTracker ? url : domain}
    >
      {rankTracker ? (
        <span className="min-w-0 truncate">{url}</span>
      ) : (
        <span className="min-w-0">
          <span className="block truncate font-semibold">{label}</span>
          {label !== domain ? (
            <span className="block truncate text-[11px] text-fg-muted">{domain}</span>
          ) : null}
        </span>
      )}
    </ExternalLink>
  );
}
