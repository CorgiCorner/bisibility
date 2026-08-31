"use client";

import { Tooltip } from "@/components/ui";
import { ArrowUpRightIcon as ArrowUpRight } from "@phosphor-icons/react";

type RankingUrlExternalLinkProps = {
  href: string;
  path: string;
};

export function RankingUrlExternalLink({ href, path }: Readonly<RankingUrlExternalLinkProps>) {
  return (
    <Tooltip content="Open ranking URL in a new tab" semantics="description">
      <a
        className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-fg hover:text-accent-text hover:underline"
        href={href}
        rel="noreferrer noopener"
        target="_blank"
      >
        <span>{path}</span>
        <ArrowUpRight aria-hidden className="ml-1 inline-block" size={12} weight="regular" />
      </a>
    </Tooltip>
  );
}
