import { ExternalLink } from "@/components/ui/ExternalLink";

export function CompetitorDomainLink({
  domain,
  label = domain,
}: Readonly<{ domain: string; label?: string }>) {
  return (
    <ExternalLink
      aria-label={label === domain ? domain : `${label} ${domain}`}
      className="max-w-full min-w-0 text-accent-text hover:underline [&>svg]:shrink-0"
      href={`https://${domain}`}
      title={domain}
    >
      <span className="min-w-0">
        <span className="block truncate font-semibold">{label}</span>
        {label !== domain ? (
          <span className="block truncate text-[11px] text-fg-muted">{domain}</span>
        ) : null}
      </span>
    </ExternalLink>
  );
}
