"use client";

import { EmptyState } from "@/components/ui";
import { LinkIcon as Link } from "@phosphor-icons/react";

const bullets = [
  "Runs on your own DataForSEO key, price shown before every run",
  "Snapshots cached for 24 hours - reopening and re-slicing is free",
  "Every refresh diffs against the last snapshot: new and lost links flagged",
] as const;

export function BacklinksIdleState() {
  return (
    <section aria-label="Backlinks introduction">
      <EmptyState
        bullets={[...bullets]}
        icon={<Link aria-hidden size={28} />}
        title="Point it at any domain"
      />
    </section>
  );
}
