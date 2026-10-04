import { ExternalLink } from "@/components/ui/ExternalLink";
import { Tooltip } from "@/components/ui/Tooltip";

export function DomainOverviewRankingLink({ href }: Readonly<{ href: string }>) {
  return (
    <Tooltip
      content={<span className="block max-w-full break-all">{href}</span>}
      placement="top-start"
      semantics="description"
      wrapperClassName="w-full min-w-0"
    >
      <ExternalLink
        className="w-full min-w-0 font-sans tabular-nums text-[11.5px] text-link hover:underline [&>svg]:shrink-0"
        href={href}
      >
        <span className="truncate">{href}</span>
      </ExternalLink>
    </Tooltip>
  );
}
